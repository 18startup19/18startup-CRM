import type { CohortRow, LeadRow } from "../database.types";

// Enroll a lead in an LMS cohort. The LMS is treated as a generic REST
// service: POST to LMS_API_URL with a Bearer token; the payload uses a
// vendor-agnostic shape that most LMSes can adapt via a small proxy.
// Adjust the payload here (and only here) if the target LMS wants a
// different envelope.

export interface LmsEnrollResult {
  ok: boolean;
  lmsUserId?: string;
  error?: string;
}

interface EnrollInput {
  lead: Pick<LeadRow, "name" | "email" | "phone">;
  cohort: Pick<CohortRow, "number" | "label" | "lms_cohort_id">;
}

export async function enrollLeadInLms(
  input: EnrollInput,
): Promise<LmsEnrollResult> {
  const url = process.env.LMS_API_URL;
  const key = process.env.LMS_API_KEY;
  if (!url || !key) {
    return {
      ok: false,
      error: "LMS env not configured (LMS_API_URL / LMS_API_KEY).",
    };
  }
  if (!input.cohort.lms_cohort_id) {
    return {
      ok: false,
      error: `Cohort ${input.cohort.number} has no lms_cohort_id set. Add it under Admin → Cohort Onboarding.`,
    };
  }
  if (!input.lead.email) {
    return {
      ok: false,
      error: "Lead has no email — LMS accounts need an email.",
    };
  }

  const payload = {
    email: input.lead.email,
    name: input.lead.name,
    phone: input.lead.phone,
    cohort_id: input.cohort.lms_cohort_id,
    // Extra context the LMS can log or ignore:
    cohort_number: input.cohort.number,
    cohort_label: input.cohort.label,
    source: "crm",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const raw = await res.text().catch(() => "");
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      // LMS contract: failures return { error: "..." }. Fall back to raw
      // text if the body wasn't JSON (proxies, upstream 502s, etc.).
      const msg =
        (parsed && typeof parsed.error === "string" && parsed.error) ||
        raw ||
        `HTTP ${res.status}`;
      return { ok: false, error: `HTTP ${res.status}: ${msg.slice(0, 300)}` };
    }
    const lmsUserId =
      (typeof parsed?.lms_user_id === "string" && parsed.lms_user_id) ||
      (typeof parsed?.user_id === "string" && parsed.user_id) ||
      (typeof parsed?.id === "string" && parsed.id) ||
      undefined;
    return { ok: true, lmsUserId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
