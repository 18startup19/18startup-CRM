import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { LeadCockpit } from "@/components/leads/lead-cockpit";
import { getTagSuggestions } from "@/lib/tag-suggestions";
import type {
  CustomFieldRow,
  LeadNoteRow,
  LeadActivityRow,
  LeadAmountRow,
  LeadRow,
  LeadStageRow,
  CommunicationRow,
  UserRow,
  EmailTemplateRow,
  WhatsAppTemplateRow,
  FaqTemplateRow,
} from "@/lib/database.types";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: Params) {
  const session = await requireSession();
  const { id } = await params;
  const sb = supabaseAdmin();

  const [
    leadRes,
    stagesRes,
    fieldsRes,
    usersRes,
    notesRes,
    actsRes,
    commsRes,
    emailTplRes,
    waTplRes,
    meRes,
    faqRes,
  ] = await Promise.all([
      sb.from("leads").select("*").eq("id", id).maybeSingle(),
      sb.from("lead_stages").select("*").eq("is_archived", false).order("position"),
      sb.from("custom_fields").select("*").eq("is_archived", false).order("position"),
      sb.from("users").select("id,name,email").eq("is_active", true),
      sb.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      sb.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
      sb.from("communications").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
      // Non-admin members only see templates the admin has marked visible.
      session.role === "admin"
        ? sb.from("email_templates").select("*").eq("is_archived", false).order("name")
        : sb
            .from("email_templates")
            .select("*")
            .eq("is_archived", false)
            .eq("visible_to_members", true)
            .order("name"),
      session.role === "admin"
        ? sb.from("whatsapp_templates").select("*").eq("is_active", true).order("name")
        : sb
            .from("whatsapp_templates")
            .select("*")
            .eq("is_active", true)
            .eq("visible_to_members", true)
            .order("name"),
      sb.from("users").select("permissions").eq("id", session.userId).maybeSingle(),
      // FAQ templates available to this user (their own + team-shared).
      sb
        .from("faq_templates")
        .select("*")
        .eq("is_archived", false)
        .or(`owner_id.eq.${session.userId},owner_id.is.null`)
        .order("title"),
    ]);

  const tagSuggestions = await getTagSuggestions();

  const [{ data: amountsData }, { data: cohortsData }] = await Promise.all([
    sb
      .from("lead_amounts")
      .select("id,amount,note,cohort_number,created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
    sb
      .from("cohorts")
      .select("number,label")
      .eq("is_active", true)
      .order("number", { ascending: false }),
  ]);
  const amounts = (amountsData ?? []) as Pick<
    LeadAmountRow,
    "id" | "amount" | "note" | "cohort_number" | "created_at"
  >[];
  const amountTotal = amounts.reduce((sum, a) => sum + Number(a.amount), 0);
  const activeCohorts = (cohortsData ?? []) as {
    number: string;
    label: string | null;
  }[];

  // Most recent call outcome for this lead — used to prefill the log-call form.
  const { data: lastCallLogRow } = await sb
    .from("communications")
    .select("outcome,body")
    .eq("lead_id", id)
    .eq("channel", "call")
    .not("outcome", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ outcome: string | null; body: string | null }>();
  const lastCallLog = {
    outcome: lastCallLogRow?.outcome ?? "",
    nextCallbackAt: leadRes.data
      ? ((leadRes.data as { next_callback_at: string | null }).next_callback_at ??
        null)
      : null,
  };

  const lead = leadRes.data as LeadRow | null;
  if (!lead) notFound();

  const permissions =
    (meRes.data?.permissions as Record<string, boolean> | undefined) ?? {};
  const canSeeAll =
    session.role === "admin" || permissions["leads:view_all"] === true;
  if (!canSeeAll && lead.owner_id !== session.userId) notFound();

  return (
    <LeadCockpit
      session={session}
      permissions={permissions}
      lead={lead}
      stages={(stagesRes.data ?? []) as LeadStageRow[]}
      fields={(fieldsRes.data ?? []) as CustomFieldRow[]}
      users={(usersRes.data ?? []) as Pick<UserRow, "id" | "name" | "email">[]}
      notes={(notesRes.data ?? []) as LeadNoteRow[]}
      activities={(actsRes.data ?? []) as LeadActivityRow[]}
      communications={(commsRes.data ?? []) as CommunicationRow[]}
      emailTemplates={(emailTplRes.data ?? []) as EmailTemplateRow[]}
      whatsappTemplates={(waTplRes.data ?? []) as WhatsAppTemplateRow[]}
      faqTemplates={(faqRes.data ?? []) as FaqTemplateRow[]}
      tagSuggestions={tagSuggestions}
      lastCallLog={lastCallLog}
      amounts={amounts.map((a) => ({
        id: a.id,
        amount: Number(a.amount),
        note: a.note,
        cohort_number: a.cohort_number,
        created_at: a.created_at,
      }))}
      amountTotal={amountTotal}
      cohorts={activeCohorts}
    />
  );
}
