"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export interface WorkflowResult {
  error?: string;
  ok?: boolean;
}

export async function createWorkflowAction(
  _prev: WorkflowResult,
  form: FormData,
): Promise<WorkflowResult> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const trigger_kind = String(form.get("trigger_kind") ?? "lead_created") as
    | "lead_created"
    | "stage_changed"
    | "field_changed"
    | "callback_due";
  const stageIdCondition = String(form.get("stage_condition") ?? "").trim();
  const actionKind = String(form.get("action_kind") ?? "").trim();
  const actionTemplateId = String(form.get("action_template_id") ?? "").trim();
  const actionOwnerId = String(form.get("action_owner_id") ?? "").trim();
  const actionStageId = String(form.get("action_stage_id") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!actionKind) return { error: "Pick an action." };

  const conditions: Array<{ field: string; op: string; value?: unknown }> = [];
  if (stageIdCondition) conditions.push({ field: "stage_id", op: "eq", value: stageIdCondition });

  const actionField = String(form.get("action_field") ?? "").trim();
  const actionValueRaw = form.get("action_value");

  const actionConfig: Record<string, unknown> = {};
  if (actionKind === "send_email" || actionKind === "send_whatsapp") {
    if (!actionTemplateId) return { error: "Choose a template for the send action." };
    actionConfig.template_id = actionTemplateId;
  } else if (actionKind === "assign_owner") {
    if (!actionOwnerId) return { error: "Choose an owner to assign." };
    actionConfig.owner_id = actionOwnerId;
  } else if (actionKind === "set_stage") {
    if (!actionStageId) return { error: "Choose a stage to move the lead to." };
    actionConfig.stage_id = actionStageId;
  } else if (actionKind === "update_field") {
    if (!actionField) return { error: "Choose a field to update." };
    actionConfig.field = actionField;
    const raw = actionValueRaw == null ? "" : String(actionValueRaw);
    actionConfig.value =
      raw === "true" ? true : raw === "false" ? false : raw === "" ? null : raw;
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("workflow_rules").insert({
    name,
    trigger_kind,
    trigger_config: {},
    conditions,
    actions: [{ kind: actionKind, config: actionConfig }],
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/workflows");
  return { ok: true };
}

export async function toggleWorkflowAction(id: string, isActive: boolean): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("workflow_rules").update({ is_active: !isActive }).eq("id", id);
  revalidatePath("/admin/workflows");
}

export async function deleteWorkflowAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("workflow_rules").delete().eq("id", id);
  revalidatePath("/admin/workflows");
}
