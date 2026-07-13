import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { intakeLead } from "@/lib/intake";
import type { EventRow } from "@/lib/database.types";

// Public attendance endpoint. Called from /e/[slug]/checkin/[token].
// Two flows:
//   - Existing registration (matched by phone) → mark attended, move lead
//     to the "Attended" stage.
//   - Unknown phone → create a walk-in registration + lead + mark attended
//     in one shot (name/phone/email required in this case).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: {
    token?: string;
    phone?: string;
    name?: string;
    email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const token = (body.token ?? "").trim();
  const phone = (body.phone ?? "").trim();
  if (!token || !phone) {
    return Response.json(
      { ok: false, error: "Phone number is required." },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { data: event } = await sb
    .from("events")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<EventRow>();
  if (!event) {
    return Response.json({ ok: false, error: "Event not found." }, { status: 404 });
  }
  if (event.checkin_token !== token) {
    return Response.json(
      { ok: false, error: "Checkin link is no longer valid." },
      { status: 401 },
    );
  }

  // Normalise a phone for matching — strip everything but digits, keep the
  // last 10 for Indian numbers. Match by trailing 10 digits so +91, 91, and
  // bare 10-digit forms all collide correctly.
  const digits = phone.replace(/[^\d]/g, "");
  const last10 = digits.slice(-10);
  if (last10.length !== 10) {
    return Response.json(
      { ok: false, error: "Please enter a valid 10-digit phone number." },
      { status: 400 },
    );
  }

  const { data: candidates } = await sb
    .from("event_registrations")
    .select("id,lead_id,attended_at,leads!inner(phone,name)")
    .eq("event_id", event.id);

  type Cand = {
    id: string;
    lead_id: string;
    attended_at: string | null;
    leads: { phone: string | null; name: string };
  };
  const matched = ((candidates ?? []) as unknown as Cand[]).find((c) => {
    const p = (c.leads?.phone ?? "").replace(/[^\d]/g, "").slice(-10);
    return p === last10;
  });

  if (matched) {
    if (matched.attended_at) {
      return Response.json({
        ok: true,
        already: true,
        name: matched.leads.name,
      });
    }
    await sb
      .from("event_registrations")
      .update({
        attended_at: new Date().toISOString(),
        checkin_source: "self_scan",
      })
      .eq("id", matched.id);
    if (event.attended_stage_id) {
      await sb
        .from("leads")
        .update({ stage_id: event.attended_stage_id })
        .eq("id", matched.lead_id);
      await sb.from("lead_activities").insert({
        lead_id: matched.lead_id,
        actor_id: null,
        kind: "stage_changed",
        payload: {
          to: event.attended_stage_id,
          source: "event_checkin_self",
          event_id: event.id,
        },
      });
    }
    return Response.json({ ok: true, name: matched.leads.name });
  }

  // Walk-in path: need name + email too.
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  if (!name || !email) {
    return Response.json(
      {
        ok: false,
        needsDetails: true,
        error: "Not registered yet — please fill in your name and email.",
      },
      { status: 400 },
    );
  }

  const intake = await intakeLead({
    name,
    phone,
    email,
    source: "web_form",
    routingKey: `event:${event.slug}:walkin`,
    override: {
      stageId: event.attended_stage_id ?? event.registered_stage_id,
      ownerId: event.owner_id,
      tags: event.tags,
    },
    custom: {
      event_id: event.id,
      event_title: event.title,
      event_slug: event.slug,
      walkin: true,
    },
  });
  if (!intake.ok || !intake.leadId) {
    return Response.json(
      { ok: false, error: intake.error ?? "Checkin failed." },
      { status: 500 },
    );
  }

  const now = new Date().toISOString();
  await sb.from("event_registrations").insert({
    event_id: event.id,
    lead_id: intake.leadId,
    registered_at: now,
    attended_at: now,
    checkin_source: "walkin",
    custom_answers: {},
  });

  return Response.json({ ok: true, walkin: true, name });
}
