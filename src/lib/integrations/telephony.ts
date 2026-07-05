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
// Docs: https://docs.callerdesk.io/ (Click2Call APIs section).
// The endpoint accepts JSON with the account auth code, agent phone (callerid),
// customer phone (receivernum), and the virtual DID (virtualnumber). CallerDesk
// then dials the agent first; when they pick up it bridges to the customer.
// Response typically returns a call_id / unique_id we store as
// provider_message_id so the webhook can later attach status + duration.

async function callerdeskInitiate(agentPhone: string, customerPhone: string): Promise<string> {
  const authcode = process.env.CALLERDESK_AUTHCODE;
  const virtualNumber = process.env.CALLERDESK_VIRTUAL_NUMBER;
  const url = process.env.CALLERDESK_API_URL ?? "https://api.callerdesk.io/v1/click_to_call";
  if (!authcode) throw new Error("Missing CALLERDESK_AUTHCODE.");
  if (!virtualNumber) throw new Error("Missing CALLERDESK_VIRTUAL_NUMBER.");

  const payload = {
    authcode,
    callerid: normalize(agentPhone),
    receivernum: normalize(customerPhone),
    virtualnumber: normalize(virtualNumber),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Some deployments return text/plain OK responses — treat as opaque.
  }

  if (!res.ok) {
    const msg =
      (typeof data.message === "string" && data.message) ||
      (typeof data.error === "string" && data.error) ||
      text.slice(0, 200) ||
      `HTTP ${res.status}`;
    throw new Error(`CallerDesk error: ${msg}`);
  }

  // Provider returns different id fields across API versions.
  const id =
    (typeof data.unique_id === "string" && data.unique_id) ||
    (typeof data.call_id === "string" && data.call_id) ||
    (typeof data.callId === "string" && data.callId) ||
    "";
  return id || `cd-${Date.now()}`;
}

function normalize(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  // CallerDesk expects Indian numbers without the leading + — 10 or 12 digits.
  // We normalise to digits-only; callers should pass numbers already in E.164
  // or plain 10-digit form.
  return t.replace(/[^\d]/g, "");
}
