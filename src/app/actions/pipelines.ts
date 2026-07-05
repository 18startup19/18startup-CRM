"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export interface PipelineResult {
  error?: string;
  ok?: boolean;
  pipelineId?: string;
}

export async function createPipelineAction(
  _prev: PipelineResult,
  form: FormData,
): Promise<PipelineResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Pipeline name is required." };

  const { data: last } = await sb
    .from("pipelines")
    .select("position")
    .eq("is_archived", false)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? 0) + 1;

  const { data: created, error } = await sb
    .from("pipelines")
    .insert({ name, position })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message ?? "Failed to create pipeline." };

  revalidatePath("/leads/kanban");
  revalidatePath("/admin/stages");
  return { ok: true, pipelineId: created.id };
}

export async function renamePipelineAction(pipelineId: string, name: string): Promise<void> {
  await requireAdmin();
  const clean = name.trim();
  if (!clean) return;
  const sb = supabaseAdmin();
  await sb.from("pipelines").update({ name: clean }).eq("id", pipelineId);
  revalidatePath("/leads/kanban");
  revalidatePath("/admin/stages");
}

export async function archivePipelineAction(pipelineId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("pipelines").update({ is_archived: true }).eq("id", pipelineId);
  revalidatePath("/leads/kanban");
  revalidatePath("/admin/stages");
}
