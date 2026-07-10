"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { enrollLeadInLms } from "@/lib/integrations/lms";
import { sendEmail } from "@/lib/integrations/email";
import { sendWhatsAppTemplate } from "@/lib/integrations/whatsapp";
import type {
  CohortRow,
  EmailTemplateRow,
  LeadRow,
  LmsSettingsRow,
  WhatsAppTemplateRow,
} from "@/lib/database.types";

export interface OnboardResult {
  ok?: boolean;
  error?: string;
  // Per-channel outcome so the UI can be honest about what actually
  // happened. Each channel is independent — LMS enroll failing does not
  // block the WhatsApp or email send.
  enrollSkipped?: boolean;
  enrollError?: string;
  waSkipped?: boolean;
  emailSkipped?: boolean;
  waError?: string;
  emailError?: string;
}

// Onboard a converted lead. Three independent channels fire in parallel:
//   1) LMS enrollment  — POST to LMS_API_URL with cohort_id
//   2) WhatsApp        — global template picked in Admin → Cohort Onboarding
//   3) Email           — global template picked in Admin → Cohort Onboarding
//
// None gates the others. If the LMS is down, the customer still receives
// their welcome WA + email so they know they're in the cohort. Every
// attempt (success or failure) writes to lead_activities so the History
// tab explains exactly what fired and what didn't.
export async function onboardLeadToLmsAction(
  leadId: string,
  cohortId: string,
  trigger: "manual" | "auto" = "manual",
): Promise<OnboardResult> {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const [{ data: leadData }, { data: cohortData }] = await Promise.all([
    sb.from("leads").select("*").eq("id", leadId).maybeSingle<LeadRow>(),
    sb.from("cohorts").select("*").eq("id", cohortId).maybeSingle<CohortRow>(),
  ]);
  if (!leadData) return { error: "Lead not found." };
  if (!cohortData) return { error: "Cohort not found." };

  // Concurrency guard. Two auto-fires can race (rapid consecutive payments,
  // or auto + manual overlapping). Whoever writes 'pending' first proceeds;
  // others see the pending row and skip until it resolves (or is stale).
  const { data: existing } = await sb
    .from("lead_lms_onboardings")
    .select("status,updated_at")
    .eq("lead_id", leadId)
    .eq("cohort_id", cohortId)
    .maybeSingle<{ status: string; updated_at: string }>();
  if (existing?.status === "sent") {
    return { ok: true }; // already delivered, silent no-op
  }
  if (
    existing?.status === "pending" &&
    Date.now() - Date.parse(existing.updated_at) < 60_000
  ) {
    // Another onboarding attempt for the same (lead, cohort) is in flight.
    return { ok: false, error: "Onboarding already in progress." };
  }
  // Reserve the row as pending BEFORE any external calls so concurrent
  // callers see us and back off.
  await recordOnboarding(leadId, cohortId, session.userId, "pending", null, null);

  const { data: settings } = await sb
    .from("lms_settings")
    .select("whatsapp_template_id,email_template_id")
    .eq("id", 1)
    .maybeSingle<
      Pick<LmsSettingsRow, "whatsapp_template_id" | "email_template_id">
    >();

  const [{ data: waTemplateData }, { data: emailTemplateData }] = await Promise.all([
    settings?.whatsapp_template_id
      ? sb
          .from("whatsapp_templates")
          .select("*")
          .eq("id", settings.whatsapp_template_id)
          .eq("is_active", true)
          .maybeSingle<WhatsAppTemplateRow>()
      : Promise.resolve({ data: null as WhatsAppTemplateRow | null }),
    settings?.email_template_id
      ? sb
          .from("email_templates")
          .select("*")
          .eq("id", settings.email_template_id)
          .eq("is_archived", false)
          .maybeSingle<EmailTemplateRow>()
      : Promise.resolve({ data: null as EmailTemplateRow | null }),
  ]);

  let enrollSkipped = false;
  let enrollError: string | undefined;
  let lmsUserId: string | null = null;
  let waSkipped = false;
  let emailSkipped = false;
  let waError: string | undefined;
  let emailError: string | undefined;

  await Promise.all([
    // ── LMS enrollment ────────────────────────────────────
    (async () => {
      if (!process.env.LMS_API_URL || !process.env.LMS_API_KEY) {
        enrollSkipped = true;
        return;
      }
      try {
        const enroll = await enrollLeadInLms({
          lead: leadData,
          cohort: cohortData,
        });
        if (enroll.ok) {
          lmsUserId = enroll.lmsUserId ?? null;
        } else {
          enrollError = enroll.error ?? "LMS enroll failed";
        }
      } catch (err) {
        console.error("[lms-onboard] enroll failed:", err);
        enrollError = err instanceof Error ? err.message : String(err);
      }
    })(),

    // ── WhatsApp ──────────────────────────────────────────
    (async () => {
      if (!waTemplateData) {
        waSkipped = true;
        return;
      }
      if (!leadData.phone) {
        waSkipped = true;
        waError = "lead has no phone number";
        return;
      }
      try {
        const variableOverrides = buildWaVariables(waTemplateData, leadData, cohortData);
        await withRetry(
          () =>
            sendWhatsAppTemplate({
              lead: leadData,
              template: waTemplateData,
              actorId: session.userId,
              variableOverrides,
            }),
          isTransientError,
        );
      } catch (err) {
        console.error("[lms-onboard] WA send failed:", err);
        waSkipped = true;
        waError = err instanceof Error ? err.message : String(err);
      }
    })(),

    // ── Email ─────────────────────────────────────────────
    (async () => {
      if (!emailTemplateData) {
        emailSkipped = true;
        return;
      }
      if (!leadData.email) {
        emailSkipped = true;
        emailError = "lead has no email address";
        return;
      }
      if (leadData.is_dnc) {
        emailSkipped = true;
        emailError = "lead is marked do-not-contact";
        return;
      }
      try {
        await withRetry(
          () =>
            sendEmail({
              lead: leadData,
              subject: emailTemplateData.subject,
              bodyHtml: emailTemplateData.body_html,
              actorId: session.userId,
            }),
          isTransientError,
        );
      } catch (err) {
        console.error("[lms-onboard] email send failed:", err);
        emailSkipped = true;
        emailError = err instanceof Error ? err.message : String(err);
      }
    })(),
  ]);

  // "sent" = at least one channel of WA/email actually delivered. If the
  // WA + email both failed AND enroll also failed, this is a full-failure
  // state and the manual button shows "Retry".
  const anyDelivered =
    (!waSkipped && !waError) ||
    (!emailSkipped && !emailError) ||
    (!enrollSkipped && !enrollError);
  const status = anyDelivered ? "sent" : "failed";
  const combinedError =
    !anyDelivered
      ? [enrollError, waError, emailError].filter(Boolean).join(" · ") ||
        "All channels failed"
      : null;

  await recordOnboarding(
    leadId,
    cohortId,
    session.userId,
    status,
    lmsUserId,
    combinedError,
  );

  await sb.from("lead_activities").insert({
    lead_id: leadId,
    actor_id: session.userId,
    kind: "lms_onboarded",
    payload: {
      trigger,
      cohort_id: cohortId,
      cohort_number: cohortData.number,
      cohort_label: cohortData.label,
      lms_user_id: lmsUserId,
      enroll_skipped: enrollSkipped,
      enroll_error: enrollError ?? null,
      wa_skipped: waSkipped,
      email_skipped: emailSkipped,
      wa_error: waError ?? null,
      email_error: emailError ?? null,
      status,
    },
  });

  revalidatePath("/converted-leads");
  revalidatePath(`/admin/cohorts/${cohortId}`);
  revalidatePath(`/leads/${leadId}`);
  return {
    ok: anyDelivered,
    error: combinedError ?? undefined,
    enrollSkipped,
    enrollError,
    waSkipped,
    emailSkipped,
    waError,
    emailError,
  };
}

