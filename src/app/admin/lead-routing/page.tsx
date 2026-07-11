import { PageHeader } from "@/components/page-header";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatDateTime } from "@/lib/utils";
import { fetchWebflowForms } from "@/lib/integrations/webflow";
import {
  RoutingManager,
  type StageOption,
  type UnmatchedKey,
} from "@/components/admin/routing-manager";
import {
  WebflowFormsManager,
  type CustomFieldOption,
  type FormFieldRow,
  type WebflowFormEntry,
} from "@/components/admin/webflow-forms-manager";
import type {
  CustomFieldRow,
  IntakeSettingsRow,
  LeadFieldMappingRow,
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
    { data: customFieldsData },
    { data: mappingsData },
    { data: hiddenFormsData },
    webflowResult,
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
    sb
      .from("custom_fields")
      .select("key,label")
      .eq("is_archived", false)
      .order("position"),
    sb
      .from("lead_field_mappings")
      .select("id,source,form_key,external_field,crm_target")
      .eq("source", "webflow"),
    sb
      .from("hidden_admin_forms")
      .select("form_key")
      .eq("source", "webflow"),
    fetchWebflowForms(),
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

  // ─── Webflow forms + field mapping ────────────────────────────────────
  const customFieldOptions: CustomFieldOption[] = (
    (customFieldsData ?? []) as Pick<CustomFieldRow, "key" | "label">[]
  ).map((c) => ({ key: c.key, label: c.label }));

  const allMappings = (mappingsData ?? []) as Pick<
    LeadFieldMappingRow,
    "id" | "form_key" | "external_field" | "crm_target"
  >[];
  // Index mappings by (form_key -> external_field)
  const mappingIndex = new Map<string, Map<string, { id: string; target: string }>>();
  for (const m of allMappings) {
    let inner = mappingIndex.get(m.form_key);
    if (!inner) {
      inner = new Map();
      mappingIndex.set(m.form_key, inner);
    }
    inner.set(m.external_field, { id: m.id, target: m.crm_target });
  }

  // Observed field names per form from recent submissions (webhook stashes
  // custom.__raw_fields). Falls back when the Webflow API isn't reachable
  // or the form was created before we started calling the API.
  const observedFieldsPerForm = new Map<string, Set<string>>();
  const seenForms = new Set<string>();
  for (const l of (recentLeadsData ?? []) as RecentLead[]) {
    if (l.source !== "webflow") continue;
    const custom = (l.custom as Record<string, unknown> | null) ?? {};
    const formName = custom.webflow_form_name;
    if (typeof formName !== "string" || !formName) continue;
    seenForms.add(formName);
    const raws = custom.__raw_fields;
    if (Array.isArray(raws)) {
      let set = observedFieldsPerForm.get(formName);
      if (!set) {
        set = new Set();
        observedFieldsPerForm.set(formName, set);
      }
      for (const r of raws) if (typeof r === "string") set.add(r);
    }
  }

  const hiddenFormKeys = new Set(
    ((hiddenFormsData ?? []) as { form_key: string }[]).map((h) => h.form_key),
  );

  // Map Webflow form name → routing target stage id (from active rules).
  const webflowRouteByForm = new Map<string, string>();
  for (const r of rules) {
    if (r.source !== "webflow" || !r.is_active) continue;
    webflowRouteByForm.set(r.match_value, r.stage_id);
  }

  const webflowFormsAll: WebflowFormEntry[] = webflowResult.ok
    ? webflowResult.forms.map((f) => {
        const fieldSchema = f.fields ?? {};
        const apiFields = Object.entries(fieldSchema).map(([, v]) => ({
          displayName: v.displayName,
          slug: v.slug,
          type: v.type,
        }));
        const merged = new Map<string, { displayName: string; slug: string; type: string }>();
        for (const af of apiFields) merged.set(af.displayName, af);
        // Add any observed fields not in the API schema (e.g., admin renamed
        // the form after publishing).
        for (const obs of observedFieldsPerForm.get(f.displayName) ?? []) {
          if (!merged.has(obs)) merged.set(obs, { displayName: obs, slug: "", type: "observed" });
        }
        const inner = mappingIndex.get(f.displayName);
        const fields: FormFieldRow[] = Array.from(merged.values()).map((mf) => {
          const m = inner?.get(mf.displayName);
          return {
            displayName: mf.displayName,
            slug: mf.slug,
            type: mf.type,
            current: m?.target ?? null,
            mappingId: m?.id ?? null,
          };
        });
        return {
          id: f.id,
          displayName: f.displayName,
          seen: seenForms.has(f.displayName),
          fields,
          routeStageId: webflowRouteByForm.get(f.displayName) ?? null,
        };
      })
    : Array.from(seenForms).map((formName) => {
        // API unavailable — fall back to observed forms only.
        const inner = mappingIndex.get(formName);
        const fields: FormFieldRow[] = Array.from(
          observedFieldsPerForm.get(formName) ?? [],
        ).map((name) => {
          const m = inner?.get(name);
          return {
            displayName: name,
            slug: "",
            type: "observed",
            current: m?.target ?? null,
            mappingId: m?.id ?? null,
          };
        });
        return {
          id: formName,
          displayName: formName,
          seen: true,
          fields,
          routeStageId: webflowRouteByForm.get(formName) ?? null,
        };
      });

  const webflowForms = webflowFormsAll.filter(
    (f) => !hiddenFormKeys.has(f.displayName),
  );
  const webflowFormsHidden = webflowFormsAll.filter((f) =>
    hiddenFormKeys.has(f.displayName),
  );

  return (
    <>
      <PageHeader
        title="Lead Routing"
        subtitle="Send each Razorpay payment page and each Webflow form to its own stage. Fallback catches anything unmatched."
      />
      <div className="p-8 flex flex-col gap-6">
        <RoutingManager
          rules={decoratedRules}
          stages={stageOptions}
          fallbackStageId={settingsData?.fallback_stage_id ?? null}
          unmatched={unmatched}
        />
        <WebflowFormsManager
          forms={webflowForms}
          hiddenForms={webflowFormsHidden}
          customFields={customFieldOptions}
          stages={stageOptions}
          apiError={webflowResult.ok ? null : webflowResult.error ?? null}
        />
      </div>
    </>
  );
}
