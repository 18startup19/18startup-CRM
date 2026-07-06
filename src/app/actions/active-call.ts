"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";

// One "active call" per user at a time: the most recent outbound call comm
// from this user in the last 30 minutes that is still queued. Once the
// CallerDesk webhook flips the status to answered / missed / etc, the row is
// no longer "active" and the client-side call card auto-dismisses.

export interface ActiveCall {
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  leadEmail: string | null;
  startedAt: string;
}

export async function fetchActiveCall(): Promise<ActiveCall | null> {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: comm } = await sb
    .from("communications")
    .select("lead_id,status,created_at")
    .eq("channel", "call")
    .eq("direction", "outbound")
    .eq("actor_id", session.userId)
    .eq("status", "queued")
    .gte("created_at", thirtyMinAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ lead_id: string; status: string; created_at: string }>();
  if (!comm) return null;

  const { data: lead } = await sb
    .from("leads")
    .select("id,name,phone,email")
    .eq("id", comm.lead_id)
    .maybeSingle<{ id: string; name: string; phone: string | null; email: string | null }>();
  if (!lead) return null;

  return {
    leadId: lead.id,
    leadName: lead.name,
    leadPhone: lead.phone,
    leadEmail: lead.email,
    startedAt: comm.created_at,
  };
}
