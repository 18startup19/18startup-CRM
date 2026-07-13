// Zoom Server-to-Server OAuth adapter. Two things we need:
//   1. Add a person as a registrant to a Meeting → returns a personal
//      join URL + registrant_id we store against our CRM registration.
//   2. Fetch the past-meeting participant report → each participant has
//      the same registrant_id, letting us mark attendance 100% accurately
//      regardless of what email they signed into Zoom with.
//
// Docs:
//   OAuth      → https://developers.zoom.us/docs/internal-apps/s2s-oauth/
//   Registrant → https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/meetingRegistrantCreate
//   Report     → https://developers.zoom.us/docs/api/rest/reference/zoom-api/methods/#operation/reportMeetingParticipants
//
// Env vars: ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET.

interface ZoomCredentials {
  accountId: string;
  clientId: string;
  clientSecret: string;
}

function readCredentials(): ZoomCredentials {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    throw new Error(
      "Zoom credentials not configured — set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in Vercel and redeploy.",
    );
  }
  return { accountId, clientId, clientSecret };
}

// Simple in-memory access-token cache. Server-to-Server OAuth tokens are
// valid ~1 hour; we refresh a couple minutes before expiry. Cache lives
// inside the running Node function; a cold start refetches on demand,
// which is fine — the token endpoint is cheap.
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - 120_000 > now) {
    return tokenCache.token;
  }
  const creds = readCredentials();
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString(
    "base64",
  );
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`,
    {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Zoom auth failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    throw new Error(`Zoom auth returned no token: ${text}`);
  }
  tokenCache = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return json.access_token;
}

export interface AddRegistrantInput {
  meetingId: string;
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
}

export interface AddRegistrantResult {
  ok: true;
  registrantId: string;
  joinUrl: string;
}

export interface AddRegistrantAlreadyExists {
  ok: false;
  alreadyRegistered: true;
  error: string;
}

export interface AddRegistrantError {
  ok: false;
  alreadyRegistered: false;
  error: string;
}

export type AddRegistrantOutcome =
  | AddRegistrantResult
  | AddRegistrantAlreadyExists
  | AddRegistrantError;

// Add a registrant. Zoom returns 201 on success with { registrant_id,
// join_url, id }. On duplicate email for the same meeting, Zoom returns
// 400 with a message like "The user has already registered." — we surface
// that as `alreadyRegistered: true` so the caller can look up the
// existing registration and re-use its join URL.
export async function addMeetingRegistrant(
  input: AddRegistrantInput,
): Promise<AddRegistrantOutcome> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    return {
      ok: false,
      alreadyRegistered: false,
      error: err instanceof Error ? err.message : "Zoom auth failed",
    };
  }
  const res = await fetch(
    `https://api.zoom.us/v2/meetings/${encodeURIComponent(input.meetingId)}/registrants`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        first_name: input.firstName,
        last_name: input.lastName ?? "",
        email: input.email,
        phone: input.phone,
      }),
    },
  );
  const text = await res.text();
  if (res.ok) {
    const json = JSON.parse(text) as {
      registrant_id?: string;
      id?: string;
      join_url?: string;
    };
    const registrantId = json.registrant_id ?? json.id;
    if (!registrantId || !json.join_url) {
      return {
        ok: false,
        alreadyRegistered: false,
        error: `Zoom returned unexpected payload: ${text}`,
      };
    }
    return { ok: true, registrantId, joinUrl: json.join_url };
  }
  // Duplicate-email detection. Zoom's error copy varies across API versions
  // but always includes "already registered" in the human message.
  const duplicate = /already registered/i.test(text);
  return {
    ok: false,
    alreadyRegistered: duplicate,
    error: `Zoom register failed (${res.status}): ${text}`,
  };
}

export interface ZoomParticipant {
  registrantId: string | null;
  name: string;
  email: string | null;
  joinTime: string;
  leaveTime: string | null;
  durationSeconds: number;
}

// Pull the participant report for a past meeting. Paginates until Zoom
// returns no next_page_token. Handles the common case where the meeting
// hasn't ended yet (Zoom returns 404 on the report endpoint until then).
export async function getMeetingParticipants(
  meetingId: string,
): Promise<{ ok: true; participants: ZoomParticipant[] } | { ok: false; error: string }> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Zoom auth failed" };
  }
  const out: ZoomParticipant[] = [];
  let pageToken: string | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const url = new URL(
      `https://api.zoom.us/v2/report/meetings/${encodeURIComponent(meetingId)}/participants`,
    );
    url.searchParams.set("page_size", "300");
    if (pageToken) url.searchParams.set("next_page_token", pageToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: `Zoom report failed (${res.status}): ${text}` };
    }
    const json = JSON.parse(text) as {
      participants?: Array<{
        registrant_id?: string;
        name?: string;
        user_email?: string;
        join_time?: string;
        leave_time?: string;
        duration?: number;
      }>;
      next_page_token?: string;
    };
    for (const p of json.participants ?? []) {
      const key = `${p.registrant_id ?? ""}|${p.user_email ?? ""}|${p.join_time ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        registrantId: p.registrant_id ?? null,
        name: p.name ?? "",
        email: p.user_email ?? null,
        joinTime: p.join_time ?? "",
        leaveTime: p.leave_time ?? null,
        durationSeconds: p.duration ?? 0,
      });
    }
    pageToken = json.next_page_token;
    if (!pageToken) break;
  }
  return { ok: true, participants: out };
}
