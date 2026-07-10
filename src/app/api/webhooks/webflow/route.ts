import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { intakeLead } from "@/lib/intake";

// Webflow form_submission webhook. Webflow signs the request as
//   HMAC-SHA256(timestamp + ":" + rawBody)  →  x-webflow-signature
// with the webhook secret set when the webhook was registered on the site.
// The timestamp is in x-webflow-timestamp. We check both, plus reject
// requests older than 5 minutes to blunt replay attacks.
//
// The payload's `data` object holds the flat form field values keyed by
// the field name the site owner set in Webflow. Common patterns:
//   { "Name": "...", "Email": "...", "Phone": "...", "utm_source": "..." }
// We pick the standard name/email/phone fields (case-insensitive) and put
// everything else in the lead's `custom` bag.

const MAX_AGE_MS = 5 * 60 * 1000;

const NAME_KEYS = ["name", "full name", "fullname", "your name", "first name"];
const EMAIL_KEYS = ["email", "email address", "your email"];
const PHONE_KEYS = ["phone", "phone number", "mobile", "whatsapp"];

export async function POST(req: NextRequest) {
  const secret = process.env.WEBFLOW_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "WEBFLOW_WEBHOOK_SECRET not configured on CRM." },
      { status: 500 },
    );
  }

  const raw = await req.text();
  const timestamp = req.headers.get("x-webflow-timestamp") ?? "";
  const provided = req.headers.get("x-webflow-signature") ?? "";

  if (!timestamp || !provided) {
    return Response.json(
      { ok: false, error: "missing signature headers" },
      { status: 401 },
    );
  }

  const tsMs = Number(timestamp);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > MAX_AGE_MS) {
    return Response.json(
      { ok: false, error: "stale request" },
      { status: 401 },
    );
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:${raw}`)
    .digest("hex");
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: WebflowSubmitBody;
  try {
    body = JSON.parse(raw) as WebflowSubmitBody;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const fields = body.payload?.data ?? body.data ?? {};
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    lowered[k.toLowerCase().trim()] = String(v);
  }

  const name = pick(lowered, NAME_KEYS) || "Webflow lead";
  const email = pick(lowered, EMAIL_KEYS);
  const phone = pick(lowered, PHONE_KEYS);

  const known = new Set([
    ...NAME_KEYS,
    ...EMAIL_KEYS,
    ...PHONE_KEYS,
  ]);
  const custom: Record<string, unknown> = {
    webflow_form_name:
      body.payload?.name ?? body.name ?? body.payload?.formName ?? null,
    webflow_site_id: body.payload?.siteId ?? body.siteId ?? null,
    submitted_at: body.payload?.submittedAt ?? body.submittedAt ?? null,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (known.has(k.toLowerCase().trim())) continue;
    custom[k] = v;
  }

  // Routing key = the Webflow form's name (Contact form / Founders Workshop
  // etc). Admins create one routing rule per form in Admin → Lead Routing
  // to send each to its own stage.
  const routingKey =
    (body.payload?.name as string | undefined) ??
    (body.payload?.formName as string | undefined) ??
    body.name ??
    null;

  const res = await intakeLead({
    name,
    phone: phone || null,
    email: email || null,
    source: "webflow",
    routingKey,
    custom,
  });
  if (!res.ok) {
    return Response.json({ ok: false, error: res.error }, { status: 500 });
  }
  return Response.json({
    ok: true,
    action: res.merged ? "merged" : "created",
    lead_id: res.leadId,
  });
}

function pick(o: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (o[k]) return o[k];
  }
  return "";
}

interface WebflowSubmitBody {
  // Webflow's payload envelope varies between the v1 and v2 form webhook
  // shapes; accept either. Both put form values under `.data`.
  name?: string;
  siteId?: string;
  submittedAt?: string;
  data?: Record<string, unknown>;
  payload?: {
    name?: string;
    formName?: string;
    siteId?: string;
    submittedAt?: string;
    data?: Record<string, unknown>;
  };
}
