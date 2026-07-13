import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { intakeLead } from "@/lib/intake";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { onboardLeadToLmsAction } from "@/app/actions/onboard";
import type {
  IntakeSettingsRow,
  PaymentPageRow,
} from "@/lib/database.types";

// Razorpay webhook receiver. Razorpay signs every request with an HMAC-SHA256
// of the raw request body using the webhook secret configured in the
// Razorpay dashboard. We verify that first — bad signatures return 401
// immediately with no processing.
//
// Razorpay fires several events for a single payment (payment.authorized,
// payment.captured, order.paid, sometimes payment.failed). We act only on
// payment.captured — that's the moment money actually moved and the
// customer is a real qualified lead.

export async function POST(req: NextRequest) {
  // Support two independent webhook secrets side-by-side so live and test
  // Razorpay webhooks can each have their own value:
  //   RAZORPAY_WEBHOOK_SECRET       — live webhook (existing)
  //   RAZORPAY_WEBHOOK_SECRET_TEST  — test-mode webhook (added later)
  // Either one verifying the incoming signature is enough. Missing envs
  // are skipped rather than treated as an error, so admins don't need
  // both configured on day one.
  const secrets = [
    process.env.RAZORPAY_WEBHOOK_SECRET,
    process.env.RAZORPAY_WEBHOOK_SECRET_TEST,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);
  if (secrets.length === 0) {
    return Response.json(
      {
        ok: false,
        error:
          "Neither RAZORPAY_WEBHOOK_SECRET nor RAZORPAY_WEBHOOK_SECRET_TEST configured on CRM.",
      },
      { status: 500 },
    );
  }

  const raw = await req.text();
  const provided = req.headers.get("x-razorpay-signature") ?? "";
  const providedBuf = Buffer.from(provided);

  const matched = secrets.some((s) => {
    const expected = createHmac("sha256", s).update(raw).digest("hex");
    const expectedBuf = Buffer.from(expected);
    return (
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf)
    );
  });
  if (!matched) {
    return Response.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: RazorpayWebhookBody;
  try {
    body = JSON.parse(raw) as RazorpayWebhookBody;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  // Only act on captured — ignore authorized/paid/failed/refunded etc.
  // Return 200 so Razorpay stops retrying; this event was fine, we just
  // don't care about it.
  if (body.event !== "payment.captured") {
    return Response.json({ ok: true, action: "ignored", event: body.event });
  }

  const payment = body.payload?.payment?.entity;
  if (!payment) {
    return Response.json({ ok: false, error: "missing payment entity" }, { status: 400 });
  }

  // Notes get stamped on the ORDER when we create it (from /api/pay/[id]/
  // create-order) and Razorpay may or may not mirror them onto the payment
  // depending on flow. Read from both — payment.notes wins if present.
  const orderNotes = body.payload?.order?.entity?.notes ?? {};
  const mergedNotes: Record<string, unknown> = {
    ...orderNotes,
    ...(payment.notes ?? {}),
  };

  const name =
    (mergedNotes.name as string) ||
    (payment.email?.split("@")[0] ?? "").trim() ||
    "Razorpay lead";
  const amountRupees = typeof payment.amount === "number" ? payment.amount / 100 : null;

  // Routing key = payment description ("Founders Workshop July 2026" etc).
  // Admins create one routing rule per payment page in Admin → Lead
  // Routing to send each to its own stage.
  const routingKey = payment.description ?? null;

  const sb = supabaseAdmin();

  // Events path: paid-event registrations stamp event_registration_id on
  // the order. Mark the registration paid; lead + routing were already set
  // up when the buyer hit /api/e/[slug]/register.
  const eventRegistrationId =
    typeof mergedNotes.event_registration_id === "string"
      ? (mergedNotes.event_registration_id as string)
      : null;
  if (eventRegistrationId) {
    await sb
      .from("event_registrations")
      .update({
        razorpay_payment_id: payment.id ?? null,
        paid_at: new Date().toISOString(),
      })
      .eq("id", eventRegistrationId);
    return Response.json({
      ok: true,
      action: "event_registration_paid",
      event_registration_id: eventRegistrationId,
    });
  }

  // Payment Pages path: if the order/payment carries a payment_page_crm_id
  // in notes (stamped when the buyer's browser called /api/pay/[id]/create-
  // order), we skip routing rules and use the page's own configuration —
  // pipeline/stage/owner/tags/cohort come from the payment_pages row.
  const crmPageId =
    typeof mergedNotes.payment_page_crm_id === "string"
      ? (mergedNotes.payment_page_crm_id as string)
      : null;
  if (crmPageId) {
    const { data: page } = await sb
      .from("payment_pages")
      .select("*")
      .eq("id", crmPageId)
      .maybeSingle<PaymentPageRow>();
    if (page) {
      return await handlePaymentPagePayment({
        sb,
        page,
        payment,
        mergedNotes,
        amountRupees,
        name,
      });
    }
    // Fall through if the page was deleted — treat as unknown payment.
  }

  // Allowlist mode: when razorpay_require_rule is on, we only accept
  // payments whose description matches an active routing rule. Anything
  // else — test payments, refunds, unrelated Razorpay flows — is
  // silently ignored (200 back so Razorpay doesn't retry).
  const { data: settings } = await sb
    .from("intake_settings")
    .select("razorpay_require_rule")
    .eq("id", 1)
    .maybeSingle<Pick<IntakeSettingsRow, "razorpay_require_rule">>();
  if (settings?.razorpay_require_rule) {
    if (!routingKey) {
      return Response.json({
        ok: true,
        action: "ignored",
        reason: "no_description",
      });
    }
    const { data: rule } = await sb
      .from("lead_routing_rules")
      .select("id")
      .eq("source", "razorpay")
      .eq("match_value", routingKey)
      .eq("is_active", true)
      .maybeSingle<{ id: string }>();
    if (!rule) {
      return Response.json({
        ok: true,
        action: "ignored",
        reason: "no_matching_rule",
      });
    }
  }

  const res = await intakeLead({
    name,
    phone: payment.contact ?? null,
    email: payment.email ?? null,
    source: "razorpay",
    routingKey,
    custom: {
      razorpay_payment_id: payment.id,
      razorpay_order_id: payment.order_id,
      amount: amountRupees,
      currency: payment.currency,
      method: payment.method,
      description: payment.description,
      ...(payment.notes ?? {}),
    },
  });

  if (!res.ok) {
    return Response.json({ ok: false, error: res.error }, { status: 500 });
  }
  return Response.json({
    ok: true,
    action: res.merged ? "merged" : "created",
    lead_id: res.leadId,
  });
}

// Payment came in through one of our CRM-owned Payment Pages.
// - Create the lead using the page's own routing (skip rules).
// - Record the payment amount on lead_amounts (goes into Converted Leads).
// - If the page is cohort-tied, set the lead's total_fee to the paid amount
//   (since a full-price page = full-fee purchase) and auto-fire LMS
//   onboarding. Small workshops just leave the amount recorded, no LMS.
type Sb = ReturnType<typeof supabaseAdmin>;

async function handlePaymentPagePayment(args: {
  sb: Sb;
  page: PaymentPageRow;
  payment: NonNullable<
    NonNullable<RazorpayWebhookBody["payload"]>["payment"]
  >["entity"] &
    object;
  mergedNotes: Record<string, unknown>;
  amountRupees: number | null;
  name: string;
}) {
  const { sb, page, payment, mergedNotes, amountRupees, name } = args;

  const asStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const phoneFromForm = asStr(mergedNotes.phone);
  const emailFromForm = asStr(mergedNotes.email);
  const cityFromForm = asStr(mergedNotes.city);

  const intake = await intakeLead({
    name,
    // Prefer the phone/email the buyer typed on our page over what Razorpay
    // stores on the Payment entity — same value in the happy path, but our
    // form is the authoritative source if they ever diverge.
    phone: phoneFromForm ?? payment.contact ?? null,
    email: emailFromForm ?? payment.email ?? null,
    source: "razorpay",
    routingKey: page.internal_label,
    override: {
      stageId: page.stage_id,
      ownerId: page.owner_id,
      tags: page.tags,
    },
    custom: {
      razorpay_payment_id: payment.id,
      razorpay_order_id: payment.order_id,
      amount: amountRupees,
      currency: payment.currency,
      method: payment.method,
      payment_page_id: page.id,
      payment_page_label: page.internal_label,
      // Populate the lead's Program custom field (key: "program") so
      // team members see which program the buyer purchased. Admin sets
      // program_name on the payment page; not shown to the buyer.
      ...(page.program_name ? { program: page.program_name } : {}),
      ...(cityFromForm ? { city: cityFromForm } : {}),
      ...mergedNotes,
    },
  });
  if (!intake.ok || !intake.leadId) {
    return Response.json({ ok: false, error: intake.error }, { status: 500 });
  }

  const leadId = intake.leadId;

  // Amount lives on `lead.custom` (stamped by intakeLead) so it's queryable
  // in the DB but not surfaced in the Converted Leads / Amount UI columns.
  // Per user's request (2026-07-12): don't write to lead_amounts and don't
  // set total_fee — payment-page payments must be invisible in the
  // front-end amount columns until the user decides where to surface them.

  // Cohort-tied page → LMS onboarding still runs, since the page charges
  // the full fee and this is the CRM's "purchase confirmed" signal.
  // Log-only on failure so a broken LMS doesn't 500 back at Razorpay.
  if (page.cohort_id) {
    try {
      await onboardLeadToLmsAction(leadId, page.cohort_id, "auto");
    } catch (err) {
      console.warn("[payment-page] LMS onboard failed:", err);
    }
  }

  return Response.json({
    ok: true,
    action: "created",
    lead_id: leadId,
    payment_page_id: page.id,
  });
}

interface RazorpayWebhookBody {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        method?: string;
        description?: string;
        email?: string;
        contact?: string;
        notes?: Record<string, unknown>;
      };
    };
    // On payment.captured events created against an Order, Razorpay
    // includes the Order entity here. Its `notes` are what our
    // /api/pay/[id]/create-order stamped when it created the Order.
    order?: {
      entity?: {
        notes?: Record<string, unknown>;
      };
    };
  };
}
