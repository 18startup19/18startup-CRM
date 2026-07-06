// Twilio Content Templates API wrapper — used to submit WhatsApp templates
// to Meta for approval and to fetch approval status. Docs:
//   POST   https://content.twilio.com/v1/Content
//   POST   https://content.twilio.com/v1/Content/{ContentSid}/ApprovalRequests/whatsapp
//   GET    https://content.twilio.com/v1/Content/{ContentSid}/ApprovalRequests
//   GET    https://content.twilio.com/v1/Content

const CONTENT_API_BASE = "https://content.twilio.com/v1";

interface TwilioAuth {
  accountSid: string;
  authToken: string;
}

function getAuth(): TwilioAuth {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error(
      "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN — set them in Vercel env vars.",
    );
  }
  return { accountSid, authToken };
}

function authHeader({ accountSid, authToken }: TwilioAuth): string {
  return "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
}

async function twilioFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const auth = getAuth();
  const res = await fetch(`${CONTENT_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(auth),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // Non-JSON — usually only on 5xx
  }
  return { ok: res.ok, status: res.status, data };
}

export interface CreateContentInput {
  friendly_name: string;
  language: string;
  body: string;
  // Ordered variable names — matches whatsapp_templates.variables. Used to
  // build the "variables" map ({"1": "name", "2": "budget", ...}) that
  // Twilio expects. Actual runtime values are substituted at send time.
  variables: string[];
}

export interface CreateContentResult {
  sid: string;
  raw: Record<string, unknown>;
}

// POST /v1/Content — creates a Twilio Content resource for the template body.
export async function createContentTemplate(
  input: CreateContentInput,
): Promise<CreateContentResult> {
  const variablesMap: Record<string, string> = {};
  input.variables.forEach((v, i) => {
    variablesMap[String(i + 1)] = v;
  });

  const { ok, status, data } = await twilioFetch("/Content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      friendly_name: input.friendly_name,
      language: input.language,
      variables: variablesMap,
      types: {
        "twilio/text": { body: input.body },
      },
    }),
  });

  if (!ok || typeof data.sid !== "string") {
    throw new Error(
      `Twilio Content create failed (${status}): ${extractError(data)}`,
    );
  }
  return { sid: data.sid, raw: data };
}

export interface SubmitApprovalInput {
  contentSid: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
}

export interface SubmitApprovalResult {
  status: string;
  raw: Record<string, unknown>;
}

// POST /v1/Content/{ContentSid}/ApprovalRequests/whatsapp — submits the
// Content resource to Meta via Twilio for review.
export async function submitWhatsAppApproval(
  input: SubmitApprovalInput,
): Promise<SubmitApprovalResult> {
  const { ok, status, data } = await twilioFetch(
    `/Content/${input.contentSid}/ApprovalRequests/whatsapp`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name, category: input.category }),
    },
  );

  if (!ok) {
    throw new Error(
      `Twilio approval submit failed (${status}): ${extractError(data)}`,
    );
  }
  // Response shape: { whatsapp: { status: "received"|"pending"|... , ... } }
  const wa = (data.whatsapp as Record<string, unknown> | undefined) ?? {};
  return {
    status: typeof wa.status === "string" ? wa.status : "pending",
    raw: data,
  };
}

// GET /v1/Content/{ContentSid}/ApprovalRequests — poll for status change.
export async function fetchApprovalStatus(
  contentSid: string,
): Promise<{ status: string; raw: Record<string, unknown> }> {
  const { ok, status, data } = await twilioFetch(
    `/Content/${contentSid}/ApprovalRequests`,
    { method: "GET" },
  );
  if (!ok) {
    throw new Error(
      `Twilio approval fetch failed (${status}): ${extractError(data)}`,
    );
  }
  const wa = (data.whatsapp as Record<string, unknown> | undefined) ?? {};
  return {
    status: typeof wa.status === "string" ? wa.status : "unknown",
    raw: data,
  };
}

export interface TwilioContentTemplate {
  sid: string;
  friendly_name: string;
  language: string;
  body: string;
  variables: string[];
  approval_status: string;
}

// GET /v1/Content — list every Content resource on the account. Handles
// pagination via the "next_page_url" field. Filters down to text-type
// WhatsApp templates.
export async function listContentTemplates(): Promise<TwilioContentTemplate[]> {
  const results: TwilioContentTemplate[] = [];
  let path: string | null = "/Content?PageSize=50";

  while (path) {
    const { ok, status, data } = await twilioFetch(path, { method: "GET" });
    if (!ok) {
      throw new Error(
        `Twilio content list failed (${status}): ${extractError(data)}`,
      );
    }
    const contents = (data.contents as Array<Record<string, unknown>>) ?? [];
    for (const c of contents) {
      const sid = typeof c.sid === "string" ? c.sid : null;
      if (!sid) continue;
      const types = (c.types as Record<string, unknown>) ?? {};
      const textType = (types["twilio/text"] as Record<string, unknown>) ?? {};
      const body = typeof textType.body === "string" ? textType.body : "";
      const variablesMap =
        (c.variables as Record<string, string>) ?? {};
      // Reconstruct ordered variable name list from the map { "1": name, ... }
      const variables = Object.keys(variablesMap)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => variablesMap[k])
        .filter((v): v is string => typeof v === "string");

      results.push({
        sid,
        friendly_name:
          typeof c.friendly_name === "string" ? c.friendly_name : sid,
        language: typeof c.language === "string" ? c.language : "en",
        body,
        variables,
        approval_status: "unknown",
      });
    }
    const meta = (data.meta as Record<string, unknown> | undefined) ?? {};
    const nextUrl =
      typeof meta.next_page_url === "string" ? meta.next_page_url : null;
    path = nextUrl ? nextUrl.replace(CONTENT_API_BASE, "") : null;
  }

  // Enrich each with the current WhatsApp approval status (best-effort — skip
  // any that error individually so one bad row doesn't break the whole list).
  await Promise.all(
    results.map(async (r) => {
      try {
        const { status } = await fetchApprovalStatus(r.sid);
        r.approval_status = status;
      } catch {
        r.approval_status = "unknown";
      }
    }),
  );

  return results;
}

function extractError(data: Record<string, unknown>): string {
  if (typeof data.message === "string") return data.message;
  if (typeof data.error_message === "string") return data.error_message;
  if (typeof data.code === "number" && typeof data.message === "string") {
    return `[${data.code}] ${data.message}`;
  }
  return JSON.stringify(data).slice(0, 200);
}
