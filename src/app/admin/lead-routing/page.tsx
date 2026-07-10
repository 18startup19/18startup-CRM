import { PageHeader } from "@/components/page-header";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatDateTime } from "@/lib/utils";
import {
  RoutingManager,
  type StageOption,
  type UnmatchedKey,
} from "@/components/admin/routing-manager";
import type {
  IntakeSettingsRow,
  LeadRoutingRuleRow,
  LeadStageRow,
  PipelineRow,
} from "@/lib/database.types";

interface RecentLead {
  source: string | null;
  custom: Record<string, unknown> | null;
  created_at: string;
}

export default async function LeadRoutingPage() {
  const sb = supabaseAdmin();

  const [
    { data: rulesData },
    { data: stagesData },
    { data: pipelinesData },
    { data: settingsData },
    { data: recentLeadsData },
  ] = await Promise.all([
    sb
      .from("lead_routing_rules")
      .select("*")
      .order("created_at", { ascending: false }),
    sb
      .from("lead_stages")
      .select("id,name,color,pipeline_id,position,is_archived")
      .eq("is_archived", false)
      .order("pipeline_id")
      .order("position"),
    sb
      .from("pipelines")
      .select("id,name")
      .eq("is_archived", false)
      .order("position"),
    sb
      .from("intake_settings")
      .select("fallback_stage_id")
      .eq("id", 1)
      .maybeSingle<Pick<IntakeSettingsRow, "fallback_stage_id">>(),
    // Recent inbound leads for the "unmatched keys" discovery panel.
    sb
      .from("leads")
      .select("source,custom,created_at")
      .in("source", ["razorpay", "webflow"])
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const rules = (rulesData ?? []) as LeadRoutingRuleRow[];
  const stages = (stagesData ?? []) as Pick<
    LeadStageRow,
    "id" | "name" | "color" | "pipeline_id" | "position" | "is_archived"
  >[];
  const pipelines = (pipelinesData ?? []) as Pick<PipelineRow, "id" | "name">[];
  const pipelineNameById = new Map(pipelines.map((p) => [p.id, p.name]));

  const stageOptions: StageOption[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    pipelineName: pipelineNameById.get(s.pipeline_id) ?? "Unknown pipeline",
  }));

  const stageById = new Map(stageOptions.map((s) => [s.id, s]));
  const decoratedRules = rules.map((r) => {
    const s = stageById.get(r.stage_id);
    return {
      ...r,
      stage_name: s?.name ?? "Unknown stage",
      stage_color: s?.color ?? "#94a3b8",
      pipeline_name: s?.pipelineName ?? "Unknown pipeline",
    };
  });

  const activeMatchValues = new Set(
    rules.filter((r) => r.is_active).map((r) => `${r.source}:${r.match_value}`),
  );
  const unmatchedMap = new Map<
    string,
    { source: "razorpay" | "webflow"; match_value: string; count: number; last_seen_iso: string }
  >();
  for (const l of (recentLeadsData ?? []) as RecentLead[]) {
    if (l.source !== "razorpay" && l.source !== "webflow") continue;
    const key = (l.custom as { __routing_key?: string } | null)?.__routing_key;
    if (!key) continue;
    const combo = `${l.source}:${key}`;
    if (activeMatchValues.has(combo)) continue;
    const entry = unmatchedMap.get(combo);
    if (entry) {
      entry.count += 1;
    } else {
      unmatchedMap.set(combo, {
        source: l.source as "razorpay" | "webflow",
        match_value: key,
        count: 1,
        last_seen_iso: l.created_at,
      });
    }
  }
  const unmatched: UnmatchedKey[] = Array.from(unmatchedMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((u) => ({
      source: u.source,
      match_value: u.match_value,
      count: u.count,
      last_seen_label: formatDateTime(u.last_seen_iso),
    }));

  return (
    <>
      <PageHeader
        title="Lead Routing"
        subtitle="Send each Razorpay payment page and each Webflow form to its own stage. Fallback catches anything unmatched."
      />
      <div className="p-8">
        <RoutingManager
          rules={decoratedRules}
          stages={stageOptions}
          fallbackStageId={settingsData?.fallback_stage_id ?? null}
          unmatched={unmatched}
        />
      </div>
    </>
  );
}
