"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { hasPermission } from "@/lib/rbac";
import { runWorkflows } from "@/lib/workflows";
import type { LeadRow } from "@/lib/database.types";

export interface BulkPatch {
  stageId?: string;
  ownerId?: string;
  isDnc?: boolean;
}

export async function bulkUpdateLeadsAction(
  leadIds: string[],
  patch: BulkPatch,
): Promise<{ error?: string; updated?: number }> {
  const session = await requireSession();
  if (leadIds.length === 0) return { updated: 0 };

  const sb = supabaseAdmin();
  const { data: me } = await sb
    .from("users")
    .select("permissions")
    .eq("id", session.userId)
    .maybeSingle();
  const perms = (me?.permissions as Record<string, boolean> | null) ?? {};

  if (patch.ownerId && !hasPermission(session, perms, "leads:assign")) {
    return { error: "You don't have permission to reassign leads." };
  }
  if ((patch.stageId || patch.isDnc !== undefined) && !hasPermission(session, perms, "leads:edit")) {
    return { error: "You don't have permission to edit leads." };
  }

  const update: Partial<LeadRow> = {};
  if (patch.stageId) update.stage_id = patch.stageId;
  if (patch.ownerId) update.owner_id = patch.ownerId;
  if (patch.isDnc !== undefined) update.is_dnc = patch.isDnc;
  if (Object.keys(update).length === 0) return { updated: 0 };

  const { data: before } = await sb
    .from("leads")
    .select("id,stage_id,owner_id,is_dnc")
    .in("id", leadIds);
  const beforeById = new Map((before ?? []).map((r) => [r.id, r]));

  const { data: after, error } = await sb
    .from("leads")
    .update(update)
    .in("id", leadIds)
    .select("*");
  if (error) return { error: error.message };

  const activityRows: {
    lead_id: string;
    actor_id: string;
    kind: string;
    payload: Record<string, unknown>;
  }[] = [];
  for (const row of after ?? []) {
    const prev = beforeById.get(row.id);
    if (!prev) continue;
    if (patch.stageId && prev.stage_id !== patch.stageId) {
      activityRows.push({
        lead_id: row.id,
        actor_id: session.userId,
        kind: "stage_changed",
        payload: { from: prev.stage_id, to: patch.stageId, bulk: true },
      });
    }
    if (patch.ownerId && prev.owner_id !== patch.ownerId) {
      activityRows.push({
        lead_id: row.id,
        actor_id: session.userId,
        kind: "owner_changed",
        payload: { from: prev.owner_id, to: patch.ownerId, bulk: true },
      });
    }
    if (patch.isDnc !== undefined && prev.is_dnc !== patch.isDnc) {
      activityRows.push({
        lead_id: row.id,
        actor_id: session.userId,
        kind: "updated",
        payload: { changes: { is_dnc: { from: prev.is_dnc, to: patch.isDnc } }, bulk: true },
      });
    }
  }
  if (activityRows.length) await sb.from("lead_activities").insert(activityRows);

  if (patch.ownerId && patch.ownerId !== session.userId) {
    const newAssignments = (after ?? []).filter((r) => {
      const prev = beforeById.get(r.id);
      return prev && prev.owner_id !== patch.ownerId;
    });
    if (newAssignments.length > 0) {
      await sb.from("notifications").insert(
        newAssignments.map((r) => ({
          user_id: patch.ownerId!,
          kind: "lead_assigned",
          payload: {
            lead_id: r.id,
            lead_name: r.name,
            assigned_by: session.name,
            bulk: true,
          },
        })),
      );
    }
  }

  if (patch.stageId) {
    for (const row of after ?? []) {
      const prev = beforeById.get(row.id);
      if (!prev || prev.stage_id === patch.stageId) continue;
      await runWorkflows("stage_changed", row as LeadRow, {
        session,
        from: prev.stage_id,
      });
    }
  }

  revalidatePath("/leads/kanban");
  revalidatePath("/leads");
  return { updated: after?.length ?? 0 };
}

export async function moveLeadStageAction(leadId: string, stageId: string): Promise<void> {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from("leads")
    .select("stage_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!before || before.stage_id === stageId) return;

  const { data: after } = await sb
    .from("leads")
    .update({ stage_id: stageId })
    .eq("id", leadId)
    .select("*")
    .single();

  await sb.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: session.userId,
    kind: "stage_changed",
    payload: { from: before.stage_id, to: stageId },
  });

  if (after) {
    await runWorkflows("stage_changed", after as LeadRow, {
      session,
      from: before.stage_id,
    });
  }

  revalidatePath("/leads/kanban");
  revalidatePath("/leads");
}

export async function saveKanbanCardFieldsAction(fields: string[]): Promise<void> {
  // Team members can tune their kanban card view too. This setting is global
  // for now (single integration_settings row) — a per-user override would need
  // its own table.
  await requireSession();
  const sb = supabaseAdmin();

  const { data: row } = await sb
    .from("integration_settings")
    .select("config")
    .eq("id", 1)
    .maybeSingle();
  const current = (row?.config as Record<string, unknown> | null) ?? {};
  const next = { ...current, kanban_card_fields: fields };

  await sb.from("integration_settings").update({ config: next }).eq("id", 1);
  revalidatePath("/leads/kanban");
}
