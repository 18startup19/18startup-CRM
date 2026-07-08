"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasPermission } from "@/lib/rbac";
import { requireSession } from "@/lib/rbac-server";
import type {
  CustomFieldRow,
  LeadRow,
  LeadSource,
  CallOutcome,
} from "@/lib/database.types";
import { runWorkflows } from "@/lib/workflows";

export interface LeadResult {
  error?: string;
  ok?: boolean;
  leadId?: string;
}

function parseCustomFieldValues(
  form: FormData,
  fields: CustomFieldRow[],
): { values: Record<string, unknown>; error?: string } {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = form.get(`cf_${f.key}`);
    if (raw == null || raw === "") {
      if (f.is_required) return { values, error: `${f.label} is required.` };
      continue;
    }
    switch (f.type) {
      case "number":
        values[f.key] = Number(raw);
        break;
      case "checkbox":
        values[f.key] = raw === "on" || raw === "true";
        break;
      default:
        values[f.key] = String(raw);
    }
  }
  // Also gather any checkbox unchecked → keep as false if it was in the form
  return { values };
}

export async function createLeadAction(_prev: LeadResult, form: FormData): Promise<LeadResult> {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };
  const phone = String(form.get("phone") ?? "").trim() || null;
  const email = String(form.get("email") ?? "").trim() || null;
  const source = (String(form.get("source") ?? "manual") as LeadSource) || "manual";
  const stageId = String(form.get("stage_id") ?? "") || null;
  const ownerIdRaw = String(form.get("owner_id") ?? "");
  const ownerId = ownerIdRaw || session.userId;
  const nextCallback = String(form.get("next_callback_at") ?? "") || null;
  const tags = parseTags(form.get("tags"));

  const { data: fieldRows } = await sb
    .from("custom_fields")
    .select("*")
    .eq("is_archived", false);
  const fields = (fieldRows ?? []) as CustomFieldRow[];
  const { values, error } = parseCustomFieldValues(form, fields);
  if (error) return { error };

  const { data: lead, error: insertErr } = await sb
    .from("leads")
    .insert({
      name,
      phone,
      email,
      source,
      stage_id: stageId,
      owner_id: ownerId,
      next_callback_at: nextCallback,
      custom: values,
      tags,
    })
    .select("*")
    .single();
  if (insertErr || !lead) return { error: insertErr?.message ?? "Failed to create lead." };

  await sb.from("lead_activities").insert({
    lead_id: lead.id,
    actor_id: session.userId,
    kind: "created",
    payload: { source },
  });

  await runWorkflows("lead_created", lead as LeadRow, { session });

  revalidatePath("/leads");
  revalidateTag("leads-tags", "max");
  return { ok: true, leadId: lead.id };
}

export async function updateLeadAction(
  leadId: string,
  form: FormData,
): Promise<{ ok: true } | void> {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const { data: before } = await sb.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!before) return;

  const name = String(form.get("name") ?? "").trim() || before.name;
  const phone = String(form.get("phone") ?? "").trim() || null;
  const email = String(form.get("email") ?? "").trim() || null;
  const stageId = String(form.get("stage_id") ?? "") || null;
  const nextCallback = String(form.get("next_callback_at") ?? "") || null;
  const rawTags = form.get("tags");
  const tags = rawTags == null ? before.tags ?? [] : parseTags(rawTags);

  const { data: fieldRows } = await sb.from("custom_fields").select("*").eq("is_archived", false);
  const fields = (fieldRows ?? []) as CustomFieldRow[];
  const { values } = parseCustomFieldValues(form, fields);

  const custom = { ...(before.custom ?? {}), ...values };

  const { data: after } = await sb
    .from("leads")
    .update({
      name,
      phone,
      email,
      stage_id: stageId,
      next_callback_at: nextCallback,
      custom,
      tags,
    })
    .eq("id", leadId)
    .select("*")
    .single();

  await sb.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: session.userId,
    kind: "updated",
    payload: {
      changes: diffFields(before, after ?? before),
    },
  });

  if (before.stage_id !== stageId && stageId) {
    await sb.from("lead_activities").insert({
      lead_id: leadId,
      actor_id: session.userId,
      kind: "stage_changed",
      payload: { from: before.stage_id, to: stageId },
    });
    if (after) await runWorkflows("stage_changed", after as LeadRow, { session, from: before.stage_id });
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidateTag("leads-tags", "max");
  return { ok: true };
}

