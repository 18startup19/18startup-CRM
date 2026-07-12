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

  const due = (data ?? []) as Array<{
    id: string;
    name: string;
    phone: string | null;
    next_callback_at: string;
  }>;
  if (due.length === 0) return [];

  // Hide the reminder for any lead that's already been called inside the
  // reminder window — i.e., the rep has already acted on this callback and
  // shouldn't keep getting nagged. Any outbound call in the last 30 min
  // counts as "handled". We look at direction=outbound so an inbound call
  // from the customer doesn't accidentally silence a reminder the rep
  // still needs to make.
  const dueIds = due.map((l) => l.id);
  const { data: callData } = await sb
    .from("communications")
    .select("lead_id")
    .eq("channel", "call")
    .eq("direction", "outbound")
    .in("lead_id", dueIds)
    .gte("created_at", lowerBound);
  const handled = new Set(
    ((callData ?? []) as { lead_id: string }[]).map((c) => c.lead_id),
  );

  return due
    .filter((l) => !handled.has(l.id))
    .map((l) => ({
      leadId: l.id,
      leadName: l.name,
      leadPhone: l.phone,
      scheduledAtIso: l.next_callback_at,
    }));
}
