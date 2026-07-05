import { supabaseAdmin } from "./supabase-admin";
import { runWorkflows } from "./workflows";
import type { LeadRow, LeadSource } from "./database.types";

// Shared helper: intake a lead from a public source (web form, ads webhook,
// missed call, etc.), assign to first stage, record source, run workflows.
// No dedupe by design (user chose "always create new").
export async function intakeLead(
  input: {
    name: string;
    phone?: string | null;
    email?: string | null;
    source: LeadSource;
    custom?: Record<string, unknown>;
  },
  systemActorId: string | null = null,
): Promise<{ ok: boolean; leadId?: string; error?: string }> {
  if (!input.name || input.name.length < 1) return { ok: false, error: "name is required" };

  const sb = supabaseAdmin();

  const { data: firstStage } = await sb
    .from("lead_stages")
    .select("id")
    .eq("is_archived", false)
    .eq("kind", "open")
    .order("position")
    .limit(1)
    .maybeSingle();

  const { data: lead, error } = await sb
    .from("leads")
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      source: input.source,
      stage_id: firstStage?.id ?? null,
      custom: input.custom ?? {},
    })
    .select("*")
    .single();
  if (error || !lead) return { ok: false, error: error?.message ?? "insert failed" };

  await sb.from("lead_activities").insert({
    lead_id: lead.id,
    actor_id: systemActorId,
    kind: "created",
    payload: { source: input.source },
  });

  await runWorkflows("lead_created", lead as LeadRow, {
    session: {
      userId: systemActorId ?? "system",
      email: "system@internal",
      name: "System",
      role: "admin",
    },
  });

  return { ok: true, leadId: lead.id };
}