export async function updateStageAction(leadId: string, stageId: string): Promise<void> {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const { data: before } = await sb.from("leads").select("stage_id").eq("id", leadId).maybeSingle();
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
  if (after) await runWorkflows("stage_changed", after as LeadRow, { session, from: before.stage_id });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
}

export async function assignLeadAction(leadId: string, ownerId: string): Promise<void> {
  const session = await requireSession();
  if (!hasPermission(session, {}, "leads:assign") && session.role !== "admin") return;
  const sb = supabaseAdmin();
  const { data: before } = await sb
    .from("leads")
    .select("owner_id,name")
    .eq("id", leadId)
    .maybeSingle();
  if (before?.owner_id === ownerId) return;
  await sb.from("leads").update({ owner_id: ownerId }).eq("id", leadId);
  await sb.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: session.userId,
    kind: "owner_changed",
    payload: { from: before?.owner_id, to: ownerId },
  });
  if (ownerId !== session.userId) {
    await sb.from("notifications").insert({
      user_id: ownerId,
      kind: "lead_assigned",
      payload: {
        lead_id: leadId,
        lead_name: before?.name ?? "a lead",
        assigned_by: session.name,
      },
    });
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads/kanban");
}

export async function deleteLeadAction(leadId: string): Promise<void> {
  const session = await requireSession();
  const sb = supabaseAdmin();
  // permissions read from session's stored row
  const { data: me } = await sb.from("users").select("permissions").eq("id", session.userId).maybeSingle();
  if (session.role !== "admin" && !(me?.permissions as Record<string, boolean> | null)?.["leads:delete"]) return;
  await sb.from("leads").delete().eq("id", leadId);
  revalidatePath("/leads");
  redirect("/leads");
}

export async function createNoteAction(leadId: string, form: FormData): Promise<void> {
  const session = await requireSession();
  const body = String(form.get("body") ?? "").trim();
  if (!body) return;
  const sb = supabaseAdmin();
  await sb.from("lead_notes").insert({ lead_id: leadId, author_id: session.userId, body });
  revalidatePath(`/leads/${leadId}`);
}

export async function logCallOutcomeAction(leadId: string, form: FormData): Promise<void> {
  const session = await requireSession();
  const outcome = String(form.get("outcome") ?? "") as CallOutcome;
  const summary = String(form.get("summary") ?? "").trim();
  const durationRaw = String(form.get("duration_seconds") ?? "");
  const duration = durationRaw ? Number(durationRaw) : null;
  const nextCallback = String(form.get("next_callback_at") ?? "") || null;

  const sb = supabaseAdmin();
  await sb.from("communications").insert({
    lead_id: leadId,
    channel: "call",
    direction: "outbound",
    status: "answered",
    actor_id: session.userId,
    body: summary || null,
    outcome,
    duration_seconds: duration,
  });

  const patch: Partial<{ next_callback_at: string | null; is_dnc: boolean }> = {};
  if (nextCallback) patch.next_callback_at = nextCallback;
  if (outcome === "dnc") patch.is_dnc = true;
  if (Object.keys(patch).length) await sb.from("leads").update(patch).eq("id", leadId);

  revalidatePath(`/leads/${leadId}`);
}

function diffFields(a: LeadRow, b: LeadRow) {
  const keys: (keyof LeadRow)[] = ["name", "phone", "email", "stage_id", "next_callback_at"];
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) if (a[k] !== b[k]) changes[k] = { from: a[k], to: b[k] };
  if (JSON.stringify(a.tags ?? []) !== JSON.stringify(b.tags ?? [])) {
    changes.tags = { from: a.tags ?? [], to: b.tags ?? [] };
  }
  return changes;
}

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (raw == null) return [];
  const text = String(raw);
  return Array.from(
    new Set(
      text
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );
}
