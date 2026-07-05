"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type { NotificationRow } from "@/lib/database.types";

export async function fetchUnreadNotifications(): Promise<NotificationRow[]> {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("notifications")
    .select("*")
    .eq("user_id", session.userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as NotificationRow[];
}

export async function markNotificationsReadAction(ids: string[]): Promise<void> {
  const session = await requireSession();
  if (ids.length === 0) return;
  const sb = supabaseAdmin();
  await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", session.userId);
}
