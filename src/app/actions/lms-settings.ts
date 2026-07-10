"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export interface LmsSettingsResult {
  ok?: boolean;
  error?: string;
}

// Update the single-row lms_settings table. Templates are chosen once
// here and applied to every cohort onboarding.
export async function updateLmsSettingsAction(patch: {
  whatsapp_template_id?: string | null;
  email_template_id?: string | null;
}): Promise<LmsSettingsResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const clean: Record<string, unknown> = { id: 1 };
  if ("whatsapp_template_id" in patch)
    clean.whatsapp_template_id = patch.whatsapp_template_id ?? null;
  if ("email_template_id" in patch)
    clean.email_template_id = patch.email_template_id ?? null;
  const { error } = await sb.from("lms_settings").upsert(clean);
  if (error) return { error: error.message };
  revalidatePath("/admin/cohorts");
  return { ok: true };
}
