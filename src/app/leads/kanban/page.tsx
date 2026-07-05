import { PageHeader } from "@/components/page-header";
import { KanbanBoard } from "@/components/leads/kanban-board";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type {
  CustomFieldRow,
  LeadRow,
  LeadStageRow,
  PipelineRow,
  UserRow,
} from "@/lib/database.types";

const DEFAULT_CARD_FIELDS = ["phone", "next_callback_at"];

function matchJsFilter(
  lead: LeadRow,
  f: { field: string; op: string; value: string },
  stageNameById: Map<string, string>,
): boolean {
  let val: unknown;
  if (f.field === "stage") {
    val = lead.stage_id ? stageNameById.get(lead.stage_id) ?? "" : "";
  } else if (f.field === "is_dnc") {
    val = lead.is_dnc;
  } else if (f.field.startsWith("custom.")) {
    val = (lead.custom as Record<string, unknown>)?.[f.field.slice(7)];
  } else {
    val = (lead as unknown as Record<string, unknown>)[f.field];
  }
  const target = f.value.toLowerCase();
  const cur = val == null ? "" : String(val).toLowerCase();
  switch (f.op) {
    case "eq":
      return cur === target;
    case "neq":
      return cur !== target;
    case "contains":
      return cur.includes(target);
    case "is_empty":
      return cur === "";
    case "is_not_empty":
      return cur !== "";
    default:
      return true;
  }
}

type SortKey = "updated_desc" | "created_desc" | "created_asc" | "name_asc";

interface PageProps {
  searchParams: Promise<{
    pipeline?: string;
    q?: string;
    owner?: string;
    tag?: string;
    dnc?: string;
    sort?: SortKey;
    // Generic field filters: filter=<field>|<op>|<value> (URL-encoded).
    // May appear multiple times. Handled by getAll("filter").
    filter?: string | string[];
  }>;
}

