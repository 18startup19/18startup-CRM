"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";

export interface InboundPing {
  commId: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  body: string;
  createdAt: string;
}

// Return WhatsApp inbound messages received strictly after `sinceIso`. Scoped
// to leads the current user can see. Only recent (last 5 min) rows are looked
// at so this stays fast; the client only ever asks about the sliding window
// since its last poll.
export async function fetchRecentWhatsAppInbound(
  sinceIso: string,
): Promise<InboundPing[]> {
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

  const floor = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const since = sinceIso > floor ? sinceIso : floor;

  let q = sb
    .from("communications")
    .select("id,lead_id,body,created_at")
    .eq("channel", "whatsapp")
    .eq("direction", "inbound")
    .gt("created_at", since)
    .order("created_at", { ascending: true })
    .limit(20);

  if (!canSeeAll) {
    const { data: myLeads } = await sb
      .from("leads")
      .select("id")
      .eq("owner_id", session.userId);
    const myIds = (myLeads ?? []).map((l) => l.id);
    if (myIds.length === 0) return [];
    q = q.in("lead_id", myIds);
  }

  const { data: comms } = await q;
  const rows = (comms ?? []) as {
    id: string;
    lead_id: string;
    body: string | null;
    created_at: string;
  }[];
  if (rows.length === 0) return [];

  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id)));
  const { data: leadsData } = await sb
    .from("leads")
    .select("id,name,phone")
    .in("id", leadIds);
  const leadById = new Map(
    ((leadsData ?? []) as { id: string; name: string; phone: string | null }[]).map(
      (l) => [l.id, l],
    ),
  );

  return rows.map((r) => {
    const lead = leadById.get(r.lead_id);
    return {
      commId: r.id,
      leadId: r.lead_id,
      leadName: lead?.name ?? "Unknown",
      leadPhone: lead?.phone ?? null,
      body: r.body ?? "",
      createdAt: r.created_at,
    };
  });
}
