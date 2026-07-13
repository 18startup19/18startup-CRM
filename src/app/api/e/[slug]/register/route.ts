import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { intakeLead } from "@/lib/intake";
import { createOrder } from "@/lib/razorpay-pages";
import type {
  EventExtraField,
  EventRow,
} from "@/lib/database.types";

// Public registration endpoint. Called from the /e/[slug] landing page's
// form. Two branches:
//   - Free event → create lead + registration row, return {ok, registrationId}
//   - Paid event → create lead + provisional registration row + Razorpay
//     order, return {ok, order:{...}} so the browser opens Checkout.js.
//     Registration is marked paid when the webhook fires payment.captured.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let body: {
    name?: string;
    phone?: string;
    email?: string;
    answers?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const name = (body.name ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const email = (body.email ?? "").trim();
  if (!name || !phone || !email) {
    return Response.json(
      { ok: false, error: "Name, phone and email are required." },
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
  if (!event.is_published) {
    return Response.json(
      { ok: false, error: "Event is not accepting registrations." },
      { status: 400 },
    );
  }

  // Capacity check — count only paid + free registrations that aren't
  // orphaned Razorpay attempts. Free events count all rows; paid events
  // count rows with paid_at set (so failed payments don't hold seats).
  if (event.capacity) {
    let q = sb
      .from("event_registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    if (event.amount_paise > 0) q = q.not("paid_at", "is", null);
    const { count } = await q;
    if ((count ?? 0) >= event.capacity) {
      return Response.json(
        { ok: false, error: "This event is fully booked." },
        { status: 400 },
      );
    }
  }

  // Validate answers against the event's schema. Required fields must be
  // present; unknown keys ignored.
  const answers: Record<string, string> = {};
  const fields = (event.extra_fields ?? []) as EventExtraField[];
  for (const f of fields) {
    const v = (body.answers?.[f.key] ?? "").trim();
    if (f.required && !v) {
      return Response.json(
        { ok: false, error: `${f.label} is required.` },
        { status: 400 },
      );
    }
    if (v) answers[f.key] = v;
  }

  // Create the lead first — with the event's routing baked in via override.
  const intake = await intakeLead({
    name,
    phone,
    email,
    source: "web_form",
    routingKey: `event:${event.slug}`,
    override: {
      stageId: event.registered_stage_id,
      ownerId: event.owner_id,
      tags: event.tags,
    },
    custom: {
      event_id: event.id,
      event_title: event.title,
      event_slug: event.slug,
      ...answers,
    },
  });
  if (!intake.ok || !intake.leadId) {
    return Response.json(
      { ok: false, error: intake.error ?? "Registration failed." },
      { status: 500 },
    );
  }

  // Free event: registration is complete right away.
  if (event.amount_paise === 0) {
    const { data: reg, error: regErr } = await sb
      .from("event_registrations")
      .insert({
        event_id: event.id,
        lead_id: intake.leadId,
        custom_answers: answers,
      })
      .select("id")
      .single<{ id: string }>();
    if (regErr) {
      return Response.json({ ok: false, error: regErr.message }, { status: 500 });
    }
    return Response.json({
      ok: true,
      free: true,
      registrationId: reg.id,
    });
  }

  // Paid event: provisional registration row, then Razorpay order. Webhook
  // will mark paid_at when payment.captured fires.
  const { data: reg, error: regErr } = await sb
    .from("event_registrations")
    .insert({
      event_id: event.id,
      lead_id: intake.leadId,
      custom_answers: answers,
      amount_paise: event.amount_paise,
    })
    .select("id")
    .single<{ id: string }>();
  if (regErr) {
    return Response.json({ ok: false, error: regErr.message }, { status: 500 });
  }

  try {
    const order = await createOrder(
      {
        amountPaise: event.amount_paise,
        currency: event.currency,
        notes: {
          event_id: event.id,
          event_slug: event.slug,
          event_registration_id: reg.id,
          name,
          phone,
          email,
        },
      },
      event.mode,
    );
    await sb
      .from("event_registrations")
      .update({ razorpay_order_id: order.orderId })
      .eq("id", reg.id);
    return Response.json({
      ok: true,
      free: false,
      registrationId: reg.id,
      order: {
        orderId: order.orderId,
        keyId: order.keyId,
        amountPaise: order.amountPaise,
        currency: order.currency,
      },
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to create order.",
      },
      { status: 500 },
    );
  }
}
