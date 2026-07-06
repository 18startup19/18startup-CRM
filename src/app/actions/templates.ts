"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";
import {
  createContentTemplate,
  submitWhatsAppApproval,
  fetchApprovalStatus,
  listContentTemplates,
} from "@/lib/integrations/twilio-content";
import type { WhatsAppTemplateRow } from "@/lib/database.types";

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
  patch.visible_to_members = form.get("visible_to_members") === "on";
  if (Object.keys(patch).length === 0) return;
  const sb = supabaseAdmin();
  await sb.from("email_templates").update(patch).eq("id", id);
  revalidatePath("/admin/templates");
}

export async function toggleEmailTemplateVisibilityAction(
  id: string,
  visible: boolean,
): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("email_templates").update({ visible_to_members: visible }).eq("id", id);
  revalidatePath("/admin/templates");
}

export async function toggleWhatsAppTemplateVisibilityAction(
  id: string,
  visible: boolean,
): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("whatsapp_templates").update({ visible_to_members: visible }).eq("id", id);
  revalidatePath("/admin/whatsapp-templates");
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
  const templateType = String(form.get("template_type") ?? "approved") as
    | "approved"
    | "faq";
  // Approved templates start life in "pending" — they'd need a Meta submission
  // via Twilio Content API to move to "approved". FAQ types don't need Meta.
  const approvalStatus = templateType === "faq" ? "approved" : "pending";

  if (!name || !body) return { error: "Template name and body are required." };

  const sb = supabaseAdmin();
  const insertPayload: Record<string, unknown> = {
    name,
    language,
    category,
    body,
    variables,
    template_type: templateType,
    approval_status: approvalStatus,
  };

  // For "approved" templates, submit to Twilio Content API + Meta approval in
  // one shot. On success we store the ContentSid; on failure we still save the
  // draft locally and record the error so the admin can retry from the UI.
  let submissionError: string | null = null;
  if (templateType === "approved") {
    try {
      const created = await createContentTemplate({
        friendly_name: name,
        language,
        body,
        variables,
      });
      insertPayload.provider_content_sid = created.sid;

      const meta =
        (category && ["MARKETING", "UTILITY", "AUTHENTICATION"].includes(
          category.toUpperCase(),
        )
          ? (category.toUpperCase() as
              | "MARKETING"
              | "UTILITY"
              | "AUTHENTICATION")
          : "UTILITY") ?? "UTILITY";
      const submission = await submitWhatsAppApproval({
        contentSid: created.sid,
        name,
        category: meta,
      });
      insertPayload.provider_approval_name = name;
      insertPayload.approval_status = normalizeApprovalStatus(submission.status);
      insertPayload.last_status_check_at = new Date().toISOString();
    } catch (err) {
      submissionError = err instanceof Error ? err.message : String(err);
      insertPayload.submission_error = submissionError;
      // Leave approval_status = "pending" so the admin can retry later.
    }
  }

  const { error } = await sb.from("whatsapp_templates").insert(insertPayload);
  if (error) return { error: error.message };
  revalidatePath("/admin/whatsapp-templates");
  return {
    ok: true,
    ...(submissionError
      ? {
          error: `Saved locally but Meta submission failed: ${submissionError}. Use "Retry submission" on the template row.`,
        }
      : {}),
  };
}

// ── Meta submission lifecycle actions ───────────────────────────────────────

export async function submitTemplateToMetaAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("whatsapp_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle<WhatsAppTemplateRow>();
  if (!data || data.template_type !== "approved") return;

  try {
    // If we already have a ContentSid, skip the create step.
    let contentSid = data.provider_content_sid;
    if (!contentSid) {
      const created = await createContentTemplate({
        friendly_name: data.name,
        language: data.language,
        body: data.body,
        variables: data.variables,
      });
      contentSid = created.sid;
    }

    const category = pickMetaCategory(data.category);
    const submission = await submitWhatsAppApproval({
      contentSid,
      name: data.name,
      category,
    });

    await sb
      .from("whatsapp_templates")
      .update({
        provider_content_sid: contentSid,
        provider_approval_name: data.name,
        approval_status: normalizeApprovalStatus(submission.status),
        last_status_check_at: new Date().toISOString(),
        submission_error: null,
      })
      .eq("id", id);
  } catch (err) {
    await sb
      .from("whatsapp_templates")
      .update({
        submission_error: err instanceof Error ? err.message : String(err),
      })
      .eq("id", id);
  }
  revalidatePath("/admin/whatsapp-templates");
}

