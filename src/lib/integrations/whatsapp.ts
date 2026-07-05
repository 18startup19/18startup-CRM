import { supabaseAdmin } from "../supabase-admin";
import type { LeadRow, WhatsAppTemplateRow } from "../database.types";

export interface WhatsAppTemplateSend {
  lead: LeadRow;
  template: WhatsAppTemplateRow;
  actorId?: string | null;
}

// Send an approved WhatsApp template to a lead. Templates are pre-approved with
// the BSP (Gupshup / Interakt / etc.). Free-form text sends must be inside the
// 24-hour session window and use sendWhatsAppText below.
export async function sendWhatsAppTemplate({
  lead,
  template,
  actorId,
}: WhatsAppTemplateSend): Promise<void> {
  if (!lead.phone) throw new Error("Lead has no phone number.");
  if (lead.is_dnc) throw new Error("Lead is marked do-not-contact.");

  const provider = (process.env.WHATSAPP_PROVIDER ?? "mock").toLowerCase();
  const variables = (template.variables ?? []).map((path) => resolveVar(lead, path));
  const body = interpolate(template.body, variables);

  const sb = supabaseAdmin();
  const { data: comm } = await sb
    .from("communications")
    .insert({
      lead_id: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      status: "queued",
      actor_id: actorId ?? null,
      body,
      provider,
    })
    .select("id")
    .single();

  try {
    let providerMessageId: string | null = null;
    switch (provider) {
      case "twilio":
        providerMessageId = await twilioSendText(lead.phone, body);
        break;
      case "gupshup":
      case "interakt":
      case "aisensy":
      case "wati":
        // TODO: real BSP calls per provider. Left as stubs so the mock flow works.
        break;
      case "mock":
      default:
        // eslint-disable-next-line no-console
        console.log(`[mock whatsapp] → ${lead.phone}: ${body}`);
    }
    if (comm?.id) {
      await sb
        .from("communications")
        .update({ status: "sent", provider_message_id: providerMessageId })
        .eq("id", comm.id);
    }
  } catch (err) {
    if (comm?.id) {
      await sb
        .from("communications")
        .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
        .eq("id", comm.id);
    }
    throw err;
  }
}

export async function sendWhatsAppText({
  lead,
  text,
  actorId,
}: {
  lead: LeadRow;
  text: string;
  actorId?: string | null;
}): Promise<void> {
  if (!lead.phone) throw new Error("Lead has no phone number.");
  if (lead.is_dnc) throw new Error("Lead is marked do-not-contact.");
  const provider = (process.env.WHATSAPP_PROVIDER ?? "mock").toLowerCase();
  const sb = supabaseAdmin();
  const { data: comm } = await sb
    .from("communications")
    .insert({
      lead_id: lead.id,
      channel: "whatsapp",
      direction: "outbound",
      status: "queued",
      actor_id: actorId ?? null,
      body: text,
      provider,
    })
    .select("id")
    .single();

  try {
    let providerMessageId: string | null = null;
    switch (provider) {
      case "twilio":
        providerMessageId = await twilioSendText(lead.phone, text);
        break;
      case "mock":
      default:
        // eslint-disable-next-line no-console
        console.log(`[mock whatsapp text] → ${lead.phone}: ${text}`);
    }
    if (comm?.id) {
      await sb
        .from("communications")
        .update({ status: "sent", provider_message_id: providerMessageId })
        .eq("id", comm.id);
    }
  } catch (err) {
    if (comm?.id) {
      await sb
        .from("communications")
        .update({ status: "failed", error: err instanceof Error ? err.message : String(err) })
        .eq("id", comm.id);
    }
    throw err;
  }
}

// ── Twilio WhatsApp adapter ────────────────────────────────────────────────
// Twilio's WhatsApp Business API is a REST endpoint that takes URL-encoded form
// params. Free-form text only works inside the 24-hour session window; outside
// of it Twilio requires a pre-approved Content Template (ContentSid).

async function twilioSendText(toE164: string, text: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM.",
    );
  }

  const params = new URLSearchParams({
    From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
    To: `whatsapp:${normalizePhone(toE164)}`,
    Body: text,
  });

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );
  const payload = (await res.json().catch(() => null)) as { sid?: string; message?: string } | null;
  if (!res.ok) {
    throw new Error(`Twilio error (${res.status}): ${payload?.message ?? "unknown"}`);
  }
  return payload?.sid ?? "";
}

// Normalise a phone number to E.164 for Twilio's `whatsapp:` prefix.
// Handles the common Indian formats users type into the CRM:
//   +918886956636  →  +918886956636
//   918886956636   →  +918886956636
//   08886956636    →  +918886956636 (strips leading 0, adds +91)
//   8886956636     →  +918886956636 (adds +91)
// Non-Indian numbers with a country code just get a + prefix.
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+${digits.slice(1)}`;
  return `+${digits}`;
}

function resolveVar(lead: LeadRow, path: string): string {
  if (path === "name") return lead.name;
  if (path === "email") return lead.email ?? "";
  if (path === "phone") return lead.phone ?? "";
  if (path.startsWith("custom.")) {
    const v = lead.custom?.[path.slice(7)];
    return v == null ? "" : String(v);
  }
  return "";
}

function interpolate(body: string, vars: string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, idx: string) => vars[Number(idx) - 1] ?? "");
}
