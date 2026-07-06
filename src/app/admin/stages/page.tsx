import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/page-header";
import { StagesManager } from "@/components/admin/stages-manager";
import type { LeadStageRow, PipelineRow } from "@/lib/database.types";

export default async function StagesPage() {
  const sb = supabaseAdmin();
  const [{ data: pipelinesData }, { data: stagesData }] = await Promise.all([
    sb.from("pipelines").select("*").eq("is_archived", false).order("position"),
    // Pull archived rows too — the manager renders them in a collapsed
    // "Archived" section so admins can restore them.
    sb.from("lead_stages").select("*").order("position"),
  ]);
  const pipelines = (pipelinesData ?? []) as PipelineRow[];
  const stages = (stagesData ?? []) as LeadStageRow[];
  return (
    <>
      <PageHeader
        title="Lead stages"
        subtitle="Stages belong to a pipeline. Add pipelines from the Kanban view."
      />
      <div className="p-8">
        <StagesManager stages={stages} pipelines={pipelines} />
      </div>
    </>
  );
}