export default async function KanbanPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const { data: userRow } = await sb
    .from("users")
    .select("permissions,pipeline_ids")
    .eq("id", session.userId)
    .maybeSingle();
  const perms = (userRow?.permissions as Record<string, boolean> | null) ?? {};
  const canSeeAll = session.role === "admin" || perms["leads:view_all"] === true;
  const allowedPipelineIds = (userRow?.pipeline_ids as string[] | null) ?? [];

  const [
    { data: pipelinesData },
    { data: stagesData },
    { data: customFieldsData },
    { data: settingsData },
    { data: usersData },
  ] = await Promise.all([
    sb.from("pipelines").select("*").eq("is_archived", false).order("position"),
    sb.from("lead_stages").select("*").eq("is_archived", false).order("position"),
    sb.from("custom_fields").select("*").eq("is_archived", false).order("position"),
    sb.from("integration_settings").select("config").eq("id", 1).maybeSingle(),
    sb.from("users").select("id,name").eq("is_active", true),
  ]);

  let pipelines = (pipelinesData ?? []) as PipelineRow[];
  // Non-admin members with pipeline_ids set see only those pipelines.
  if (session.role !== "admin" && allowedPipelineIds.length > 0) {
    pipelines = pipelines.filter((p) => allowedPipelineIds.includes(p.id));
  }

  const allStages = (stagesData ?? []) as LeadStageRow[];
  const customFields = (customFieldsData ?? []) as CustomFieldRow[];
  const users = (usersData ?? []) as Pick<UserRow, "id" | "name">[];
  const ownerNamesById = Object.fromEntries(users.map((u) => [u.id, u.name]));

  const params = await searchParams;
  const activePipelineId =
    (params.pipeline && pipelines.find((p) => p.id === params.pipeline)?.id) ??
    pipelines[0]?.id ??
    "";

  const stages = allStages.filter((s) => s.pipeline_id === activePipelineId);

  const stageIds = stages.map((s) => s.id);
  const sort: SortKey = params.sort ?? "updated_desc";

  let leadsQuery = sb
    .from("leads")
    .select("*")
    .in("stage_id", stageIds.length ? stageIds : ["__none__"])
    .limit(1000);

  switch (sort) {
    case "created_desc":
      leadsQuery = leadsQuery.order("created_at", { ascending: false });
      break;
    case "created_asc":
      leadsQuery = leadsQuery.order("created_at", { ascending: true });
      break;
    case "name_asc":
      leadsQuery = leadsQuery.order("name", { ascending: true });
      break;
    case "updated_desc":
    default:
      leadsQuery = leadsQuery.order("updated_at", { ascending: false });
  }

  if (!canSeeAll) leadsQuery = leadsQuery.eq("owner_id", session.userId);
  if (params.owner) leadsQuery = leadsQuery.eq("owner_id", params.owner);
  if (params.dnc === "1") leadsQuery = leadsQuery.eq("is_dnc", true);
  if (params.tag) leadsQuery = leadsQuery.contains("tags", [params.tag]);
  if (params.q) {
    const q = `%${params.q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    leadsQuery = leadsQuery.or(`name.ilike.${q},phone.ilike.${q},email.ilike.${q}`);
  }

  // Generic filters — each entry is "field|op|value". We apply built-in
  // columns via SQL and stash the rest for JS post-filtering (custom fields,
  // which live inside the JSONB `custom` column, and stage-name).
  const rawFilters = Array.isArray(params.filter)
    ? params.filter
    : params.filter
      ? [params.filter]
      : [];
  const jsFilters: { field: string; op: string; value: string }[] = [];
  for (const raw of rawFilters) {
    const [field, op, ...rest] = raw.split("|");
    const value = rest.join("|");
    if (!field || !op) continue;
    // Try to push into SQL for built-in fields
    if (["name", "phone", "email", "source"].includes(field)) {
      if (op === "eq") leadsQuery = leadsQuery.eq(field, value);
      else if (op === "neq") leadsQuery = leadsQuery.neq(field, value);
      else if (op === "contains") {
        const v = `%${value.replace(/[%_]/g, (m) => `\\${m}`)}%`;
        leadsQuery = leadsQuery.ilike(field, v);
      } else if (op === "is_empty") leadsQuery = leadsQuery.or(`${field}.is.null,${field}.eq.`);
      else if (op === "is_not_empty") leadsQuery = leadsQuery.not(field, "is", null);
      else jsFilters.push({ field, op, value });
    } else {
      // stage-name, custom.*, is_dnc, etc. — post-filter in JS
      jsFilters.push({ field, op, value });
    }
  }

  const { data: leadsData } = await leadsQuery;
  const stageIdSet = new Set(stageIds);
  let leads = ((leadsData ?? []) as LeadRow[]).filter(
    (l) => l.stage_id && stageIdSet.has(l.stage_id),
  );

  if (jsFilters.length > 0) {
    const stageNameById = new Map(allStages.map((s) => [s.id, s.name.toLowerCase()]));
    leads = leads.filter((l) =>
      jsFilters.every((f) => matchJsFilter(l, f, stageNameById)),
    );
  }

  const leadsByStage = leads.reduce<Record<string, LeadRow[]>>((acc, l) => {
    if (!l.stage_id) return acc;
    (acc[l.stage_id] ??= []).push(l);
    return acc;
  }, {});

  const cfg = (settingsData?.config as Record<string, unknown> | null) ?? {};
  const cardFields = Array.isArray(cfg.kanban_card_fields)
    ? (cfg.kanban_card_fields as string[])
    : DEFAULT_CARD_FIELDS;

  // Distinct tags from every non-archived lead — so the filter dropdown and
  // the tag chip input suggestions include tags used on OTHER leads too, not
  // just what's currently visible.
  const { data: tagRows } = await sb.from("leads").select("tags").limit(5000);
  const tagSet = new Set<string>();
  for (const row of (tagRows ?? []) as { tags: string[] | null }[]) {
    for (const t of row.tags ?? []) tagSet.add(t);
  }
  const tagOptions = Array.from(tagSet).sort();

  const activeFilters = rawFilters
    .map((raw) => {
      const [field, op, ...rest] = raw.split("|");
      return field && op ? { field, op, value: rest.join("|") } : null;
    })
    .filter((x): x is { field: string; op: string; value: string } => x !== null);

  return (
    <>
      <PageHeader title="Kanban" subtitle="Drag cards between stages to move them." />
      <KanbanBoard
        pipelines={pipelines}
        activePipelineId={activePipelineId}
        stages={stages}
        allStages={allStages}
        leadsByStage={leadsByStage}
        customFields={customFields}
        cardFields={cardFields}
        ownerNamesById={ownerNamesById}
        users={users}
        isAdmin={session.role === "admin"}
        filters={{
          q: params.q ?? "",
          owner: params.owner ?? "",
          tag: params.tag ?? "",
          dnc: params.dnc === "1",
          sort,
        }}
        tagOptions={tagOptions}
        activeFilters={activeFilters}
      />
    </>
  );
}
