import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { intakeLead } from "@/lib/intake";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { LeadFieldMappingRow } from "@/lib/database.types";

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
  // Cache raw field names so the Lead Routing UI can pre-populate the
  // mapping dropdown even before an admin sets up the API-based schema
  // fetch. Reflects the ACTUAL last-seen shape from Webflow.
  const rawFieldNames = Object.keys(fields);

  // Routing key = the Webflow form's name (Contact form / Founders Workshop
  // etc). Admins create one routing rule per form in Admin → Lead Routing
  // to send each to its own stage.
  const routingKey =
    (body.payload?.name as string | undefined) ??
    (body.payload?.formName as string | undefined) ??
    body.name ??
    null;

  // Look up per-form mappings admins have configured. If we have any,
  // apply them literally: whatever the admin said the field maps to is
  // where it lands. Fall back to the legacy case-insensitive heuristic
  // for fields with no explicit mapping (backward compat).
  const sb = supabaseAdmin();
  const { data: mappingRows } = routingKey
    ? await sb
        .from("lead_field_mappings")
        .select("external_field,crm_target")
        .eq("source", "webflow")
        .eq("form_key", routingKey)
    : { data: [] as Pick<LeadFieldMappingRow, "external_field" | "crm_target">[] };
  const mappings = new Map<string, string>();
  for (const m of (mappingRows ?? []) as Pick<
    LeadFieldMappingRow,
    "external_field" | "crm_target"
  >[]) {
    mappings.set(m.external_field, m.crm_target);
  }

  // Build name / email / phone / custom bag by walking every incoming
  // field through the mapping-then-heuristic pipeline.
  const nameParts: string[] = [];
  let email = "";
  let phone = "";
  const custom: Record<string, unknown> = {
    webflow_form_name: routingKey,
    webflow_site_id: body.payload?.siteId ?? body.siteId ?? null,
    submitted_at: body.payload?.submittedAt ?? body.submittedAt ?? null,
    __raw_fields: rawFieldNames,
  };

  for (const [rawKey, rawVal] of Object.entries(fields)) {
    if (rawVal == null) continue;
    const value = String(rawVal).trim();
    if (!value) continue;

    // Priority 1: explicit admin mapping wins.
    const mapped = mappings.get(rawKey);
    if (mapped === "ignore") continue;
    if (mapped === "name") {
      nameParts.push(value);
      continue;
    }
    if (mapped === "email") {
      email = email || value;
      continue;
    }
    if (mapped === "phone") {
      phone = phone || value;
      continue;
    }
    if (mapped && mapped.startsWith("custom.")) {
      custom[mapped.slice(7)] = value;
      continue;
    }

    // Priority 2: legacy heuristic on unmapped fields — matches common
    // Webflow field labels. Admins can override any of these by adding
    // an explicit mapping in the UI.
    const low = rawKey.toLowerCase().trim();
    if (NAME_KEYS.includes(low)) {
      nameParts.push(value);
      continue;
    }
    if (EMAIL_KEYS.includes(low)) {
      email = email || value;
      continue;
    }
    if (PHONE_KEYS.includes(low)) {
      phone = phone || value;
      continue;
    }
    // Priority 3: unknown → dump into custom under its raw key.
    custom[rawKey] = value;
  }

  const name = nameParts.join(" ").trim() || "Webflow lead";

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
