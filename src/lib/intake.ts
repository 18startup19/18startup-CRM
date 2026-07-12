import { supabaseAdmin } from "./supabase-admin";
import { runWorkflows } from "./workflows";
import type { LeadRow, LeadSource } from "./database.types";

// Shared helper: intake a lead from a public source (web form, ads webhook,
// missed call, etc.), assign to first stage, record source, run workflows.
//
// No dedup — every submission creates a new lead, per business decision
// (2026-07-11). Sales team handles duplicates in-CRM after the fact.
export async function intakeLead(
  input: {
    name: string;
    phone?: string | null;
    email?: string | null;
    source: LeadSource;
    custom?: Record<string, unknown>;
    // Routing key for per-form / per-payment-page rules:
    //   * Webflow  → the form's name
    //   * Razorpay → the payment's description
    // If a rule matches (source, routingKey), lead lands in that rule's stage.
    // Otherwise falls back to intake_settings.fallback_stage_id, then to the
    // CRM's leftmost open stage.
    routingKey?: string | null;
    // Direct routing override — used by Payment Pages, where the page row
    // already carries stage/owner/tags and there's no need to consult
    // lead_routing_rules. When set, `routingKey` is ignored for resolution.
    override?: {
      stageId?: string | null;
      ownerId?: string | null;
      tags?: string[];
    };
  },
  systemActorId: string | null = null,
): Promise<{
  ok: boolean;
  leadId?: string;
  merged?: boolean;
  matchedRuleId?: string | null;
  error?: string;
}> {
  if (!input.name || input.name.length < 1) return { ok: false, error: "name is required" };

  const sb = supabaseAdmin();

  const normalizedPhone = normalizePhone(input.phone ?? null);
  const normalizedEmail = input.email?.trim().toLowerCase() || null;

  let targetStageId: string | null;
  let matchedRuleId: string | null;
  if (input.override) {
    targetStageId = input.override.stageId ?? (await resolveTargetStage(input.source, null)).stageId;
    matchedRuleId = null;
  } else {
    const resolved = await resolveTargetStage(input.source, input.routingKey ?? null);
    targetStageId = resolved.stageId;
    matchedRuleId = resolved.matchedRuleId;
  }

  // Stash the routing key on custom so the admin page can discover
  // unmatched values ("we saw this form 8 times last week — add a rule?").
  const routingKey = input.routingKey?.trim() || null;
  const customWithRoute: Record<string, unknown> = {
    ...(input.custom ?? {}),
    ...(routingKey ? { __routing_key: routingKey } : {}),
  };

  const { data: lead, error } = await sb
    .from("leads")
    .insert({
      name: input.name,
      phone: normalizedPhone,
      email: normalizedEmail,
      source: input.source,
      stage_id: targetStageId,
      owner_id: input.override?.ownerId ?? null,
      tags: input.override?.tags ?? [],
      custom: customWithRoute,
    })
    .select("*")
    .single();
  if (error || !lead) return { ok: false, error: error?.message ?? "insert failed" };

  await sb.from("lead_activities").insert({
    lead_id: lead.id,
    actor_id: systemActorId,
    kind: "created",
    payload: {
      source: input.source,
      routing_key: routingKey,
      matched_rule_id: matchedRuleId,
    },
  });

  await runWorkflows("lead_created", lead as LeadRow, {
    session: {
      userId: systemActorId ?? "system",
      email: "system@internal",
      name: "System",
      role: "admin",
    },
  });

  return { ok: true, leadId: lead.id, matchedRuleId };
}

// Resolve which stage a new lead should land in for (source, routingKey):
//   1. Active rule matching (source, match_value = routingKey)
//   2. intake_settings.fallback_stage_id
//   3. Leftmost open stage (legacy fallback)
// Rules table + intake_settings may not exist yet if migration 0019 hasn't
// been run; treat query errors as "no rule" and fall through.
async function resolveTargetStage(
  source: LeadSource,
  routingKey: string | null,
): Promise<{ stageId: string | null; matchedRuleId: string | null }> {
  const sb = supabaseAdmin();
  const key = routingKey?.trim();
  if (key && (source === "razorpay" || source === "webflow")) {
    const { data: rule } = await sb
      .from("lead_routing_rules")
      .select("id,stage_id")
      .eq("source", source)
      .eq("match_value", key)
      .eq("is_active", true)
      .maybeSingle<{ id: string; stage_id: string }>();
    if (rule) return { stageId: rule.stage_id, matchedRuleId: rule.id };
  }

  const { data: settings } = await sb
    .from("intake_settings")
    .select("fallback_stage_id")
    .eq("id", 1)
    .maybeSingle<{ fallback_stage_id: string | null }>();
  if (settings?.fallback_stage_id) {
    return { stageId: settings.fallback_stage_id, matchedRuleId: null };
  }

  const { data: firstStage } = await sb
    .from("lead_stages")
    .select("id")
    .eq("is_archived", false)
    .eq("kind", "open")
    .order("position")
    .limit(1)
    .maybeSingle<{ id: string }>();
  return { stageId: firstStage?.id ?? null, matchedRuleId: null };
}

// Normalise Indian phone-like strings to E.164 for consistent dedup. Mirrors
// the WhatsApp adapter's normalisation so the same input finds the same
// existing lead regardless of which door it came in through.
function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+${digits.slice(1)}`;
  return `+${digits}`;
}
