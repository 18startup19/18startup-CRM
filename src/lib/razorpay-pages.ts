// Razorpay Payment Pages API adapter.
//
// Docs: https://razorpay.com/docs/payments/payment-pages/create-payment-pages/
// via-apis/
//
// A Payment Page = a hosted page at pay.razorpay.com/<slug> that any buyer
// can visit and pay through. Reusable across many buyers. We keep our own
// row in `payment_pages` as the source of truth; this adapter mirrors edits
// out to Razorpay so the hosted page stays in sync.
//
// Test vs live keys are picked per-call so admins can keep test pages
// around forever without touching live traffic.

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

const BASE = "https://api.razorpay.com/v1/payment_pages";

export interface CreatePaymentPageInput {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  amountPaise: number;
  currency: string;
  // Stamped on every payment made via this page so the webhook can look up
  // which CRM row it came from.
  crmPageId: string;
}

export interface CreatePaymentPageResult {
  razorpayPageId: string;
  shortUrl: string;
}

// The exact request body shape mirrors Razorpay's Payment Pages create API.
// If Razorpay tweaks their API, adjust here — the rest of the app calls this
// function and doesn't care about the wire format.
function buildCreateBody(input: CreatePaymentPageInput) {
  return {
    title: input.title,
    description: input.description ?? undefined,
    image_url: input.imageUrl ?? undefined,
    amount: input.amountPaise,
    currency: input.currency,
    // Fixed amount (buyer can't change it). We collect the four buyer fields
    // — name/email/phone/city — via Razorpay's built-in "customer details"
    // block; "city" ships as a custom field on the page.
    view_options: {
      allow_multiple_units: false,
    },
    // Custom "city" field on the buyer form. Name/email/phone are collected
    // automatically by Razorpay's checkout.
    settings: {
      udf: [
        { name: "city", title: "City", type: "string", required: true },
      ],
    },
    notes: {
      // Critical: how the CRM webhook maps an incoming payment back to a page.
      payment_page_crm_id: input.crmPageId,
    },
  };
}

export async function createPaymentPage(
  input: CreatePaymentPageInput,
  mode: "test" | "live",
): Promise<CreatePaymentPageResult> {
  const creds = razorpayKeysForMode(mode);
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildCreateBody(input)),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Razorpay create page failed (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as { id?: string; short_url?: string };
  if (!json.id || !json.short_url) {
    throw new Error(`Razorpay returned unexpected payload: ${text}`);
  }
  return { razorpayPageId: json.id, shortUrl: json.short_url };
}

export interface UpdatePaymentPageInput {
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  amountPaise?: number;
}

export async function updatePaymentPage(
  razorpayPageId: string,
  patch: UpdatePaymentPageInput,
  mode: "test" | "live",
): Promise<void> {
  const creds = razorpayKeysForMode(mode);
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.description !== undefined) body.description = patch.description ?? "";
  if (patch.imageUrl !== undefined) body.image_url = patch.imageUrl ?? "";
  if (patch.amountPaise !== undefined) body.amount = patch.amountPaise;
  const res = await fetch(`${BASE}/${razorpayPageId}`, {
    method: "PATCH",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay update page failed (${res.status}): ${text}`);
  }
}

export async function deactivatePaymentPage(
  razorpayPageId: string,
  mode: "test" | "live",
): Promise<void> {
  const creds = razorpayKeysForMode(mode);
  const res = await fetch(`${BASE}/${razorpayPageId}/deactivate`, {
    method: "PATCH",
    headers: {
      Authorization: authHeader(creds),
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Razorpay deactivate failed (${res.status}): ${text}`);
  }
}
