"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/rbac-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugifyUrl } from "@/lib/utils";
import type { EventExtraField, EventRow } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EventActionResult =
  | { ok: true; id: string; slug?: string }
  | { ok: false; error: string };

function parseAmountPaise(raw: unknown): number {
  const s = String(raw ?? "").trim();
  if (!s) return 0;
  const rupees = Number(s);
  if (!Number.isFinite(rupees) || rupees < 0) return 0;
  return Math.round(rupees * 100);
}

function nullish<T>(v: T | null | undefined | ""): T | null {
  return v == null || v === "" ? null : (v as T);
}

function parseTags(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s.split(",").map((t) => t.trim()).filter(Boolean);
}

function parseExtraFields(raw: unknown): EventExtraField[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (f): f is EventExtraField =>
          !!f &&
          typeof (f as EventExtraField).key === "string" &&
          typeof (f as EventExtraField).label === "string",
      )
      .map((f) => ({
        key: slugifyUrl(f.key),
        label: f.label,
        type: (["text", "longtext", "dropdown"] as const).includes(f.type)
          ? f.type
          : "text",
        options: Array.isArray(f.options)
          ? f.options.filter((o) => typeof o === "string")
          : undefined,
        required: !!f.required,
      }));
  } catch {
    return [];
  }
}

function randomToken(): string {
  return randomBytes(6).toString("base64url");
}

async function findAvailableSlug(
  sb: SupabaseClient,
  base: string,
  excludeId: string | null,
): Promise<string> {
  const safe = base || "event";
  let candidate = safe;
  let n = 1;
  while (n < 200) {
    let q = sb.from("events").select("id").eq("slug", candidate);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.limit(1);
    if (!data || data.length === 0) return candidate;
    n++;
    candidate = `${safe}-${n}`;
  }
  return `${safe}-${Math.random().toString(36).slice(2, 8)}`;
}

function readFields(fd: FormData) {
  return {
    internal_label: String(fd.get("internal_label") ?? "").trim(),
    title: String(fd.get("title") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim() || null,
    image_url: String(fd.get("image_url") ?? "").trim() || null,
    starts_at: String(fd.get("starts_at") ?? "").trim(),
    ends_at: String(fd.get("ends_at") ?? "").trim() || null,
    location_text: String(fd.get("location_text") ?? "").trim() || null,
    location_map_url: String(fd.get("location_map_url") ?? "").trim() || null,
    terms_and_conditions:
      String(fd.get("terms_and_conditions") ?? "").trim() || null,
    guidelines: String(fd.get("guidelines") ?? "").trim() || null,
    capacity: (() => {
      const s = String(fd.get("capacity") ?? "").trim();
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    })(),
    amount_paise: parseAmountPaise(fd.get("amount_rupees")),
    mode: (String(fd.get("mode") ?? "test") === "live" ? "live" : "test") as
      | "test"
      | "live",
    extra_fields: parseExtraFields(fd.get("extra_fields_json")),
    registered_stage_id: nullish(String(fd.get("registered_stage_id") ?? "")),
    attended_stage_id: nullish(String(fd.get("attended_stage_id") ?? "")),
    pipeline_id: nullish(String(fd.get("pipeline_id") ?? "")),
    owner_id: nullish(String(fd.get("owner_id") ?? "")),
    tags: parseTags(fd.get("tags")),
    is_published: String(fd.get("is_published") ?? "") === "true",
    raw_slug: String(fd.get("slug") ?? "").trim(),
    zoom_meeting_id: (() => {
      // Admins paste the meeting ID from Zoom. We strip spaces and any
      // "https://zoom.us/j/…" nonsense they might paste by accident.
      const raw = String(fd.get("zoom_meeting_id") ?? "").trim();
      if (!raw) return null;
      const match = raw.match(/(\d{9,12})/);
      return match ? match[1] : raw.replace(/\s+/g, "");
    })(),
  };
}

export async function createEventAction(
  _prev: EventActionResult | undefined,
  fd: FormData,
): Promise<EventActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const v = readFields(fd);

  if (!v.internal_label) return { ok: false, error: "Internal label required" };
  if (!v.title) return { ok: false, error: "Buyer-facing title required" };
  if (!v.starts_at) return { ok: false, error: "Start date/time required" };

  // datetime-local strings come in without a timezone. Convert to a proper
  // UTC ISO so Postgres stores the moment the admin actually picked.
  const startsIso = new Date(v.starts_at).toISOString();
  const endsIso = v.ends_at ? new Date(v.ends_at).toISOString() : null;

  const slugBase = slugifyUrl(v.raw_slug || v.internal_label);
  const slug = await findAvailableSlug(sb, slugBase, null);

  const { data: inserted, error } = await sb
    .from("events")
    .insert({
      slug,
      internal_label: v.internal_label,
      title: v.title,
      description: v.description,
      image_url: v.image_url,
      starts_at: startsIso,
      ends_at: endsIso,
      location_text: v.location_text,
      location_map_url: v.location_map_url,
      terms_and_conditions: v.terms_and_conditions,
      guidelines: v.guidelines,
      capacity: v.capacity,
      amount_paise: v.amount_paise,
      currency: "INR",
      mode: v.mode,
      checkin_token: randomToken(),
      extra_fields: v.extra_fields,
      registered_stage_id: v.registered_stage_id,
      attended_stage_id: v.attended_stage_id,
      pipeline_id: v.pipeline_id,
      owner_id: v.owner_id,
      tags: v.tags,
      is_published: v.is_published,
      zoom_meeting_id: v.zoom_meeting_id,
    })
    .select("*")
    .single<EventRow>();
  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "Insert failed" };
  }

  revalidatePath("/admin/events");
  return { ok: true, id: inserted.id, slug };
}

