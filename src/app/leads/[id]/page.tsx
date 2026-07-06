import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { LeadCockpit } from "@/components/leads/lead-cockpit";
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
} from "@/lib/database.types";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: Params) {
  const session = await requireSession();
  const { id } = await params;
  const sb = supabaseAdmin();

  const [leadRes, stagesRes, fieldsRes, usersRes, notesRes, actsRes, commsRes, emailTplRes, waTplRes, meRes, tagRes] =
    await Promise.all([
      sb.from("leads").select("*").eq("id", id).maybeSingle(),
      sb.from("lead_stages").select("*").eq("is_archived", false).order("position"),
      sb.from("custom_fields").select("*").eq("is_archived", false).order("position"),
      sb.from("users").select("id,name,email").eq("is_active", true),
      sb.from("lead_notes").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      sb.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
      sb.from("communications").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
      sb.from("email_templates").select("*").eq("is_archived", false).order("name"),
      sb.from("whatsapp_templates").select("*").eq("is_active", true).order("name"),
      sb.from("users").select("permissions").eq("id", session.userId).maybeSingle(),
      sb.from("leads").select("tags").limit(5000),
    ]);

  const tagSuggestionSet = new Set<string>();
  for (const row of (tagRes.data ?? []) as { tags: string[] | null }[]) {
    for (const t of row.tags ?? []) tagSuggestionSet.add(t);
  }
  const tagSuggestions = Array.from(tagSuggestionSet).sort();

  const { data: amountsData } = await sb
    .from("lead_amounts")
    .select("id,amount,note,created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: false });
  const amounts = (amountsData ?? []) as Pick<
    LeadAmountRow,
    "id" | "amount" | "note" | "created_at"
  >[];
  const amountTotal = amounts.reduce((sum, a) => sum + Number(a.amount), 0);

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
      tagSuggestions={tagSuggestions}
      lastCallLog={lastCallLog}
      amounts={amounts.map((a) => ({
        id: a.id,
        amount: Number(a.amount),
        note: a.note,
        created_at: a.created_at,
      }))}
      amountTotal={amountTotal}
    />
  );
}
