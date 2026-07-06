"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type { LeadRow, EmailTemplateRow, WhatsAppTemplateRow } from "@/lib/database.types";
import { sendEmail } from "@/lib/integrations/email";
import { sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/integrations/whatsapp";
import { initiateCall } from "@/lib/integrations/telephony";

export async function sendEmailAction(leadId: string, form: FormData): Promise<void> {
  const session = await requireSession();
  const templateId = String(form.get("template_id") ?? "");
  const subjectOverride = String(form.get("subject") ?? "").trim();
  const bodyOverride = String(form.get("body_html") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).single();
  if (!lead) return;

  let subject = subjectOverride;
  let bodyHtml = bodyOverride;

  // If a template was picked but the user didn't edit subject/body, load
  // them from the template. Overrides always win.
  if (templateId && (!subject || !bodyHtml)) {
    const { data: tpl } = await sb
      .from("email_templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (tpl) {
      subject = subject || (tpl as EmailTemplateRow).subject;
      bodyHtml = bodyHtml || (tpl as EmailTemplateRow).body_html;
    }
  }

  if (!subject || !bodyHtml) return;
  await sendEmail({
    lead: lead as LeadRow,
    subject,
    bodyHtml,
    actorId: session.userId,
  });
  revalidatePath(`/leads/${leadId}`);
}

export async function sendWhatsAppAction(leadId: string, form: FormData): Promise<void> {
  const session = await requireSession();
  const templateId = String(form.get("template_id") ?? "");
  const text = String(form.get("text") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).single();
  if (!lead) return;
  if (templateId) {
    const { data: tpl } = await sb.from("whatsapp_templates").select("*").eq("id", templateId).single();
    if (!tpl) return;
    await sendWhatsAppTemplate({
      lead: lead as LeadRow,
      template: tpl as WhatsAppTemplateRow,
      actorId: session.userId,
    });
  } else if (text) {
    await sendWhatsAppText({ lead: lead as LeadRow, text, actorId: session.userId });
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/whatsapp");
}

export interface CallResult {
  ok?: boolean;
  error?: string;
}

export async function callAction(leadId: string, form: FormData): Promise<CallResult> {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const formPhone = String(form.get("agent_phone") ?? "").trim();
  let agentPhone = formPhone;
  if (!agentPhone) {
    const { data: me } = await sb
      .from("users")
      .select("phone")
      .eq("id", session.userId)
      .maybeSingle<{ phone: string | null }>();
    agentPhone = me?.phone?.trim() ?? "";
  }
  if (!agentPhone) agentPhone = process.env.TELEPHONY_CALLER_ID ?? "";

  const { data: lead } = await sb.from("leads").select("*").eq("id", leadId).single();
  if (!lead) return { ok: false, error: "Lead not found." };

  const result = await initiateCall({
    lead: lead as LeadRow,
    agentPhone,
    actorId: session.userId,
  });

  revalidatePath(`/leads/${leadId}`);
  return { ok: result.ok, error: result.error };
}
