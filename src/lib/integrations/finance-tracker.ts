import type { InvoiceRow } from "../database.types";

// Talk to the Finance Tracker's invoice endpoint. The tracker generates
// invoice numbers (INV/B2B/#### format), and returns a signed pdf_url that
// we store and proxy to the browser as a download.
//
// FINANCE_TRACKER_API_URL is the FULL endpoint (…/api/external/invoices) —
// updates PATCH to `${URL}/${finance_tracker_id}`.

export interface FinanceTrackerResult {
  ok: boolean;
  trackerId?: string;
  invoiceNumber?: string;
  pdfUrl?: string;
  error?: string;
}

type CreateInput = Omit<
  InvoiceRow,
  | "id"
  | "invoice_number"
  | "created_by"
  | "finance_tracker_id"
  | "pdf_url"
  | "sync_status"
  | "sync_error"
  | "created_at"
  | "updated_at"
> & { created_by_name?: string | null };

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
  if (inv.created_by_name) payload.created_by = inv.created_by_name;
  return payload;
}

// Recursively walk the response and pull the FT-side id + invoice_number +
// pdf_url. Trackers vary on envelope shape and integer-vs-string ids, so we
// accept both string and numeric values for the id.
function extractIds(body: unknown): {
  trackerId?: string;
  invoiceNumber?: string;
  pdfUrl?: string;
} {
  let trackerId: string | undefined;
  let invoiceNumber: string | undefined;
  let pdfUrl: string | undefined;

  const walk = (node: unknown, depth = 0): void => {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
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
        if (
          !pdfUrl &&
          typeof v === "string" &&
          (k === "pdf_url" || k === "pdfUrl")
        ) {
          pdfUrl = v;
        }
      } else if (typeof v === "object") {
        walk(v, depth + 1);
      }
      if (trackerId && invoiceNumber && pdfUrl) return;
    }
  };
  walk(body);
  return { trackerId, invoiceNumber, pdfUrl };
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
    const { trackerId, invoiceNumber, pdfUrl } = extractIds(body);
    return { ok: true, trackerId, invoiceNumber, pdfUrl };
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
    const { invoiceNumber, pdfUrl } = extractIds(body);
    return { ok: true, trackerId, invoiceNumber, pdfUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteInvoiceOnFinanceTracker(
  trackerId: string,
): Promise<FinanceTrackerResult> {
  const env = await ftEnv();
  if ("error" in env) return { ok: false, error: env.error };
  try {
    const res = await fetch(`${env.url.replace(/\/$/, "")}/${trackerId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.key}` },
    });
    // 404 means it's already gone on FT's side — treat as success so the
    // CRM row can still be cleaned up.
    if (res.status === 404) return { ok: true };
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
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
    const { invoiceNumber, pdfUrl } = extractIds(body);
    return { ok: true, trackerId, invoiceNumber, pdfUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
