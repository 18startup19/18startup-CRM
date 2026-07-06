"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export interface StageResult {
  error?: string;
  ok?: boolean;
}

export async function createStageAction(_prev: StageResult, form: FormData): Promise<StageResult> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const color = String(form.get("color") ?? "#F37335");
  const kind = String(form.get("kind") ?? "open") as "open" | "won" | "lost";
  const pipelineIdRaw = String(form.get("pipeline_id") ?? "").trim();
  if (!name) return { error: "Name required." };

  const sb = supabaseAdmin();

  let pipelineId = pipelineIdRaw;
  if (!pipelineId) {
    const { data: firstPipeline } = await sb
      .from("pipelines")
      .select("id")
      .eq("is_archived", false)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstPipeline) return { error: "No pipeline exists yet." };
    pipelineId = firstPipeline.id;
  }

  const { data: max } = await sb
    .from("lead_stages")
    .select("position")
    .eq("is_archived", false)
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (max?.position ?? 0) + 1;

  const { error } = await sb
    .from("lead_stages")
    .insert({ name, color, kind, position, pipeline_id: pipelineId });
  if (error) return { error: error.message };

  revalidatePath("/admin/stages");
  revalidatePath("/leads");
  return { ok: true };
}

export async function updateStagePositionsAction(order: string[]): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await Promise.all(
    order.map((id, idx) => sb.from("lead_stages").update({ position: idx + 1 }).eq("id", id)),
  );
  revalidatePath("/admin/stages");
  revalidatePath("/leads");
}

export async function archiveStageAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("lead_stages").update({ is_archived: true }).eq("id", id);
  revalidatePath("/admin/stages");
  revalidatePath("/leads");
}

export async function restoreStageAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("lead_stages").update({ is_archived: false }).eq("id", id);
  revalidatePath("/admin/stages");
  revalidatePath("/leads");
}

export async function updateStageAction(id: string, form: FormData): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  const name = String(form.get("name") ?? "").trim();
  const color = String(form.get("color") ?? "").trim();
  const kind = String(form.get("kind") ?? "").trim();
  if (name) patch.name = name;
  if (color) patch.color = color;
  if (kind === "open" || kind === "won" || kind === "lost") patch.kind = kind;
  if (Object.keys(patch).length === 0) return;
  await sb.from("lead_stages").update(patch).eq("id", id);
  revalidatePath("/admin/stages");
  revalidatePath("/leads/kanban");
}