export async function refreshTemplateStatusAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("whatsapp_templates")
    .select("id,provider_content_sid")
    .eq("id", id)
    .maybeSingle<{ id: string; provider_content_sid: string | null }>();
  if (!data?.provider_content_sid) return;

  try {
    const { status } = await fetchApprovalStatus(data.provider_content_sid);
    await sb
      .from("whatsapp_templates")
      .update({
        approval_status: normalizeApprovalStatus(status),
        last_status_check_at: new Date().toISOString(),
        submission_error: null,
      })
      .eq("id", id);
  } catch (err) {
    await sb
      .from("whatsapp_templates")
      .update({
        submission_error: err instanceof Error ? err.message : String(err),
        last_status_check_at: new Date().toISOString(),
      })
      .eq("id", id);
  }
  revalidatePath("/admin/whatsapp-templates");
}

export async function syncTemplatesFromTwilioAction(): Promise<{
  imported: number;
  updated: number;
  error?: string;
}> {
  await requireAdmin();
  const sb = supabaseAdmin();

  let remote;
  try {
    remote = await listContentTemplates();
  } catch (err) {
    return {
      imported: 0,
      updated: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const { data: existing } = await sb
    .from("whatsapp_templates")
    .select("id,name,provider_content_sid");
  const bySid = new Map<string, { id: string; name: string }>();
  const byName = new Map<string, { id: string }>();
  for (const row of (existing ?? []) as {
    id: string;
    name: string;
    provider_content_sid: string | null;
  }[]) {
    if (row.provider_content_sid) bySid.set(row.provider_content_sid, row);
    byName.set(row.name.toLowerCase(), row);
  }

  let imported = 0;
  let updated = 0;
  const nowIso = new Date().toISOString();

  for (const t of remote) {
    const existingBySid = bySid.get(t.sid);
    const existingByName = byName.get(t.friendly_name.toLowerCase());
    const target = existingBySid ?? existingByName;

    if (target) {
      await sb
        .from("whatsapp_templates")
        .update({
          provider_content_sid: t.sid,
          provider_approval_name: t.friendly_name,
          approval_status: normalizeApprovalStatus(t.approval_status),
          last_status_check_at: nowIso,
          // Refresh body/variables so admin doesn't hand-edit stale copies.
          body: t.body || ((target as { body?: string }).body ?? ""),
          variables: t.variables,
          language: t.language,
        })
        .eq("id", target.id);
      updated++;
    } else {
      await sb.from("whatsapp_templates").insert({
        name: t.friendly_name,
        language: t.language,
        category: null,
        body: t.body,
        variables: t.variables,
        is_active: true,
        visible_to_members: true,
        template_type: "approved",
        approval_status: normalizeApprovalStatus(t.approval_status),
        provider_content_sid: t.sid,
        provider_approval_name: t.friendly_name,
        last_status_check_at: nowIso,
      });
      imported++;
    }
  }

  revalidatePath("/admin/whatsapp-templates");
  return { imported, updated };
}

function pickMetaCategory(
  category: string | null,
): "MARKETING" | "UTILITY" | "AUTHENTICATION" {
  if (!category) return "UTILITY";
  const upper = category.toUpperCase();
  if (upper === "MARKETING" || upper === "AUTHENTICATION") return upper;
  return "UTILITY";
}

function normalizeApprovalStatus(
  raw: string,
): "draft" | "pending" | "approved" | "rejected" {
  const s = raw.toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected") return "rejected";
  if (s === "draft" || s === "unsubmitted") return "draft";
  // Twilio uses "received", "pending", "in_review" — collapse them.
  return "pending";
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