async function recordOnboarding(
  leadId: string,
  cohortId: string,
  actorId: string,
  status: "sent" | "failed" | "pending",
  lmsUserId: string | null,
  error: string | null,
) {
  const sb = supabaseAdmin();
  const sentAt = status === "sent" ? new Date().toISOString() : null;
  await sb.from("lead_lms_onboardings").upsert(
    {
      lead_id: leadId,
      cohort_id: cohortId,
      actor_id: actorId,
      status,
      lms_user_id: lmsUserId,
      error,
      sent_at: sentAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "lead_id,cohort_id" },
  );
}

// Retry any thrown transient error up to 3 attempts with exponential backoff.
// Non-transient errors (4xx client errors like 400 / 401 / 404) fail fast.
async function withRetry<T>(
  fn: () => Promise<T>,
  isTransient: (err: unknown) => boolean,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Transient = server-side hiccup or network flake. Anything else is
  // a config / content problem that won't fix itself on retry.
  return /\b(429|500|502|503|504|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|fetch failed|network|timeout)\b/i.test(
    msg,
  );
}

// Build the ContentVariables map for Twilio's Content API. Twilio rejects
// sends where the map is empty or where the number of variables doesn't
// match the placeholders in the approved template body. We inspect the
// template body for {{N}} to determine the correct count and pad with
// sensible fallbacks so empty custom-field values don't blow up the send.
function buildWaVariables(
  template: WhatsAppTemplateRow,
  lead: LeadRow,
  cohort: CohortRow,
): string[] {
  const needed = Math.max(maxPlaceholderIndex(template.body), 1);
  const configured = template.variables ?? [];
  const naturalFallbacks = [
    lead.name || "there",
    cohort.number || "",
    cohort.label || cohort.number || "",
    lead.email || "",
    lead.phone || "",
  ];
  const values: string[] = [];
  for (let i = 0; i < needed; i++) {
    let v = "";
    if (configured[i]) v = resolveVarPath(lead, configured[i]);
    if (!v.trim()) v = naturalFallbacks[i] ?? " ";
    // Twilio still rejects a plain empty string, so use a non-breaking
    // space as an absolute last resort — invisible in the delivered message.
    values.push(v || " ");
  }
  return values;
}

function maxPlaceholderIndex(body: string): number {
  let max = 0;
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return max;
}

function resolveVarPath(lead: LeadRow, path: string): string {
  if (path === "name") return lead.name ?? "";
  if (path === "email") return lead.email ?? "";
  if (path === "phone") return lead.phone ?? "";
  if (path.startsWith("custom.")) {
    const v = (lead.custom as Record<string, unknown> | null)?.[path.slice(7)];
    return v == null ? "" : String(v);
  }
  return "";
}

