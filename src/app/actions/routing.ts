"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export interface RoutingResult {
  ok?: boolean;
  error?: string;
}

export async function createRoutingRuleAction(
  _prev: RoutingResult,
  form: FormData,
): Promise<RoutingResult> {
  await requireAdmin();
  const source = String(form.get("source") ?? "").trim();
  const match_value = String(form.get("match_value") ?? "").trim();
  const stage_id = String(form.get("stage_id") ?? "").trim();
  const label = String(form.get("label") ?? "").trim() || null;
  if (source !== "razorpay" && source !== "webflow") {
    return { error: "source must be razorpay or webflow" };
  }
  if (!match_value) return { error: "match_value is required" };
  if (!stage_id) return { error: "Pick a target stage" };

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("lead_routing_rules")
    .insert({ source, match_value, stage_id, label });
  if (error) {
    if (error.code === "23505") {
      return {
        error: `A rule already exists for ${source} with match value "${match_value}".`,
      };
    }
    return { error: error.message };
  }
  revalidatePath("/admin/lead-routing");
  return { ok: true };
}

export async function updateRoutingRuleAction(
  id: string,
  patch: { stage_id?: string; is_active?: boolean; label?: string | null },
): Promise<RoutingResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const clean: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("stage_id" in patch && patch.stage_id) clean.stage_id = patch.stage_id;
  if ("is_active" in patch) clean.is_active = patch.is_active;
  if ("label" in patch) clean.label = patch.label ?? null;
  const { error } = await sb
    .from("lead_routing_rules")
    .update(clean)
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/lead-routing");
  return { ok: true };
}

export async function deleteRoutingRuleAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("lead_routing_rules").delete().eq("id", id);
  revalidatePath("/admin/lead-routing");
}

// Set the routing target stage for a Webflow form directly (used from the
// per-form panel in the Forms + Field Mapping card). Creates a rule if
// missing, updates if present, deletes if stageId is null.
export async function setWebflowFormRouteAction(
  formKey: string,
  stageId: string | null,
): Promise<RoutingResult> {
  await requireAdmin();
  const trimmed = formKey.trim();
  if (!trimmed) return { error: "form key is required" };

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("lead_routing_rules")
    .select("id")
    .eq("source", "webflow")
    .eq("match_value", trimmed)
    .maybeSingle<{ id: string }>();

  if (!stageId) {
    if (existing) {
      await sb.from("lead_routing_rules").delete().eq("id", existing.id);
    }
    revalidatePath("/admin/lead-routing");
    return { ok: true };
  }

  if (existing) {
    const { error } = await sb
      .from("lead_routing_rules")
      .update({
        stage_id: stageId,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await sb.from("lead_routing_rules").insert({
      source: "webflow",
      match_value: trimmed,
      stage_id: stageId,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin/lead-routing");
  return { ok: true };
}

export async function updateRazorpayRequireRuleAction(
  requireRule: boolean,
): Promise<RoutingResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("intake_settings")
    .upsert({
      id: 1,
      razorpay_require_rule: requireRule,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  revalidatePath("/admin/lead-routing");
  return { ok: true };
}

export async function updateFallbackStageAction(
  stage_id: string | null,
): Promise<RoutingResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("intake_settings")
    .upsert({ id: 1, fallback_stage_id: stage_id, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/admin/lead-routing");
  return { ok: true };
}
