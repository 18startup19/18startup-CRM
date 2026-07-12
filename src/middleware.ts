import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// If a request arrives on the "pay" subdomain (e.g. pay.18startup.com) for a
// URL that isn't a buyer-payment path, redirect it to the CRM console on the
// main domain. Keeps `pay.<...>` scoped to what buyers should ever see:
// only /pay/[id] and its supporting /api/pay/[id]/create-order endpoint.
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
  const allowed =
    path.startsWith("/pay/") ||
    path.startsWith("/api/pay/") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico";
  if (allowed) return NextResponse.next();

  // Anything else on pay.<...> gets sent to the CRM console at the same path.
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
