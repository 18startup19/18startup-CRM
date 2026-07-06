"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";

export interface SearchHit {
  kind: "lead" | "email" | "whatsapp" | "call" | "note";
  leadId: string;
  leadName: string;
  snippet: string;
  when?: string | null;
}

export async function globalSearchAction(query: string): Promise<SearchHit[]> {
  const session = await requireSession();
  const q = query.trim();
  if (q.length < 2) return [];
  const sb = supabaseAdmin();

  // Non-admin members without leads:view_all get scoped to their own leads.
  const { data: me } = await sb
    .from("users")
    .select("permissions")
    .eq("id", session.userId)
    .maybeSingle<{ permissions: Record<string, boolean> | null }>();
  const canSeeAll =
    session.role === "admin" || me?.permissions?.["leads:view_all"] === true;

  let myLeadIds: string[] | null = null;
  if (!canSeeAll) {
    const { data: mine } = await sb
      .from("leads")
      .select("id")
      .eq("owner_id", session.userId);
    myLeadIds = (mine ?? []).map((l: { id: string }) => l.id);
    if (myLeadIds.length === 0) return [];
  }

  const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  // 1. Leads by name / phone / email / tags-array-contains
  let leadsQ = sb
    .from("leads")
    .select("id,name,phone,email,updated_at")
    .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
    .order("updated_at", { ascending: false })
    .limit(10);
  if (myLeadIds) leadsQ = leadsQ.in("id", myLeadIds);
  const { data: leads } = await leadsQ;

  // 2. Communications by body / subject (email, whatsapp, call summaries)
  let commsQ = sb
    .from("communications")
    .select("id,lead_id,channel,body,subject,created_at")
    .or(`body.ilike.${like},subject.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(15);
  if (myLeadIds) commsQ = commsQ.in("lead_id", myLeadIds);
  const { data: comms } = await commsQ;

  // 3. Notes by body
  let notesQ = sb
    .from("lead_notes")
    .select("id,lead_id,body,created_at")
    .ilike("body", like)
    .order("created_at", { ascending: false })
    .limit(10);
  if (myLeadIds) notesQ = notesQ.in("lead_id", myLeadIds);
  const { data: notes } = await notesQ;

  // Fetch lead names for the comm/note hits that aren't in the leads list
  const referencedIds = new Set<string>();
  for (const c of (comms ?? []) as { lead_id: string }[]) referencedIds.add(c.lead_id);
  for (const n of (notes ?? []) as { lead_id: string }[]) referencedIds.add(n.lead_id);
  const leadIdsAlready = new Set(
    ((leads ?? []) as { id: string }[]).map((l) => l.id),
  );
  const missingIds = Array.from(referencedIds).filter(
    (id) => !leadIdsAlready.has(id),
  );
  let extraLeads: { id: string; name: string }[] = [];
  if (missingIds.length > 0) {
    const { data: more } = await sb
      .from("leads")
      .select("id,name")
      .in("id", missingIds);
    extraLeads = (more ?? []) as { id: string; name: string }[];
  }
  const nameById = new Map<string, string>();
  for (const l of (leads ?? []) as { id: string; name: string }[]) {
    nameById.set(l.id, l.name);
  }
  for (const l of extraLeads) nameById.set(l.id, l.name);

  const hits: SearchHit[] = [];
  for (const l of (leads ?? []) as {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    updated_at: string;
  }[]) {
    hits.push({
      kind: "lead",
      leadId: l.id,
      leadName: l.name,
      snippet: [l.phone, l.email].filter(Boolean).join(" · ") || "Lead",
      when: l.updated_at,
    });
  }
  for (const c of (comms ?? []) as {
    lead_id: string;
    channel: string;
    body: string | null;
    subject: string | null;
    created_at: string;
  }[]) {
    const name = nameById.get(c.lead_id) ?? "Lead";
    const snippet =
      (c.subject ? `${c.subject} — ` : "") + (c.body ?? "").slice(0, 120);
    hits.push({
      kind:
        c.channel === "email"
          ? "email"
          : c.channel === "whatsapp"
            ? "whatsapp"
            : "call",
      leadId: c.lead_id,
      leadName: name,
      snippet,
      when: c.created_at,
    });
  }
  for (const n of (notes ?? []) as {
    lead_id: string;
    body: string;
    created_at: string;
  }[]) {
    const name = nameById.get(n.lead_id) ?? "Lead";
    hits.push({
      kind: "note",
      leadId: n.lead_id,
      leadName: name,
      snippet: n.body.slice(0, 120),
      when: n.created_at,
    });
  }

  return hits;
}
