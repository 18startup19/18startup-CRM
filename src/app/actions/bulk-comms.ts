"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdminOrManager } from "@/lib/rbac-server";
import { sendEmail } from "@/lib/integrations/email";
import { sendWhatsAppTemplate } from "@/lib/integrations/whatsapp";
import type {
  EmailTemplateRow,
  LeadRow,
  WhatsAppTemplateRow,
} from "@/lib/database.types";

// Hard cap on how many recipients a single bulk send can target. Guardrail
// against fat-finger sends (accidentally hit "select all 5000 leads" then
// "send WhatsApp"). Raise if you deliberately need bigger blasts.
const BULK_MAX = 500;

export interface BulkResult {
  ok: boolean;
  sent?: number;
  skipped?: number;
  error?: string;
  errors?: { leadId: string; reason: string }[];
}

export async function bulkSendEmailAction(
  leadIds: string[],
  templateId: string,
): Promise<BulkResult> {
  const session = await requireAdminOrManager();
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return { ok: false, error: "No leads selected." };
  }
  if (leadIds.length > BULK_MAX) {
    return {
      ok: false,
      error: `Bulk send capped at ${BULK_MAX} recipients. Narrow your selection.`,
    };
  }
  if (!templateId) return { ok: false, error: "Pick an email template." };

  const sb = supabaseAdmin();
  const { data: tpl } = await sb
    .from("email_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle<EmailTemplateRow>();
  if (!tpl) return { ok: false, error: "Template not found." };

  const { data: leadsData } = await sb
    .from("leads")
    .select("*")
    .in("id", leadIds);
  const leads = (leadsData ?? []) as LeadRow[];

  let sent = 0;
  let skipped = 0;
  const errors: { leadId: string; reason: string }[] = [];

  // Sequential — keeps the load on SendGrid steady + preserves per-lead
  // history rows in order. Worst case 500 sends × ~200ms each ≈ 100s;
  // Vercel Pro allows 300s for functions.
  for (const lead of leads) {
    if (!lead.email) {
      skipped++;
      errors.push({ leadId: lead.id, reason: "no email address" });
      continue;
    }
    try {
      await sendEmail({
        lead,
        subject: tpl.subject,
        bodyHtml: tpl.body_html,
        actorId: session.userId,
      });
      sent++;
    } catch (err) {
      skipped++;
      errors.push({
        leadId: lead.id,
        reason: err instanceof Error ? err.message : "send failed",
      });
    }
  }

  return { ok: true, sent, skipped, errors: errors.slice(0, 20) };
}

export async function bulkSendWhatsAppAction(
  leadIds: string[],
  templateId: string,
): Promise<BulkResult> {
  const session = await requireAdminOrManager();
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return { ok: false, error: "No leads selected." };
  }
  if (leadIds.length > BULK_MAX) {
    return {
      ok: false,
      error: `Bulk send capped at ${BULK_MAX} recipients. Narrow your selection.`,
    };
  }
  if (!templateId) return { ok: false, error: "Pick a WhatsApp template." };

  const sb = supabaseAdmin();
  const { data: tpl } = await sb
    .from("whatsapp_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle<WhatsAppTemplateRow>();
  if (!tpl) return { ok: false, error: "Template not found." };

  const { data: leadsData } = await sb
    .from("leads")
    .select("*")
    .in("id", leadIds);
  const leads = (leadsData ?? []) as LeadRow[];

  let sent = 0;
  let skipped = 0;
  const errors: { leadId: string; reason: string }[] = [];

  for (const lead of leads) {
    if (!lead.phone) {
      skipped++;
      errors.push({ leadId: lead.id, reason: "no phone" });
      continue;
    }
    try {
      await sendWhatsAppTemplate({
        lead,
        template: tpl,
        actorId: session.userId,
      });
      sent++;
    } catch (err) {
      skipped++;
      errors.push({
        leadId: lead.id,
        reason: err instanceof Error ? err.message : "send failed",
      });
    }
  }

  return { ok: true, sent, skipped, errors: errors.slice(0, 20) };
}
