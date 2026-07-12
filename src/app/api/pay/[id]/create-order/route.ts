import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createOrder } from "@/lib/razorpay-pages";
import type { PaymentPageRow } from "@/lib/database.types";

// Public endpoint. Called by the buyer's browser when they click "Pay ₹X" on
// /pay/[id]. Creates a Razorpay Order with the CRM page ID + buyer details
// stamped on notes, so the webhook can map back cleanly on payment.captured.
//
// No auth — this is a public checkout flow. We validate the page exists and
// is active before spending a Razorpay API call.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: {
    name?: string;
    phone?: string;
    email?: string;
    city?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const phone = (body.phone ?? "").trim();
  const email = (body.email ?? "").trim();
  const city = (body.city ?? "").trim();
  if (!name || !phone || !email || !city) {
    return Response.json(
      { ok: false, error: "All buyer fields are required." },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();
  const { data: page } = await sb
    .from("payment_pages")
    .select("*")
    .eq("id", id)
    .maybeSingle<PaymentPageRow>();
  if (!page) {
    return Response.json(
      { ok: false, error: "Payment page not found." },
      { status: 404 },
    );
  }
  if (!page.is_active) {
    return Response.json(
      { ok: false, error: "This payment page is no longer accepting payments." },
      { status: 400 },
    );
  }

  try {
    const order = await createOrder(
      {
        amountPaise: page.amount_paise,
        currency: page.currency,
        // The webhook reads these off `payment.notes` to (a) map the payment
        // back to a page, and (b) pre-fill the resulting lead. `name` here
        // is critical because Razorpay's payment.email split fallback is
        // ugly for humans.
        notes: {
          payment_page_crm_id: page.id,
          payment_page_label: page.internal_label,
          name,
          phone,
          email,
          city,
        },
      },
      page.mode,
    );

    return Response.json({
      ok: true,
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
