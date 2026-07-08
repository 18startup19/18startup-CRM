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

// Pull an id + invoice_number out of a few common response shapes so we
// don't need to know the tracker's exact envelope.
function extractIds(body: unknown): { trackerId?: string; invoiceNumber?: string } {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const inner =
    (typeof b.data === "object" && b.data !== null
      ? (b.data as Record<string, unknown>)
      : b) ?? b;
  const trackerId =
    (inner.id as string | undefined) ??
    (inner.invoice_id as string | undefined) ??
    (inner.uuid as string | undefined);
  const invoiceNumber =
    (inner.invoice_number as string | undefined) ??
    (inner.number as string | undefined);
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
