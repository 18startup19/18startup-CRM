"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";

export interface AmountResult {
  ok?: boolean;
  error?: string;
}

export async function addLeadAmountAction(
  leadId: string,
  amount: number,
  note?: string,
): Promise<AmountResult> {
  const session = await requireSession();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a positive number." };
  }
  const sb = supabaseAdmin();
  const { error } = await sb.from("lead_amounts").insert({
    lead_id: leadId,
    actor_id: session.userId,
    amount,
    note: note?.trim() || null,
  });
  if (error) return { error: error.message };

  await sb.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: session.userId,
    kind: "converted",
    payload: { amount, note: note?.trim() || null },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/converted-leads");
  return { ok: true };
}
