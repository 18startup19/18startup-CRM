"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export async function hideAdminFormAction(
  source: "webflow" | "razorpay",
  formKey: string,
): Promise<void> {
  const session = await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("hidden_admin_forms").upsert(
    {
      source,
      form_key: formKey,
      hidden_by: session.userId,
      hidden_at: new Date().toISOString(),
    },
    { onConflict: "source,form_key" },
  );
  revalidatePath("/admin/lead-routing");
}

export async function restoreAdminFormAction(
  source: "webflow" | "razorpay",
  formKey: string,
): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb
    .from("hidden_admin_forms")
    .delete()
    .eq("source", source)
    .eq("form_key", formKey);
  revalidatePath("/admin/lead-routing");
}
