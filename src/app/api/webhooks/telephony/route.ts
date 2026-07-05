import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { intakeLead } from "@/lib/intake";

// Provider-neutral telephony webhook. Handles both:
//  - call status updates (link back to an existing communications row via the
//    provider's unique call id)
//  - missed-call intakes (auto-create a lead from the caller number)
//
// Payload conventions supported:
//   Twilio/Exotel-style:
//     { CallSid, CallFrom, CallTo, DialCallStatus, DialCallDuration, RecordingUrl }
//   CallerDesk-style (see docs.callerdesk.io):
//     { unique_id, call_id, caller_id, receiver_id, virtual_number,
//       call_status, duration, recording_url, event }
//   Missed-call:
//     { event: "MISSED_CALL", CallFrom | caller_id }

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};
  if (ct.includes("application/json")) {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } else {
    const fd = await req.formData().catch(() => null);
    if (fd) fd.forEach((v, k) => (body[k] = String(v)));
  }

  const rawEvent = String(body.event ?? body.type ?? body.EventType ?? "").toLowerCase();
  const rawStatus = String(
    body.DialCallStatus ??
      body.call_status ??
      body.status ??
      body.CallStatus ??
      "",
  ).toLowerCase();

  const from = String(
    body.CallFrom ??
      body.From ??
      body.caller ??
      body.caller_id ??
      body.customer_number ??
      "",
  ).trim();

  // Missed-call → lead. CallerDesk sends event names like "missed" or
  // "missed_call", others may use "MISSED".
  if (rawEvent.includes("missed") || rawStatus === "missed" || rawStatus === "no-answer") {
    if (from) {
      const res = await intakeLead({
        name: from,
        phone: from,
        source: "missed_call",
        custom: { via: "telephony_webhook", raw: body },
      });
      // Even for missed calls we still want to reconcile the outbound row if it
      // exists (so status flips from "queued" to "missed"). Fall through.
      if (!hasCallId(body)) {
        return Response.json({ ok: res.ok, leadId: res.leadId });
      }
    }
  }

  // Call status update — try to reconcile with an existing outbound row.
  const providerCallId = String(
    body.CallSid ??
      body.call_id ??
      body.unique_id ??
      body.uniqueId ??
      body.campid ??
      body.campId ??
      body.camp_id ??
      "",
  ).trim();
  if (!providerCallId) return Response.json({ ok: true, ignored: true });

  const duration =
    body.DialCallDuration != null
      ? Number(body.DialCallDuration)
      : body.duration != null
        ? Number(body.duration)
        : body.call_duration != null
          ? Number(body.call_duration)
          : null;

  const recordingUrl =
    (body.RecordingUrl as string | undefined) ??
    (body.recording_url as string | undefined) ??
    (body.recordingUrl as string | undefined) ??
    null;

  const normalizedStatus =
    rawStatus === "completed" || rawStatus === "answered" || rawStatus === "success"
      ? "answered"
      : rawStatus === "missed" || rawStatus === "no-answer" || rawStatus === "no_answer"
        ? "missed"
        : rawStatus === "busy"
          ? "busy"
          : rawStatus === "failed"
            ? "failed"
            : rawStatus || "answered";

  const sb = supabaseAdmin();
  await sb
    .from("communications")
    .update({
      status: normalizedStatus,
      duration_seconds: duration,
      recording_url: recordingUrl,
    })
    .eq("provider_message_id", providerCallId);

  return Response.json({ ok: true });
}

function hasCallId(body: Record<string, unknown>): boolean {
  return Boolean(body.CallSid ?? body.call_id ?? body.unique_id ?? body.uniqueId);
}

export function GET() {
  return Response.json({ ok: true, endpoint: "telephony-webhook" });
}
