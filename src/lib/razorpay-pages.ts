// Razorpay Orders API — used at the moment a buyer clicks "Pay" on a
// CRM-hosted payment page. We ask Razorpay to create an order for the
// amount, stamp the CRM payment_page_id + buyer details on the order's
// `notes`, and hand the resulting order_id back to Razorpay Checkout.js
// on the browser. When the buyer completes payment, Razorpay's webhook
// fires with those notes attached — that's how the CRM knows which page
// a payment came from.
//
// Note: we deliberately do NOT use Razorpay's Payment Pages product,
// which is gated behind account activation. The Orders API is universal.

interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
}

export function razorpayKeysForMode(mode: "test" | "live"): RazorpayCredentials {
  const keyId =
    mode === "live"
      ? process.env.RAZORPAY_KEY_ID
      : process.env.RAZORPAY_TEST_KEY_ID;
  const keySecret =
    mode === "live"
      ? process.env.RAZORPAY_KEY_SECRET
      : process.env.RAZORPAY_TEST_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error(
      `Razorpay ${mode} keys not configured (RAZORPAY_${mode === "live" ? "" : "TEST_"}KEY_ID / _SECRET). Add them in Vercel and redeploy.`,
    );
  }
  return { keyId, keySecret };
}

function authHeader({ keyId, keySecret }: RazorpayCredentials): string {
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

export interface CreateOrderInput {
  amountPaise: number;
  currency: string;
  // Everything we want stamped on the resulting payment for the webhook to
  // pick up. Must include payment_page_crm_id + the buyer form fields.
  notes: Record<string, string>;
}

export interface CreateOrderResult {
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
}

export async function createOrder(
  input: CreateOrderInput,
  mode: "test" | "live",
): Promise<CreateOrderResult> {
  const creds = razorpayKeysForMode(mode);
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: input.currency,
      notes: input.notes,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Razorpay create order failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as { id?: string; amount?: number; currency?: string };
  if (!json.id) {
    throw new Error(`Razorpay returned unexpected payload: ${text}`);
  }
  return {
    orderId: json.id,
    amountPaise: json.amount ?? input.amountPaise,
    currency: json.currency ?? input.currency,
    keyId: creds.keyId,
  };
}