export async function updateEventAction(
  id: string,
  _prev: EventActionResult | undefined,
  fd: FormData,
): Promise<EventActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const v = readFields(fd);

  if (!v.internal_label) return { ok: false, error: "Internal label required" };
  if (!v.title) return { ok: false, error: "Buyer-facing title required" };
  if (!v.starts_at) return { ok: false, error: "Start date/time required" };

  const startsIso = new Date(v.starts_at).toISOString();
  const endsIso = v.ends_at ? new Date(v.ends_at).toISOString() : null;

  // Slug: only rewrite if admin actually changed it. Renaming internal_label
  // alone leaves the public URL alone so shared links keep working.
  let slug: string | undefined;
  if (v.raw_slug) {
    const slugBase = slugifyUrl(v.raw_slug);
    slug = await findAvailableSlug(sb, slugBase, id);
  }

  const { error } = await sb
    .from("events")
    .update({
      internal_label: v.internal_label,
      ...(slug ? { slug } : {}),
      title: v.title,
      description: v.description,
      image_url: v.image_url,
      starts_at: startsIso,
      ends_at: endsIso,
      location_text: v.location_text,
      location_map_url: v.location_map_url,
      terms_and_conditions: v.terms_and_conditions,
      guidelines: v.guidelines,
      capacity: v.capacity,
      amount_paise: v.amount_paise,
      mode: v.mode,
      extra_fields: v.extra_fields,
      registered_stage_id: v.registered_stage_id,
      attended_stage_id: v.attended_stage_id,
      pipeline_id: v.pipeline_id,
      owner_id: v.owner_id,
      tags: v.tags,
      is_published: v.is_published,
      zoom_meeting_id: v.zoom_meeting_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/events");
  revalidatePath("/admin/events/" + id);
  return { ok: true, id };
}

// Regenerate the checkin token — invalidates the current QR at the venue.
// Useful if the old URL leaked and random people are self-checking in.
export async function rotateCheckinTokenAction(
  id: string,
): Promise<EventActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("events")
    .update({ checkin_token: randomToken(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/events/" + id);
  return { ok: true, id };
}

// Organizer manually checks in a registrant from the checkin page — the
// fallback when the attendee's phone camera won't scan the QR.
export async function manualCheckinAction(
  registrationId: string,
): Promise<EventActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: reg } = await sb
    .from("event_registrations")
    .select("id,event_id,lead_id,attended_at")
    .eq("id", registrationId)
    .maybeSingle<{
      id: string;
      event_id: string;
      lead_id: string;
      attended_at: string | null;
    }>();
  if (!reg) return { ok: false, error: "Registration not found" };
  if (reg.attended_at) return { ok: true, id: reg.id };

  const { data: event } = await sb
    .from("events")
    .select("attended_stage_id")
    .eq("id", reg.event_id)
    .maybeSingle<Pick<EventRow, "attended_stage_id">>();

  await sb
    .from("event_registrations")
    .update({
      attended_at: new Date().toISOString(),
      checkin_source: "organizer_marked",
    })
    .eq("id", registrationId);

  if (event?.attended_stage_id) {
    await sb
      .from("leads")
      .update({ stage_id: event.attended_stage_id })
      .eq("id", reg.lead_id);
    await sb.from("lead_activities").insert({
      lead_id: reg.lead_id,
      actor_id: null,
      kind: "stage_changed",
      payload: {
        to: event.attended_stage_id,
        source: "event_checkin_manual",
        event_id: reg.event_id,
      },
    });
  }

  revalidatePath("/admin/events/" + reg.event_id);
  return { ok: true, id: reg.id };
}

// Pull the Zoom attendance report for an event's meeting and mark matched
// registrations attended. Match is by Zoom's registrant_id (100%
// accurate — it's the same ID we saved when we added the registrant via
// API), NOT by email or name — so a person who signed into Zoom with a
// different Google account still matches correctly.
export interface ZoomSyncResult {
  ok: boolean;
  error?: string;
  matched?: number;
  alreadyMarked?: number;
  unmatched?: number;
  unmatchedNames?: string[];
}

export async function syncZoomAttendanceAction(
  eventId: string,
): Promise<ZoomSyncResult> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const { data: event } = await sb
    .from("events")
    .select("id,zoom_meeting_id,attended_stage_id")
    .eq("id", eventId)
    .maybeSingle<
      Pick<EventRow, "id" | "zoom_meeting_id" | "attended_stage_id">
    >();
  if (!event) return { ok: false, error: "Event not found." };
  if (!event.zoom_meeting_id) {
    return {
      ok: false,
      error: "No Zoom meeting ID set on this event. Add it and try again.",
    };
  }

  const { getMeetingParticipants } = await import("@/lib/integrations/zoom");
  const report = await getMeetingParticipants(event.zoom_meeting_id);
  if (!report.ok) return { ok: false, error: report.error };

  // Fetch this event's registrations that already have a Zoom registrant_id.
  const { data: regsData } = await sb
    .from("event_registrations")
    .select("id,lead_id,attended_at,zoom_registrant_id")
    .eq("event_id", eventId)
    .not("zoom_registrant_id", "is", null);
  const regs = (regsData ?? []) as {
    id: string;
    lead_id: string;
    attended_at: string | null;
    zoom_registrant_id: string;
  }[];
  const byRegistrant = new Map(regs.map((r) => [r.zoom_registrant_id, r]));

  let matched = 0;
  let alreadyMarked = 0;
  const unmatchedNames: string[] = [];

  for (const p of report.participants) {
    if (!p.registrantId) {
      // Person joined without going through registration (e.g. host,
      // co-host, guest link). Nothing to match against — record their
      // name for the admin to review.
      unmatchedNames.push(p.name || p.email || "unknown");
      continue;
    }
    const reg = byRegistrant.get(p.registrantId);
    if (!reg) {
      unmatchedNames.push(p.name || p.email || "unknown");
      continue;
    }
    if (reg.attended_at) {
      alreadyMarked++;
      continue;
    }
    await sb
      .from("event_registrations")
      .update({
        attended_at: p.joinTime || new Date().toISOString(),
        checkin_source: "zoom_sync",
      })
      .eq("id", reg.id);
    if (event.attended_stage_id) {
      await sb
        .from("leads")
        .update({ stage_id: event.attended_stage_id })
        .eq("id", reg.lead_id);
      await sb.from("lead_activities").insert({
        lead_id: reg.lead_id,
        actor_id: null,
        kind: "stage_changed",
        payload: {
          to: event.attended_stage_id,
          source: "event_zoom_sync",
          event_id: eventId,
          duration_seconds: p.durationSeconds,
        },
      });
    }
    matched++;
  }

  revalidatePath("/admin/events/" + eventId);
  return {
    ok: true,
    matched,
    alreadyMarked,
    unmatched: unmatchedNames.length,
    unmatchedNames: unmatchedNames.slice(0, 30),
  };
}
