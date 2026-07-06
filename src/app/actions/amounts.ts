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

export async function updateLeadAmountAction(
  amountId: string,
  amount: number,
  note?: string,
): Promise<AmountResult> {
  const session = await requireSession();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a positive number." };
  }
  const sb = supabaseAdmin();
  // Only the original recorder + admins/managers can rewrite history.
  const { data: existing } = await sb
    .from("lead_amounts")
    .select("id,lead_id,actor_id")
    .eq("id", amountId)
    .maybeSingle<{ id: string; lead_id: string; actor_id: string | null }>();
  if (!existing) return { error: "Payment not found." };
  const canEdit =
    session.role === "admin" ||
    session.role === "manager" ||
    existing.actor_id === session.userId;
  if (!canEdit) return { error: "You can't edit this payment." };

  await sb
    .from("lead_amounts")
    .update({ amount, note: note?.trim() || null })
    .eq("id", amountId);

  revalidatePath(`/leads/${existing.lead_id}`);
  revalidatePath("/converted-leads");
  return { ok: true };
}

export async function deleteLeadAmountAction(
  amountId: string,
): Promise<AmountResult> {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("lead_amounts")
    .select("id,lead_id,actor_id")
    .eq("id", amountId)
    .maybeSingle<{ id: string; lead_id: string; actor_id: string | null }>();
  if (!existing) return { error: "Payment not found." };
  const canDelete =
    session.role === "admin" ||
    session.role === "manager" ||
    existing.actor_id === session.userId;
  if (!canDelete) return { error: "You can't delete this payment." };

  await sb.from("lead_amounts").delete().eq("id", amountId);

  revalidatePath(`/leads/${existing.lead_id}`);
  revalidatePath("/converted-leads");
  return { ok: true };
}
