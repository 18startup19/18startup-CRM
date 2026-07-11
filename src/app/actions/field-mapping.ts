"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export interface FieldMappingResult {
  ok?: boolean;
  error?: string;
}

// Upsert a single (source, form_key, external_field) → crm_target mapping.
// crm_target values: 'name' | 'email' | 'phone' | 'custom.<key>' | 'ignore'
export async function upsertFieldMappingAction(
  source: "webflow" | "razorpay",
  formKey: string,
  externalField: string,
  crmTarget: string,
): Promise<FieldMappingResult> {
  await requireAdmin();
  if (!formKey || !externalField) {
    return { error: "form_key and external_field are required" };
  }
  const validTarget =
    crmTarget === "name" ||
    crmTarget === "email" ||
    crmTarget === "phone" ||
    crmTarget === "ignore" ||
    crmTarget.startsWith("custom.");
  if (!validTarget) return { error: "Invalid crm_target." };

  const sb = supabaseAdmin();
  const { error } = await sb.from("lead_field_mappings").upsert(
    {
      source,
      form_key: formKey,
      external_field: externalField,
      crm_target: crmTarget,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source,form_key,external_field" },
  );
  if (error) return { error: error.message };
  revalidatePath("/admin/lead-routing");
  return { ok: true };
}

export async function deleteFieldMappingAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("lead_field_mappings").delete().eq("id", id);
  revalidatePath("/admin/lead-routing");
}
