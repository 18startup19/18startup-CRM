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
      await sb
        .from("communications")
        .update({ status: "answered", provider_message_id: providerCallId })
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
