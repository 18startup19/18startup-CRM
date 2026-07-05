import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { intakeLead } from "@/lib/intake";

// Provider-neutral telephony webhook. Handles both:
//  - call status updates (link back to an existing communications row via CallSid)
//  - missed-call intakes (auto-create a lead from the caller number)
//
// Payload conventions supported (whichever the provider sends):
//   { CallSid, CallFrom, CallTo, DialCallStatus, DialCallDuration, RecordingUrl }
//   { event: "MISSED_CALL", CallFrom }
export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};
  if (ct.includes("application/json")) {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } else {
    const fd = await req.formData().catch(() => null);
    if (fd) fd.forEach((v, k) => (body[k] = String(v)));
  }

  const event = String(body.event ?? "").toUpperCase();
  const from = String(body.CallFrom ?? body.From ?? body.caller ?? "").trim();

  // Missed-call → lead
  if (event === "MISSED_CALL" || event === "MISSED") {
    if (!from) return Response.json({ ok: false, error: "no caller" }, { status: 400 });
    const res = await intakeLead({
      name: from,
      phone: from,
      source: "missed_call",
      custom: { via: "telephony_webhook", raw: body },
    });
    return Response.json({ ok: res.ok, leadId: res.leadId });
  }

  // Call status update — try to reconcile with an existing outbound row.
  const providerCallId = String(body.CallSid ?? body.call_id ?? "");
  if (!providerCallId) return Response.json({ ok: true, ignored: true });

  const status = String(body.DialCallStatus ?? body.status ?? "").toLowerCase();
  const duration = body.DialCallDuration
    ? Number(body.DialCallDuration)
    : body.duration
      ? Number(body.duration)
      : null;
  const recordingUrl = (body.RecordingUrl ?? body.recording_url ?? null) as string | null;

  const sb = supabaseAdmin();
  await sb
    .from("communications")
    .update({
      status: status || "answered",
      duration_seconds: duration,
      recording_url: recordingUrl,
    })
    .eq("provider_message_id", providerCallId);

  return Response.json({ ok: true });
}
