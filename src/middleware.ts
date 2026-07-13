import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Traffic on the "pay" subdomain (e.g. pay.18startup.com) is scoped to
// buyers only. Three cases:
//   1. /pay/<id> and /api/pay/<id>/... → pass through unchanged.
//   2. /<slug> (anything that looks like a slug) → REWRITE to /pay/<slug>,
//      so buyers see the clean URL pay.<...>/<slug> while Next still hits
//      the /pay/[id] route internally. The browser address bar stays clean.
//   3. Anything else (/, /admin, /leads, /signin, etc.) → REDIRECT to the
//      CRM console on the main domain (crm.<...>/<path>).
//
// Config:
//   NEXT_PUBLIC_PAY_DOMAIN=pay.18startup.com   ← the pay subdomain
//   NEXT_PUBLIC_CRM_DOMAIN=crm.18startup.com   ← main CRM console
// If either env is missing the middleware is a no-op — safe to deploy first,
// configure DNS + envs at your own pace.

export function middleware(req: NextRequest) {
  const payDomain = process.env.NEXT_PUBLIC_PAY_DOMAIN?.trim();
  const crmDomain = process.env.NEXT_PUBLIC_CRM_DOMAIN?.trim();
  if (!payDomain || !crmDomain) return NextResponse.next();

  const host = req.headers.get("host")?.toLowerCase() ?? "";
  if (host !== payDomain.toLowerCase()) return NextResponse.next();

  const path = req.nextUrl.pathname;

  // Case 1: already targeting a buyer-facing route / API. Pass through.
  // /pay/* → payment pages, /e/* → event landing + checkin, plus the
  // matching /api/* endpoints.
  if (
    path.startsWith("/pay/") ||
    path.startsWith("/api/pay/") ||
    path.startsWith("/e/") ||
    path.startsWith("/api/e/") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Case 2: single-segment slug-shaped path — rewrite to /pay/<slug> so
  // Next serves the buyer-facing page but the browser URL stays clean.
  // Allows lowercase alphanumeric + dashes + underscores, plus UUID for
  // legacy links. Anything else (multi-segment paths, weird chars) falls
  // through to the redirect.
  const slugMatch = path.match(/^\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,80})$/);
  if (slugMatch) {
    const url = req.nextUrl.clone();
    url.pathname = `/pay/${slugMatch[1]}`;
    return NextResponse.rewrite(url);
  }

  // Case 3: anything else on pay.<...> gets sent to the CRM console at the
  // same path — /admin, /leads, and other console routes.
  const target = new URL(req.nextUrl.toString());
  target.host = crmDomain;
  target.protocol = "https:";
  return NextResponse.redirect(target, 308);
}

export const config = {
  // Skip Next's static assets and the webhook endpoint (webhook is safe on
  // either domain, and we don't want to add latency to it).
  matcher: ["/((?!_next/static|_next/image|api/webhooks).*)"],
};
