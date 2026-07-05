import { NextRequest } from "next/server";
import { intakeLead } from "@/lib/intake";

// Facebook Lead Ads webhook. Meta sends a subscription verify GET first
// (with hub.challenge), then POSTs lead notifications. The actual lead data
// has to be fetched from the Graph API using the leadgen_id; we forward the
// raw payload into `custom` for now — plug in a Graph fetch when the app
// credentials are provisioned.
const VERIFY_TOKEN = process.env.FB_LEADGEN_VERIFY_TOKEN ?? "";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ ok: false }, { status: 400 });

  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const c of changes) {
      const v = c.value ?? {};
      // Without Graph API fetch, we only have leadgen_id + form_id. Store a
      // stub lead so the ops team knows to enrich.
      await intakeLead({
        name: `FB lead ${v.leadgen_id ?? "unknown"}`,
        source: "fb_ads",
        custom: {
          fb_leadgen_id: v.leadgen_id,
          fb_form_id: v.form_id,
          fb_ad_id: v.ad_id,
          created_time: v.created_time,
        },
      });
    }
  }
  return Response.json({ ok: true });
}
