import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { intakeLead } from "@/lib/intake";

// Provider-neutral telephony webhook. CallerDesk-specific behaviour: they fire
// two kinds of events per call —
//   1. `type: "live_call"` — mid-call state transitions ("Transferring Call to
//      Agent", "Answered by Agent", "Dialing Customer", etc). No duration or
//      recording URL yet.
//   2. `type: "call_report"` — fires once at call end. Has EndTime, duration,
//      recording URL.
// Both events carry the same CallSid / campid, which we saved as
// provider_message_id when we initiated the call. We patch only the fields
// that are present in each event so a late-arriving live_call can't wipe out
// the duration + recording from a call_report.

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  let body: Record<string, unknown> = {};
  if (ct.includes("application/json")) {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } else if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    const fd = await req.formData().catch(() => null);
    if (fd) fd.forEach((v, k) => (body[k] = String(v)));
  } else {
    const search = req.nextUrl.searchParams;
    search.forEach((v, k) => (body[k] = v));
    if (Object.keys(body).length === 0) {
      body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    }
  }

  // eslint-disable-next-line no-console
  console.log("[telephony-webhook] payload:", JSON.stringify(body));

  const rawEvent = String(body.event ?? body.type ?? body.EventType ?? "").toLowerCase();
  const rawStatus = String(
    body.DialCallStatus ??
      body.call_status ??
      body.status ??
      body.CallStatus ??
      body.Status ??
      "",
  ).trim();
  const statusLower = rawStatus.toLowerCase();

  const from = String(
    body.CallFrom ??
      body.From ??
      body.caller ??
      body.caller_id ??
      body.customer_number ??
      body.SourceNumber ??
      "",
  ).trim();

  // Missed-call intake path — CallerDesk uses statuses like "Missed",
  // "Not Answered", or events with "missed" in the name.
  const isMissedEvent =
    rawEvent.includes("missed") ||
    statusLower === "missed" ||
    statusLower === "no-answer" ||
    statusLower === "not answered" ||
    statusLower === "no_answer";

  if (isMissedEvent) {
    if (from) {
      const res = await intakeLead({
        name: from,
        phone: from,
        source: "missed_call",
        custom: { via: "telephony_webhook", raw: body },
      });
      if (!hasCallId(body)) {
        return Response.json({ ok: res.ok, leadId: res.leadId });
      }
    }
  }

  // Reconcile with our stored communications row using the shared CallerDesk
  // identifier. Both live_call and call_report events include CallSid = campid.
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

  const durationCandidates = [
    body.DialCallDuration,
    body.duration,
    body.call_duration,
    body.callDuration,
    body.CallDuration,
    body.Duration,
    body.talktime,
    body.talkTime,
    body.TalkTime,
    body.total_duration,
    body.totalDuration,
    body.answered_duration,
    body.AnsweredDuration,
    body.call_time,
  ];
  const durationRaw = durationCandidates.find(
    (v) => v != null && v !== "" && !Number.isNaN(Number(v)),
  );
  const duration = durationRaw != null ? Number(durationRaw) : null;

  const recordingUrl =
    (asString(body.RecordingUrl) ||
      asString(body.recording_url) ||
      asString(body.recordingUrl) ||
      asString(body.recording) ||
      asString(body.recording_link) ||
      asString(body.recordingLink) ||
      asString(body.recording_file) ||
      asString(body.RecordingFile) ||
      asString(body.call_recording) ||
      asString(body.callrecording) ||
      asString(body.CallRecordingUrl) ||
      asString(body.audio_url) ||
      null) as string | null;

  const endTime = asString(body.EndTime) || asString(body.end_time) || "";
  const isCallReport =
    rawEvent === "call_report" ||
    rawEvent === "app_call_report" ||
    rawEvent.includes("call_report") ||
    rawEvent === "callreport" ||
    (endTime !== "" && endTime !== "0000-00-00 00:00:00");

  // Map CallerDesk-specific status labels ("Transferring Call to Agent",
  // "Answered by Agent", "Answered by Customer", "Missed", "Busy", etc) to our
  // normalized set. Anything with "answer" in it counts as answered.
  const normalizedStatus = (() => {
    if (statusLower.includes("answer")) return "answered";
    if (
      statusLower === "completed" ||
      statusLower === "success" ||
      statusLower === "call ended"
    ) {
      return "answered";
    }
    if (statusLower.includes("miss") || statusLower.includes("no-answer") || statusLower === "not answered") {
      return "missed";
    }
    if (statusLower.includes("busy")) return "busy";
    if (statusLower.includes("fail")) return "failed";
    if (statusLower.includes("transferring") || statusLower.includes("dial")) {
      return "queued";
    }
    return statusLower || "queued";
  })();

  // Build the patch defensively: only include fields that carry real values
  // from this event. That way a mid-call live_call event can't wipe out the
  // duration/recording that a later call_report already saved.
  const patch: Record<string, unknown> = {};

  // For live_call events, only bump the status if it's a meaningful transition
  // (answered / missed / busy / failed). Skip intermediate labels like
  // "Transferring…" so the row doesn't churn on every state change.
  const finalStatuses = new Set(["answered", "missed", "busy", "failed"]);
  if (isCallReport || finalStatuses.has(normalizedStatus)) {
    patch.status = normalizedStatus;
  }
  if (duration != null && duration > 0) patch.duration_seconds = duration;
  if (recordingUrl) patch.recording_url = recordingUrl;

  if (Object.keys(patch).length === 0) {
    return Response.json({ ok: true, ignored: "no-op" });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("communications")
    .update(patch)
    .eq("provider_message_id", providerCallId);
  if (error) {
    // eslint-disable-next-line no-console
    console.log("[telephony-webhook] update error:", error.message);
  }

  return Response.json({ ok: true, patched: Object.keys(patch) });
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function hasCallId(body: Record<string, unknown>): boolean {
  return Boolean(
    body.CallSid ??
      body.call_id ??
      body.unique_id ??
      body.uniqueId ??
      body.campid,
  );
}

export function GET() {
  return Response.json({ ok: true, endpoint: "telephony-webhook" });
}
