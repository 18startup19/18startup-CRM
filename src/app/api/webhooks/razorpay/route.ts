import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { intakeLead } from "@/lib/intake";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { onboardLeadToLmsAction } from "@/app/actions/onboard";
import type {
  CohortRow,
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
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { ok: false, error: "RAZORPAY_WEBHOOK_SECRET not configured on CRM." },
      { status: 500 },
    );
  }

  const raw = await req.text();
  const provided = req.headers.get("x-razorpay-signature") ?? "";
  const expected = createHmac("sha256", secret).update(raw).digest("hex");

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
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

  const name = (payment.notes?.name as string) || (payment.email?.split("@")[0] ?? "").trim() || "Razorpay lead";
  const amountRupees = typeof payment.amount === "number" ? payment.amount / 100 : null;

  // Routing key = payment description ("Founders Workshop July 2026" etc).
  // Admins create one routing rule per payment page in Admin → Lead
  // Routing to send each to its own stage.
  const routingKey = payment.description ?? null;

  const sb = supabaseAdmin();

  // Payment Pages path: if the payment carries a payment_page_crm_id in
  // notes (stamped there when we created the page via Razorpay's API), we
  // skip routing rules entirely and use the page's own configuration —
  // pipeline/stage/owner/tags/cohort come from the payment_pages row.
  const crmPageId =
    typeof payment.notes?.payment_page_crm_id === "string"
      ? (payment.notes.payment_page_crm_id as string)
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
  amountRupees: number | null;
  name: string;
}) {
  const { sb, page, payment, amountRupees, name } = args;

  const cityFromForm =
    typeof payment.notes?.city === "string"
      ? (payment.notes.city as string)
      : null;

  const intake = await intakeLead({
    name,
    phone: payment.contact ?? null,
    email: payment.email ?? null,
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
      ...(cityFromForm ? { city: cityFromForm } : {}),
      ...(payment.notes ?? {}),
    },
  });
  if (!intake.ok || !intake.leadId) {
    return Response.json({ ok: false, error: intake.error }, { status: 500 });
  }

  const leadId = intake.leadId;

  // Record the payment on the Converted Leads log. Cohort-tied → cohort_number
  // is the cohort's `number`; small workshop → payment page's label as a
  // synthetic cohort tag so it still shows up grouped in reports.
  let cohortNumber: string | null = null;
  if (page.cohort_id) {
    const { data: cohort } = await sb
      .from("cohorts")
      .select("number")
      .eq("id", page.cohort_id)
      .maybeSingle<Pick<CohortRow, "number">>();
    cohortNumber = cohort?.number ?? null;
  }

  if (amountRupees && amountRupees > 0) {
    await sb.from("lead_amounts").insert({
      lead_id: leadId,
      actor_id: null,
      amount: amountRupees,
      note: `Auto-recorded from ${page.internal_label}`,
      cohort_number: cohortNumber ?? page.internal_label,
    });
    await sb
      .from("leads")
      .update({ total_fee: amountRupees })
      .eq("id", leadId);

    await sb.from("lead_activities").insert({
      lead_id: leadId,
      actor_id: null,
      kind: "converted",
      payload: {
        amount: amountRupees,
        cohort_number: cohortNumber ?? page.internal_label,
        total_fee: amountRupees,
        source: "razorpay_payment_page",
        payment_page_id: page.id,
      },
    });
  }

  // Cohort-tied page → LMS onboarding runs on payment.captured, since the
  // page charges the full fee. Log-only on failure so a broken LMS doesn't
  // 500 back at Razorpay.
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
  };
}
