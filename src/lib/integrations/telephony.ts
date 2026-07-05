import { supabaseAdmin } from "../supabase-admin";
import type { LeadRow } from "../database.types";

// Click-to-call: initiate an outbound call bridging the agent's phone → the lead.
// Providers usually accept (agent_number, lead_number) and callback status webhooks.
export async function initiateCall({
  lead,
  agentPhone,
  actorId,
}: {
  lead: LeadRow;
  agentPhone: string;
  actorId?: string | null;
}): Promise<{ ok: boolean; providerCallId?: string; error?: string }> {
  if (!lead.phone) return { ok: false, error: "Lead has no phone number." };
  if (lead.is_dnc) return { ok: false, error: "Lead is marked do-not-contact." };
  if (!agentPhone) {
    return {
      ok: false,
      error: "Missing agent phone. Add your phone number in Admin → Users → Edit.",
    };
  }

  const provider = (process.env.TELEPHONY_PROVIDER ?? "mock").toLowerCase();
  const sb = supabaseAdmin();
  const { data: comm } = await sb
    .from("communications")
    .insert({
      lead_id: lead.id,
      channel: "call",
      direction: "outbound",
      status: "queued",
      actor_id: actorId ?? null,
      provider,
    })
    .select("id")
    .single();

  try {
    let providerCallId: string | undefined;
    switch (provider) {
      case "callerdesk":
        providerCallId = await callerdeskInitiate(agentPhone, lead.phone);
        break;
      case "exotel":
      case "knowlarity":
      case "myoperator":
      case "ozonetel":
        // TODO: real API call to initiate the bridge.
        providerCallId = `stub-${Date.now()}`;
        break;
      case "mock":
      default:
        // eslint-disable-next-line no-console
        console.log(`[mock call] agent ${agentPhone} → ${lead.phone}`);
        providerCallId = `mock-${Date.now()}`;
    }
    if (comm?.id) {
      // For real providers we mark as "queued" — the webhook flips it to
      // answered/missed once the call resolves. Mock treats it as answered
      // immediately so the UI shows a completed comm row.
      await sb
        .from("communications")
        .update({
          status: provider === "mock" ? "answered" : "queued",
          provider_message_id: providerCallId,
        })
        .eq("id", comm.id);
    }
    return { ok: true, providerCallId };
  } catch (err) {
    if (comm?.id) {
      await sb
        .from("communications")
        .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
        .eq("id", comm.id);
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── CallerDesk click-to-call adapter ───────────────────────────────────────
// Endpoint: GET https://app.callerdesk.io/api/click_to_call_v2
// Params (per CallerDesk docs "Click_to_call (Normal)"):
//   calling_party_a  — agent phone (Party A dialled first)
//   calling_party_b  — customer phone (Party B, bridged when A answers)
//   deskphone        — CallerDesk virtual DID that shows as caller ID
//   authcode         — account API auth code
//   call_from_did=1  — originate outbound so the customer sees deskphone
// Response is JSON; we grab unique_id / call_id as provider_message_id so the
// webhook can attach status + duration later.

async function callerdeskInitiate(agentPhone: string, customerPhone: string): Promise<string> {
  const authcode = process.env.CALLERDESK_AUTHCODE;
  const virtualNumber = process.env.CALLERDESK_VIRTUAL_NUMBER;
  const baseUrl =
    process.env.CALLERDESK_API_URL ?? "https://app.callerdesk.io/api/click_to_call_v2";
  if (!authcode) throw new Error("Missing CALLERDESK_AUTHCODE.");
  if (!virtualNumber) throw new Error("Missing CALLERDESK_VIRTUAL_NUMBER.");

  const params = new URLSearchParams({
    calling_party_a: toIndianNational(agentPhone),
    calling_party_b: toIndianNational(customerPhone),
    deskphone: normalize(virtualNumber),
    authcode,
    call_from_did: "1",
  });

  const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${params.toString()}`;
  const res = await fetch(url, { method: "GET" });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Some deployments return text/plain OK responses — treat as opaque.
  }

  // CallerDesk returns HTTP 200 even for failures — it embeds { type: "error",
  // message: "..." } in the JSON body. Treat that as a real failure so the CRM
  // toast surfaces the reason (e.g. "Agent on break", "Invalid virtual number")
  // instead of silently pretending the call was queued.
  const looksLikeError =
    (typeof data.type === "string" && data.type.toLowerCase() === "error") ||
    (typeof data.status === "string" && data.status.toLowerCase() === "error") ||
    (typeof data.success === "boolean" && data.success === false);

  if (!res.ok || looksLikeError) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      (typeof data.description === "string" && data.description) ||
      text.slice(0, 200) ||
      `HTTP ${res.status}`;
    throw new Error(`CallerDesk: ${msg}`);
  }

  const id =
    (typeof data.campid === "string" && data.campid) ||
    (typeof data.campid === "number" && String(data.campid)) ||
    (typeof data.unique_id === "string" && data.unique_id) ||
    (typeof data.call_id === "string" && data.call_id) ||
    (typeof data.callId === "string" && data.callId) ||
    (typeof data.request_id === "string" && data.request_id) ||
    "";
  return id || `cd-${Date.now()}`;
}

function normalize(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return t.replace(/[^\d]/g, "");
}

// CallerDesk's agent-lookup keys on the 10-digit Indian mobile number without
// country code. E.164 (+91xxxxxxxxxx) or 12-digit (91xxxxxxxxxx) will trigger
// a misleading "Agent on break/Inactive" response. Strip the 91 prefix, and
// any single leading 0, so `+918886956636`, `08886956636`, and `8886956636`
// all resolve to `8886956636`.
function toIndianNational(raw: string): string {
  const digits = normalize(raw);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 13 && digits.startsWith("091")) return digits.slice(3);
  return digits;
}
