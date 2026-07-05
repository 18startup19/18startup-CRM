import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePhoneDigits } from "@/lib/utils";
import { runWorkflows } from "@/lib/workflows";
import type { LeadRow } from "@/lib/database.types";

// Twilio's WhatsApp inbound webhook. POSTs `application/x-www-form-urlencoded`.
// Set this URL on the WhatsApp Sender in Twilio Console:
//   https://<your-host>/api/webhooks/twilio-whatsapp
// Twilio sends fields like: MessageSid, From (whatsapp:+91xxx), To, Body,
// NumMedia, MediaUrl0, ProfileName. We use From + Body to find or create a
// lead and drop an inbound communication row.

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  let form: URLSearchParams;
  if (contentType.includes("application/x-www-form-urlencoded")) {
    form = new URLSearchParams(await req.text());
  } else {
    return NextResponse.json({ error: "Unexpected content type." }, { status: 400 });
  }

  const messageSid = form.get("MessageSid") ?? form.get("SmsMessageSid") ?? "";
  const fromRaw = form.get("From") ?? "";
  const toRaw = form.get("To") ?? "";
  const body = form.get("Body") ?? "";
  const profileName = form.get("ProfileName") ?? "";
  const numMedia = Number(form.get("NumMedia") ?? 0);

  if (!fromRaw) {
    return NextResponse.json({ error: "Missing From." }, { status: 400 });
  }

  // Twilio prefixes WhatsApp numbers with "whatsapp:" — strip that so we can
  // match against the plain lead.phone (which may or may not include the +).
  const fromPhone = fromRaw.replace(/^whatsapp:/i, "");
  const fromDigits = normalizePhoneDigits(fromPhone);

  const sb = supabaseAdmin();

  // Find lead by digit-normalized phone. We can't index a computed column
  // trivially without a migration, so do a coarse ilike prefilter then match.
  const { data: candidates } = await sb
    .from("leads")
    .select("*")
    .not("phone", "is", null)
    .ilike("phone", `%${fromDigits.slice(-10)}%`)
    .limit(20);

  let lead =
    (candidates ?? []).find(
      (l) => normalizePhoneDigits(l.phone) === fromDigits,
    ) ?? null;

  // No matching lead — create one so we don't drop the message on the floor.
  if (!lead) {
    const name = profileName?.trim() || fromPhone;
    const { data: firstStage } = await sb
      .from("lead_stages")
      .select("id")
      .eq("kind", "open")
      .eq("is_archived", false)
      .order("position")
      .limit(1)
      .maybeSingle();
    const { data: created, error } = await sb
      .from("leads")
      .insert({
        name,
        phone: fromPhone,
        source: "api",
        stage_id: firstStage?.id ?? null,
        custom: { whatsapp_first_contact: true },
      })
      .select("*")
      .single();
    if (error || !created) {
      console.error("Failed to auto-create lead for inbound WA:", error?.message);
      return NextResponse.json({ ok: false, reason: "lead-create-failed" });
    }
    lead = created;
    await sb.from("lead_activities").insert({
      lead_id: lead!.id,
      kind: "created",
      payload: { source: "whatsapp-inbound", profile_name: profileName },
    });
  }

  // Insert the inbound message
  const attachments: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = form.get(`MediaUrl${i}`);
    if (url) attachments.push(url);
  }

  const { error: insertErr } = await sb.from("communications").insert({
    lead_id: lead!.id,
    channel: "whatsapp",
    direction: "inbound",
    status: "delivered",
    body,
    provider: "twilio",
    provider_message_id: messageSid || null,
    attachments,
  });

  if (insertErr) {
    console.error("Failed to insert inbound WA comm:", insertErr.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Fire workflows for anyone listening to inbound WA (best-effort).
  try {
    // Note: no session here since this is unauthenticated. runWorkflows expects
    // a session object; passing a synthetic one keeps things simple.
    await runWorkflows("field_changed", lead as LeadRow, {
      session: {
        userId: lead!.owner_id ?? "system",
        email: "system@internal",
        name: "System",
        role: "member",
      },
    });
  } catch (err) {
    console.error("Workflow run for inbound WA failed:", err);
  }

  // Reply with TwiML — even an empty <Response/> is required to acknowledge.
  return new NextResponse("<Response/>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

// Twilio doesn't GET this route, but return a friendly 200 so browsers hitting
// the URL don't 404 the health check.
export function GET() {
  return NextResponse.json({ ok: true, endpoint: "twilio-whatsapp-inbound" });
}
