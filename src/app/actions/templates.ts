"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";

export interface TemplateResult {
  error?: string;
  ok?: boolean;
}

export async function createEmailTemplateAction(
  _prev: TemplateResult,
  form: FormData,
): Promise<TemplateResult> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const body_html = String(form.get("body_html") ?? "").trim();
  if (!name || !subject || !body_html) return { error: "All fields are required." };

  const sb = supabaseAdmin();
  const { error } = await sb.from("email_templates").insert({ name, subject, body_html });
  if (error) return { error: error.message };
  revalidatePath("/admin/templates");
  return { ok: true };
}

export async function archiveEmailTemplateAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("email_templates").update({ is_archived: true }).eq("id", id);
  revalidatePath("/admin/templates");
}

export async function updateEmailTemplateAction(id: string, form: FormData): Promise<void> {
  await requireAdmin();
  const patch: Record<string, unknown> = {};
  const name = String(form.get("name") ?? "").trim();
  const subject = String(form.get("subject") ?? "").trim();
  const body_html = String(form.get("body_html") ?? "").trim();
  if (name) patch.name = name;
  if (subject) patch.subject = subject;
  if (body_html) patch.body_html = body_html;
  if (Object.keys(patch).length === 0) return;
  const sb = supabaseAdmin();
  await sb.from("email_templates").update(patch).eq("id", id);
  revalidatePath("/admin/templates");
}

export async function createWhatsAppTemplateAction(
  _prev: TemplateResult,
  form: FormData,
): Promise<TemplateResult> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const language = String(form.get("language") ?? "en").trim();
  const category = String(form.get("category") ?? "").trim() || null;
  const body = String(form.get("body") ?? "").trim();
  const variablesRaw = String(form.get("variables") ?? "");
  const variables = variablesRaw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!name || !body) return { error: "Template name and body are required." };

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("whatsapp_templates")
    .insert({ name, language, category, body, variables });
  if (error) return { error: error.message };
  revalidatePath("/admin/whatsapp-templates");
  return { ok: true };
}

export async function disableWhatsAppTemplateAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("whatsapp_templates").update({ is_active: false }).eq("id", id);
  revalidatePath("/admin/whatsapp-templates");
}

export async function updateWhatsAppTemplateAction(
  id: string,
  form: FormData,
): Promise<void> {
  await requireAdmin();
  const patch: Record<string, unknown> = {};
  const name = String(form.get("name") ?? "").trim();
  const language = String(form.get("language") ?? "").trim();
  const category = String(form.get("category") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const variablesRaw = String(form.get("variables") ?? "");
  if (name) patch.name = name;
  if (language) patch.language = language;
  patch.category = category || null;
  if (body) patch.body = body;
  if (variablesRaw.trim()) {
    patch.variables = variablesRaw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const sb = supabaseAdmin();
  await sb.from("whatsapp_templates").update(patch).eq("id", id);
  revalidatePath("/admin/whatsapp-templates");
}
