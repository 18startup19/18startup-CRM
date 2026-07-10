"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export interface CohortResult {
  ok?: boolean;
  error?: string;
}

// Fallback edit for the LMS mapping — the LMS sync webhook fills this
// automatically, but admins can override or backfill when the mapping is
// missing on legacy cohorts. Templates are no longer per-cohort; see
// lms_settings for the global picks.
export async function updateCohortOnboardingAction(
  id: string,
  patch: { lms_cohort_id?: string | null },
): Promise<CohortResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const clean: Record<string, string | null> = {};
  if ("lms_cohort_id" in patch) clean.lms_cohort_id = patch.lms_cohort_id ?? null;
  const { error } = await sb.from("cohorts").update(clean).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/cohorts");
  return { ok: true };
}

export async function archiveCohortAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("cohorts").update({ is_active: false }).eq("id", id);
  revalidatePath("/admin/cohorts");
  revalidatePath("/leads");
}

export async function restoreCohortAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("cohorts").update({ is_active: true }).eq("id", id);
  revalidatePath("/admin/cohorts");
  revalidatePath("/leads");
}
