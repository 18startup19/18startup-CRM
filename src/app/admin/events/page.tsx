import { PageHeader } from "@/components/page-header";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";
import { EventsManager } from "@/components/admin/events-manager";
import type {
  EventRow,
  LeadStageRow,
  PipelineRow,
  UserRow,
} from "@/lib/database.types";

export default async function AdminEventsPage() {
  await requireAdmin();
  const sb = supabaseAdmin();

  const [
    { data: eventsData },
    { data: pipelinesData },
    { data: stagesData },
    { data: usersData },
    { data: regCountsData },
  ] = await Promise.all([
    sb.from("events").select("*").order("starts_at", { ascending: false }),
    sb.from("pipelines").select("id,name").order("name"),
    sb
      .from("lead_stages")
      .select("id,name,pipeline_id,color")
      .eq("is_archived", false)
      .order("position"),
    sb
      .from("users")
      .select("id,name,email")
      .eq("is_active", true)
      .order("name"),
    sb.from("event_registrations").select("event_id,attended_at"),
  ]);

  const events = (eventsData ?? []) as EventRow[];
  const regs = (regCountsData ?? []) as {
    event_id: string;
    attended_at: string | null;
  }[];

  const statsByEvent = new Map<string, { registered: number; attended: number }>();
  for (const r of regs) {
    const s = statsByEvent.get(r.event_id) ?? { registered: 0, attended: 0 };
    s.registered++;
    if (r.attended_at) s.attended++;
    statsByEvent.set(r.event_id, s);
  }
  const decorated = events.map((e) => ({
    ...e,
    stats: statsByEvent.get(e.id) ?? { registered: 0, attended: 0 },
  }));

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Create public event pages, take registrations, mark attendance from a venue QR."
      />
      <div className="p-8">
        <EventsManager
          events={decorated}
          pipelines={(pipelinesData ?? []) as Pick<PipelineRow, "id" | "name">[]}
          stages={
            (stagesData ?? []) as Pick<
              LeadStageRow,
              "id" | "name" | "pipeline_id" | "color"
            >[]
          }
          users={(usersData ?? []) as Pick<UserRow, "id" | "name" | "email">[]}
        />
      </div>
    </>
  );
}
