import type { InvoiceRow } from "../database.types";

// Talk to the Finance Tracker's invoice endpoint. The tracker generates
// invoice numbers (INV/B2B/#### format), so the CRM stops assigning them and
// stores whatever the tracker returns.
//
// FINANCE_TRACKER_API_URL is the FULL endpoint (…/api/external/invoices) —
// updates PATCH to `${URL}/${finance_tracker_id}`.

export interface FinanceTrackerResult {
  ok: boolean;
  trackerId?: string;
  invoiceNumber?: string;
  error?: string;
}

type CreateInput = Omit<
  InvoiceRow,
  | "id"
  | "invoice_number"
  | "created_by"
  | "finance_tracker_id"
  | "sync_status"
  | "sync_error"
  | "created_at"
  | "updated_at"
>;

function buildPayload(inv: CreateInput): Record<string, unknown> {
  // CRM total_amount is gross-of-GST (18%); split into ex-GST unit_price so
  // the tracker recomputes the same customer-facing total with a proper
  // subtotal + tax breakdown.
  const GST_RATE = 18;
  const grossTotal = Number(inv.total_amount);
  const unitPrice = Number((grossTotal / (1 + GST_RATE / 100)).toFixed(2));

  const payload: Record<string, unknown> = {
    invoice_date: inv.invoice_date,
    payee_name: inv.customer_name,
    company_name: inv.company_name,
    bill_to_address: inv.company_address,
    bill_to_gst: inv.gst_number,
    status: inv.status,
    line_items: [
      {
        description: inv.product_name,
        quantity: 1,
        unit_price: unitPrice,
        gst_rate: GST_RATE,
      },
    ],
  };
  if (inv.pan_number) payload.bill_to_pan = inv.pan_number;
  return payload;
}

// Recursively walk the response and pull the first id + invoice_number we
// find, regardless of the envelope shape (`body.id`, `body.data.invoice.id`,
// `body.invoice.number`, etc). Cheap because the payloads are small.
function extractIds(body: unknown): { trackerId?: string; invoiceNumber?: string } {
  let trackerId: string | undefined;
  let invoiceNumber: string | undefined;

  const walk = (node: unknown, depth = 0): void => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      // Trackers sometimes return integer PKs — accept both strings and
      // numbers, so long as the field name matches.
      if (typeof v === "string" || typeof v === "number") {
        if (
          !trackerId &&
          (k === "id" ||
            k === "invoice_id" ||
            k === "uuid" ||
            k === "_id" ||
            k === "pk")
        ) {
          trackerId = String(v);
        }
        if (
          !invoiceNumber &&
          typeof v === "string" &&
          (k === "invoice_number" || k === "number" || k === "invoiceNumber")
        ) {
          invoiceNumber = v;
        }
      } else if (typeof v === "object") {
        walk(v, depth + 1);
      }
      if (trackerId && invoiceNumber) return;
    }
  };
  walk(body);
  return { trackerId, invoiceNumber };
}

async function ftEnv(): Promise<{ url: string; key: string } | { error: string }> {
  const url = process.env.FINANCE_TRACKER_API_URL;
  const key = process.env.FINANCE_TRACKER_API_KEY;
  if (!url || !key) {
    return {
      error: "Finance Tracker env not configured (FINANCE_TRACKER_API_URL/API_KEY).",
    };
  }
  return { url, key };
}

export async function pushInvoiceToFinanceTracker(
  inv: CreateInput,
): Promise<FinanceTrackerResult> {
  const env = await ftEnv();
  if ("error" in env) return { ok: false, error: env.error };

  try {
    const res = await fetch(env.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPayload(inv)),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const body = await res.json().catch(() => null);
    const { trackerId, invoiceNumber } = extractIds(body);
    return { ok: true, trackerId, invoiceNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchInvoiceFromFinanceTracker(
  trackerId: string,
): Promise<FinanceTrackerResult> {
  const env = await ftEnv();
  if ("error" in env) return { ok: false, error: env.error };
  try {
    const res = await fetch(`${env.url.replace(/\/$/, "")}/${trackerId}`, {
      headers: { Authorization: `Bearer ${env.key}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const body = await res.json().catch(() => null);
    const { invoiceNumber } = extractIds(body);
    return { ok: true, trackerId, invoiceNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateInvoiceOnFinanceTracker(
  trackerId: string,
  inv: CreateInput,
): Promise<FinanceTrackerResult> {
  const env = await ftEnv();
  if ("error" in env) return { ok: false, error: env.error };

  try {
    const res = await fetch(`${env.url.replace(/\/$/, "")}/${trackerId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${env.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPayload(inv)),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const body = await res.json().catch(() => null);
    const { invoiceNumber } = extractIds(body);
    return { ok: true, trackerId, invoiceNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
