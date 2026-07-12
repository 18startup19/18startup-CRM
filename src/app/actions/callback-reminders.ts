"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";

export interface DueCallback {
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  scheduledAtIso: string;
}

// Fetch callbacks that are due (or about to be due) for the current
// user's leads. Window: scheduled between (now - 30 min) and (now + 2 min).
// The +2 min upper bound is what makes the reminder pop TWO MINUTES BEFORE
// the callback so sales has time to prep. The -30 min lower bound catches
// missed reminders when the rep was briefly offline; anything older is
// considered stale and doesn't nag.
const LEAD_TIME_MS = 2 * 60_000;
const BACK_WINDOW_MS = 30 * 60_000;

export async function getDueCallbacksAction(): Promise<DueCallback[]> {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const now = Date.now();
  const upperBound = new Date(now + LEAD_TIME_MS).toISOString();
  const lowerBound = new Date(now - BACK_WINDOW_MS).toISOString();

  const { data } = await sb
    .from("leads")
    .select("id,name,phone,next_callback_at,owner_id")
    .eq("owner_id", session.userId)
    .not("next_callback_at", "is", null)
    .lte("next_callback_at", upperBound)
    .gte("next_callback_at", lowerBound)
    .order("next_callback_at", { ascending: false })
    .limit(20);

  return ((data ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    next_callback_at: string;
  }>).map((l) => ({
    leadId: l.id,
    leadName: l.name,
    leadPhone: l.phone,
    scheduledAtIso: l.next_callback_at,
  }));
}
