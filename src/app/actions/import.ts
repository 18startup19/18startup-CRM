"use server";

import { revalidatePath } from "next/cache";
import Papa from "papaparse";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type { CustomFieldRow } from "@/lib/database.types";

export interface ImportResult {
  error?: string;
  ok?: boolean;
  inserted?: number;
  skipped?: number;
  created?: { pipelines: string[]; stages: string[] };
}

export async function importCsvAction(_prev: ImportResult, form: FormData): Promise<ImportResult> {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const { data: me } = await sb
    .from("users")
    .select("permissions")
    .eq("id", session.userId)
    .maybeSingle();
  const canImport =
    session.role === "admin" ||
    (me?.permissions as Record<string, boolean> | null)?.["leads:import"] === true;
  if (!canImport) return { error: "You don't have permission to import." };

  const file = form.get("file") as File | null;
  if (!file || file.size === 0) return { error: "Choose a CSV file to import." };

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) return { error: `CSV parse error: ${parsed.errors[0].message}` };

  const { data: fieldsData } = await sb.from("custom_fields").select("*").eq("is_archived", false);
  const fields = (fieldsData ?? []) as CustomFieldRow[];
  const fieldMap = new Map(fields.map((f) => [f.key, f]));

  const [{ data: pipelinesData }, { data: stagesData }, { data: usersData }] = await Promise.all([
    sb.from("pipelines").select("id,name").eq("is_archived", false),
    sb.from("lead_stages").select("id,name,pipeline_id,position").eq("is_archived", false),
    sb.from("users").select("id,email").eq("is_active", true),
  ]);

  const pipelineByName = new Map(
    (pipelinesData ?? []).map((p) => [p.name.toLowerCase(), p.id] as const),
  );
  const stageByKey = new Map(
    (stagesData ?? []).map((s) => [`${s.pipeline_id}|${s.name.toLowerCase()}`, s.id] as const),
  );
  const userByEmail = new Map(
    (usersData ?? []).map((u) => [u.email.toLowerCase(), u.id] as const),
  );

  const createdPipelines: string[] = [];
  const createdStages: string[] = [];

  async function resolvePipelineId(name: string): Promise<string> {
    const key = name.toLowerCase();
    const found = pipelineByName.get(key);
    if (found) return found;
    const { data: last } = await sb
      .from("pipelines")
      .select("position")
      .eq("is_archived", false)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: created } = await sb
      .from("pipelines")
      .insert({ name, position: (last?.position ?? 0) + 1 })
      .select("id")
      .single();
    if (!created) throw new Error(`Failed to create pipeline "${name}".`);
    pipelineByName.set(key, created.id);
    createdPipelines.push(name);
    return created.id;
  }

  async function resolveStageId(pipelineId: string, name: string): Promise<string> {
    const key = `${pipelineId}|${name.toLowerCase()}`;
    const found = stageByKey.get(key);
    if (found) return found;
    const { data: max } = await sb
      .from("lead_stages")
      .select("position")
      .eq("pipeline_id", pipelineId)
      .eq("is_archived", false)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: created } = await sb
      .from("lead_stages")
      .insert({
        name,
        color: "#F37335",
        kind: "open",
        position: (max?.position ?? 0) + 1,
        pipeline_id: pipelineId,
      })
      .select("id")
      .single();
    if (!created) throw new Error(`Failed to create stage "${name}".`);
    stageByKey.set(key, created.id);
    createdStages.push(name);
    return created.id;
  }

  // Fallback first pipeline/stage
  const firstPipelineId =
    (pipelinesData ?? [])[0]?.id ??
    (await resolvePipelineId("Default"));
  const { data: firstStageForPipeline } = await sb
    .from("lead_stages")
    .select("id")
    .eq("pipeline_id", firstPipelineId)
    .eq("is_archived", false)
    .order("position")
    .limit(1)
    .maybeSingle();

  let skipped = 0;
  const rows: Array<Record<string, unknown>> = [];
  const failedRows: string[] = [];

  for (const row of parsed.data) {
    const name = String(row.name ?? row.Name ?? "").trim();
    if (!name) {
      skipped++;
      continue;
    }

    const custom: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const f = fieldMap.get(key);
      if (!f || value == null || value === "") continue;
      if (f.type === "number") custom[key] = Number(value);
      else if (f.type === "checkbox")
        custom[key] = ["true", "1", "yes", "y"].includes(String(value).toLowerCase());
      else custom[key] = value;
    }

    let stageId: string | null = firstStageForPipeline?.id ?? null;
    let ownerId: string | null = session.userId;

    try {
      const pipelineName = String(row.pipeline ?? row.Pipeline ?? "").trim();
      const stageName = String(row.stage ?? row.Stage ?? "").trim();
      const ownerEmail = String(row.owner_email ?? row.OwnerEmail ?? "")
        .trim()
        .toLowerCase();

      const pipelineId = pipelineName
        ? await resolvePipelineId(pipelineName)
        : firstPipelineId;
      if (stageName) {
        stageId = await resolveStageId(pipelineId, stageName);
      } else if (!pipelineName) {
        stageId = firstStageForPipeline?.id ?? null;
      } else {
        const { data: firstOfPipeline } = await sb
          .from("lead_stages")
          .select("id")
          .eq("pipeline_id", pipelineId)
          .eq("is_archived", false)
          .order("position")
          .limit(1)
          .maybeSingle();
        stageId = firstOfPipeline?.id ?? null;
      }

      if (ownerEmail) {
        const found = userByEmail.get(ownerEmail);
        if (found) ownerId = found;
      }
    } catch (err) {
      failedRows.push(err instanceof Error ? err.message : String(err));
      skipped++;
      continue;
    }

    const tags = parseTagCell(row.tags ?? row.Tags);

    rows.push({
      name,
      phone: String(row.phone ?? row.Phone ?? "").trim() || null,
      email: String(row.email ?? row.Email ?? "").trim() || null,
      source: "csv",
      stage_id: stageId,
      owner_id: ownerId,
      custom,
      tags,
    });
  }

  if (rows.length === 0) {
    return {
      error:
        failedRows.length > 0
          ? `No rows imported. First error: ${failedRows[0]}`
          : "No importable rows found (need at least a name column).",
    };
  }

  const { error, count } = await sb.from("leads").insert(rows).select("id", { count: "exact" });
  if (error) return { error: error.message };

  revalidatePath("/leads/kanban");
  revalidatePath("/leads");
  return {
    ok: true,
    inserted: count ?? rows.length,
    skipped,
    created: { pipelines: createdPipelines, stages: createdStages },
  };
}

function parseTagCell(raw: unknown): string[] {
  if (raw == null) return [];
  return Array.from(
    new Set(
      String(raw)
        .split(/[|,;]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0),
    ),
  );
}
