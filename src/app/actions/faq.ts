"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";

export interface FaqResult {
  error?: string;
  ok?: boolean;
}

export async function createFaqAction(
  _prev: FaqResult,
  form: FormData,
): Promise<FaqResult> {
  const session = await requireSession();
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const category = String(form.get("category") ?? "").trim() || null;
  // Admins share FAQs by default — they're building the team library, not
  // personal notes. Members can still tick the "Share with team" checkbox.
  const explicitShare = form.get("shared") === "on";
  const shared = explicitShare || session.role === "admin";
  if (!title || !body) return { error: "Title and body are required." };
  const sb = supabaseAdmin();
  const { error } = await sb.from("faq_templates").insert({
    owner_id: shared ? null : session.userId,
    title,
    body,
    category,
  });
  if (error) return { error: error.message };
  revalidatePath("/faq");
  return { ok: true };
}

export async function updateFaqAction(id: string, form: FormData): Promise<void> {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from("faq_templates")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle<{ owner_id: string | null }>();
  if (!existing) return;
  // Only the owner (or admin) can edit
  if (existing.owner_id !== null && existing.owner_id !== session.userId && session.role !== "admin") {
    return;
  }

  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const category = String(form.get("category") ?? "").trim() || null;
  const patch: Record<string, unknown> = {};
  if (title) patch.title = title;
  if (body) patch.body = body;
  patch.category = category;
  if (Object.keys(patch).length === 0) return;
  await sb.from("faq_templates").update(patch).eq("id", id);
  revalidatePath("/faq");
}

export async function deleteFaqAction(id: string): Promise<void> {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("faq_templates")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle<{ owner_id: string | null }>();
  if (!existing) return;
  if (existing.owner_id !== null && existing.owner_id !== session.userId && session.role !== "admin") {
    return;
  }
  await sb.from("faq_templates").update({ is_archived: true }).eq("id", id);
  revalidatePath("/faq");
}
