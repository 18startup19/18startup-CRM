import { PageHeader } from "@/components/page-header";
import { WhatsAppInbox } from "@/components/whatsapp/whatsapp-inbox";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type {
  CommunicationRow,
  LeadRow,
  WhatsAppTemplateRow,
} from "@/lib/database.types";

interface PageProps {
  searchParams: Promise<{ lead?: string }>;
}

export interface WhatsAppConversation {
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastDirection: "inbound" | "outbound";
  lastStatus: string;
  unread: number;
}

export default async function WhatsAppPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const { data: userRow } = await sb
    .from("users")
    .select("permissions")
    .eq("id", session.userId)
    .maybeSingle();
  const canSeeAll =
    session.role === "admin" ||
    (userRow?.permissions as Record<string, boolean> | null)?.["leads:view_all"] === true;

  // Pull the most recent WhatsApp comms and group them by lead. Cap at 500 rows
  // for the initial load — enough for a busy inbox and cheap for postgres.
  let commsQ = sb
    .from("communications")
    .select("id,lead_id,body,direction,status,created_at")
    .eq("channel", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(500);

  if (!canSeeAll) {
    const { data: myLeads } = await sb
      .from("leads")
      .select("id")
      .eq("owner_id", session.userId);
    const ids = (myLeads ?? []).map((l) => l.id);
    commsQ = commsQ.in("lead_id", ids.length ? ids : ["__none__"]);
  }

  const [{ data: allComms }, { data: waTemplates }] = await Promise.all([
    commsQ,
    sb.from("whatsapp_templates").select("*").eq("is_active", true),
  ]);

  type CommRow = Pick<
    CommunicationRow,
    "id" | "lead_id" | "body" | "direction" | "status" | "created_at"
  >;
  const rows = (allComms ?? []) as CommRow[];

  // Latest message per lead
  const latestByLead = new Map<string, CommRow>();
  const unreadByLead = new Map<string, number>();
  for (const c of rows) {
    if (!latestByLead.has(c.lead_id)) latestByLead.set(c.lead_id, c);
    if (c.direction === "inbound" && c.status !== "read") {
      unreadByLead.set(c.lead_id, (unreadByLead.get(c.lead_id) ?? 0) + 1);
    }
  }

  const leadIds = Array.from(latestByLead.keys());
  const { data: leadsData } = leadIds.length
    ? await sb.from("leads").select("id,name,phone,owner_id").in("id", leadIds)
    : { data: [] };

  const leadsById = new Map(
    ((leadsData ?? []) as Pick<LeadRow, "id" | "name" | "phone" | "owner_id">[]).map((l) => [
      l.id,
      l,
    ]),
  );

  const conversations: WhatsAppConversation[] = leadIds
    .map((id) => {
      const last = latestByLead.get(id)!;
      const lead = leadsById.get(id);
      if (!lead) return null;
      return {
        leadId: id,
        leadName: lead.name,
        leadPhone: lead.phone,
        lastMessage: last.body ?? "",
        lastMessageAt: last.created_at,
        lastDirection: last.direction as "inbound" | "outbound",
        lastStatus: last.status,
        unread: unreadByLead.get(id) ?? 0,
      };
    })
    .filter((c): c is WhatsAppConversation => c !== null)
    .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));

  // If a specific lead is selected, load their full thread + last inbound time
  const params = await searchParams;
  const selectedLeadId =
    params.lead && conversations.find((c) => c.leadId === params.lead)?.leadId;

  let thread: CommunicationRow[] = [];
  let selectedLead: Pick<LeadRow, "id" | "name" | "phone" | "is_dnc" | "tags"> | null = null;
  let lastInboundAt: string | null = null;
  if (selectedLeadId) {
    const [{ data: msgs }, { data: leadFull }] = await Promise.all([
      sb
        .from("communications")
        .select("*")
        .eq("channel", "whatsapp")
        .eq("lead_id", selectedLeadId)
        .order("created_at", { ascending: true })
        .limit(500),
      sb
        .from("leads")
        .select("id,name,phone,is_dnc,tags")
        .eq("id", selectedLeadId)
        .maybeSingle(),
    ]);
    thread = (msgs ?? []) as CommunicationRow[];
    selectedLead = leadFull ?? null;
    const lastInbound = [...thread].reverse().find((m) => m.direction === "inbound");
    lastInboundAt = lastInbound?.created_at ?? null;

    // Mark inbound messages read now that they've been opened
    const unreadIds = thread
      .filter((m) => m.direction === "inbound" && m.status !== "read")
      .map((m) => m.id);
    if (unreadIds.length > 0) {
      await sb.from("communications").update({ status: "read" }).in("id", unreadIds);
    }
  }

  return (
    <>
      <PageHeader
        title="WhatsApp"
        subtitle="Two-way conversations with leads. Newest at the top."
      />
      <WhatsAppInbox
        conversations={conversations}
        selectedLeadId={selectedLeadId ?? null}
        selectedLead={selectedLead}
        thread={thread}
        lastInboundAt={lastInboundAt}
        templates={(waTemplates ?? []) as WhatsAppTemplateRow[]}
      />
    </>
  );
}
