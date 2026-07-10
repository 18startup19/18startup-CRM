import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { intakeLead } from "@/lib/intake";

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
