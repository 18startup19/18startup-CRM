import { supabaseAdmin } from "../supabase-admin";
import type { LeadRow } from "../database.types";
import { renderTemplate } from "../utils";
import { fetchAsBase64 } from "../attachments";

export interface EmailSend {
  lead: LeadRow;
  subject: string;
  bodyHtml: string;
  actorId?: string | null;
  attachmentUrls?: string[];
}

// Send an email via the configured provider. In dev / on error, falls back to
// the "mock" provider which just logs the communication row.
export async function sendEmail({ lead, subject, bodyHtml, actorId, attachmentUrls }: EmailSend): Promise<void> {
  if (!lead.email) throw new Error("Lead has no email address.");
  if (lead.is_dnc) throw new Error("Lead is marked do-not-contact.");

  const provider = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase();
  const renderedSubject = renderTemplate(subject, lead);
  const renderedBody = renderTemplate(bodyHtml, lead);

  const sb = supabaseAdmin();
  const { data: comm } = await sb
    .from("communications")
    .insert({
      lead_id: lead.id,
      channel: "email",
      direction: "outbound",
      status: "queued",
      actor_id: actorId ?? null,
      subject: renderedSubject,
      body: renderedBody,
      provider,
    })
    .select("id")
    .single();

  try {
    let providerMessageId: string | null = null;
    switch (provider) {
      case "sendgrid":
        providerMessageId = await sendgridSend(
          lead.email,
          renderedSubject,
          renderedBody,
          attachmentUrls ?? [],
        );
        break;
      case "ses":
        // TODO: implement SES if needed.
        break;
      case "mock":
      default:
        // eslint-disable-next-line no-console
        console.log(`[mock email] → ${lead.email}: ${renderedSubject}`);
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

// ── SendGrid (Twilio SendGrid) adapter ─────────────────────────────────────
// v3 Mail Send API. Uses a bearer token; the API key must have "Mail Send"
// permission and the from-address must be a verified sender in SendGrid.

async function sendgridSend(
  to: string,
  subject: string,
  bodyHtml: string,
  attachmentUrls: string[],
): Promise<string> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME ?? "";
  if (!apiKey) throw new Error("Missing SENDGRID_API_KEY.");
  if (!fromEmail) throw new Error("Missing EMAIL_FROM_ADDRESS.");

  const attachments =
    attachmentUrls.length > 0
      ? await Promise.all(
          attachmentUrls.map(async (u) => {
            const { base64, contentType, filename } = await fetchAsBase64(u);
            return { content: base64, type: contentType, filename, disposition: "attachment" };
          }),
        )
      : undefined;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName || undefined },
      subject,
      content: [{ type: "text/html", value: bodyHtml }],
      ...(attachments ? { attachments } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`SendGrid error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.headers.get("x-message-id") ?? "";
}
