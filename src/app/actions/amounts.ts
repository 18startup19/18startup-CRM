"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { onboardLeadToLmsAction } from "@/app/actions/onboard";

export interface AmountResult {
  ok?: boolean;
  error?: string;
}

export async function addLeadAmountAction(
  leadId: string,
  amount: number,
  note?: string,
  cohortNumber?: string,
  totalFee?: number | null,
): Promise<AmountResult> {
  const session = await requireSession();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be a positive number." };
  }
  const cohort = cohortNumber?.trim() ?? "";
  if (!cohort) {
    return { error: "Pick a cohort before saving the payment." };
  }
  if (
    totalFee === undefined ||
    totalFee === null ||
    !Number.isFinite(totalFee) ||
    totalFee <= 0
  ) {
    return { error: "Enter the total cohort fee before saving." };
  }
  if (totalFee < amount) {
    return { error: "Total fee can't be less than the payment amount." };
  }
  const sb = supabaseAdmin();
  const { error } = await sb.from("lead_amounts").insert({
    lead_id: leadId,
    actor_id: session.userId,
    amount,
    note: note?.trim() || null,
    cohort_number: cohort,
  });
  if (error) return { error: error.message };

  // Sync total_fee on the lead — first payment sets it, later edits update
  // it (sales might correct a typo or adjust after a discount).
  await sb.from("leads").update({ total_fee: totalFee }).eq("id", leadId);

  await sb.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: session.userId,
    kind: "converted",
    payload: {
      amount,
      note: note?.trim() || null,
      cohort_number: cohort,
      total_fee: totalFee,
    },
  });

  // Auto-fire LMS onboarding when this payment brings the lead to (or past)
  // the full cohort fee. Idempotent: skipped if already onboarded. Log-only
  // on failure so a bad LMS state can't roll back the payment save.
  await maybeAutoOnboard(leadId, cohort, totalFee);

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/converted-leads");
  return { ok: true };
}

async function maybeAutoOnboard(
  leadId: string,
  cohortNumber: string,
  totalFee: number,
): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { data: payments } = await sb
      .from("lead_amounts")
      .select("amount")
      .eq("lead_id", leadId)
      .eq("cohort_number", cohortNumber);
    const paid = (payments ?? []).reduce(
      (s, p) => s + Number((p as { amount: number }).amount),
      0,
    );
    if (paid < totalFee) return;

    const { data: cohortRow } = await sb
      .from("cohorts")
      .select("id")
      .eq("number", cohortNumber)
      .maybeSingle<{ id: string }>();
    if (!cohortRow) {
      console.warn(
        `[auto-onboard] cohort ${cohortNumber} not found in CRM; skipping.`,
      );
      return;
    }

    const { data: existing } = await sb
      .from("lead_lms_onboardings")
      .select("status")
      .eq("lead_id", leadId)
      .eq("cohort_id", cohortRow.id)
      .maybeSingle<{ status: string }>();
    if (existing?.status === "sent") return;

    const res = await onboardLeadToLmsAction(leadId, cohortRow.id, "auto");
    if (res.error) {
      console.warn(`[auto-onboard] failed: ${res.error}`);
    }
  } catch (err) {
    console.error("[auto-onboard] unexpected error:", err);
  }
}

export async function updateLeadAmountAction(
  amountId: string,
  amount: number,
  note?: string,
  cohortNumber?: string,
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

  const patch: Record<string, unknown> = {
    amount,
    note: note?.trim() || null,
  };
  // Only overwrite cohort_number when the caller explicitly passed one, so
  // existing edit UIs that don't collect it don't wipe the field.
  if (cohortNumber !== undefined) {
    patch.cohort_number = cohortNumber.trim() || null;
  }
  await sb.from("lead_amounts").update(patch).eq("id", amountId);

  revalidatePath(`/leads/${existing.lead_id}`);
  revalidatePath("/converted-leads");
  return { ok: true };
}

// Reassign every payment on this lead currently sitting in `fromCohort` to
// `toCohort`. Used by the "Shift all to Cohort X" path in the mismatch
// dialog when sales realises the earlier payments were logged under the
// wrong cohort number.
export async function shiftLeadPaymentsCohortAction(
  leadId: string,
  fromCohort: string,
  toCohort: string,
): Promise<AmountResult> {
  const session = await requireSession();
  const from = fromCohort.trim();
  const to = toCohort.trim();
  if (!from || !to) return { error: "Both cohort numbers are required." };
  if (from === to) return { ok: true };

  const sb = supabaseAdmin();
  const { data: touched, error } = await sb
    .from("lead_amounts")
    .update({ cohort_number: to })
    .eq("lead_id", leadId)
    .eq("cohort_number", from)
    .select("id");
  if (error) return { error: error.message };

  await sb.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: session.userId,
    kind: "cohort_shifted",
    payload: {
      from_cohort: from,
      to_cohort: to,
      payments_shifted: (touched ?? []).length,
    },
  });

  revalidatePath(`/leads/${leadId}`);
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
