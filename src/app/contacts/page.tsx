import { PageHeader } from "@/components/page-header";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrManager } from "@/lib/rbac-server";
import { ContactsView } from "@/components/contacts/contacts-view";
import { formatDateTime } from "@/lib/utils";
import type {
  EmailTemplateRow,
  LeadRow,
  LeadStageRow,
  UserRow,
  WhatsAppTemplateRow,
} from "@/lib/database.types";

interface RecentCommRow {
  lead_id: string;
  created_at: string;
}

// Contacts: the full flat table view of every lead in the CRM. Access is
// gated to admin + manager (a regular member goes to /leads/kanban). Table
// supports select-all, filter, and bulk email / bulk WhatsApp actions.
export default async function ContactsPage() {
  await requireAdminOrManager();

  const sb = supabaseAdmin();
  const [
    { data: leadsData },
    { data: stagesData },
    { data: usersData },
    { data: emailTemplatesData },
    { data: waTemplatesData },
    { data: commsData },
  ] = await Promise.all([
    sb
      .from("leads")
      .select("id,name,phone,email,stage_id,owner_id,tags,is_dnc,created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    sb
      .from("lead_stages")
      .select("id,name,color,pipeline_id")
      .eq("is_archived", false)
      .order("position"),
    sb
      .from("users")
      .select("id,name,email")
      .eq("is_active", true)
      .order("name"),
    sb
      .from("email_templates")
      .select("id,name,subject")
      .eq("is_archived", false)
      .order("name"),
    sb
      .from("whatsapp_templates")
      .select("id,name,approval_status")
      .eq("is_active", true)
      .order("name"),
    // For "Last contacted" column — pull most recent outbound comm per lead.
    // Bounded to 20k rows for perf; groupBy done client-side.
    sb
      .from("communications")
      .select("lead_id,created_at")
      .order("created_at", { ascending: false })
      .limit(20000),
  ]);

  const leads = (leadsData ?? []) as Pick<
    LeadRow,
    | "id"
    | "name"
    | "phone"
    | "email"
    | "stage_id"
    | "owner_id"
    | "tags"
    | "is_dnc"
    | "created_at"
  >[];

  // Reduce comm rows into "most recent per lead" in a single pass. Rows are
  // already sorted desc by created_at, so the first one we see per lead is
  // the newest.
  const lastCommByLead = new Map<string, string>();
  for (const c of (commsData ?? []) as RecentCommRow[]) {
    if (!lastCommByLead.has(c.lead_id)) {
      lastCommByLead.set(c.lead_id, c.created_at);
    }
  }

  const decoratedLeads = leads.map((l) => ({
    ...l,
    last_contacted_iso: lastCommByLead.get(l.id) ?? null,
    last_contacted_label: lastCommByLead.has(l.id)
      ? formatDateTime(lastCommByLead.get(l.id)!)
      : "—",
    created_label: formatDateTime(l.created_at),
  }));

  return (
    <>
      <PageHeader
        title="Contacts"
        subtitle="Every lead in the CRM. Filter and bulk-message from here."
      />
      <div className="p-8">
        <ContactsView
          leads={decoratedLeads}
          stages={
            (stagesData ?? []) as Pick<
              LeadStageRow,
              "id" | "name" | "color" | "pipeline_id"
            >[]
          }
          users={(usersData ?? []) as Pick<UserRow, "id" | "name" | "email">[]}
          emailTemplates={
            (emailTemplatesData ?? []) as Pick<
              EmailTemplateRow,
              "id" | "name" | "subject"
            >[]
          }
          waTemplates={
            (waTemplatesData ?? []) as Pick<
              WhatsAppTemplateRow,
              "id" | "name" | "approval_status"
            >[]
          }
        />
      </div>
    </>
  );
}
