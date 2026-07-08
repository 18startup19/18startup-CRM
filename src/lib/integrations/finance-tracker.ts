import type { InvoiceRow } from "../database.types";

// Push a CRM invoice to the Finance Tracker app. The tracker is another
// service; we hit its /api/invoices endpoint with a bearer token. Both env
// vars must be set for the sync to actually fire; without them we soft-skip
// so dev environments still work.
//
// Adjust the payload shape here if the Finance Tracker expects different
// field names — this is the ONLY spot the mapping lives.

export interface FinanceTrackerResult {
  ok: boolean;
  trackerId?: string;
  error?: string;
}

export async function syncInvoiceToFinanceTracker(
  inv: InvoiceRow,
): Promise<FinanceTrackerResult> {
  const url = process.env.FINANCE_TRACKER_API_URL;
  const key = process.env.FINANCE_TRACKER_API_KEY;
  if (!url || !key) {
    return {
      ok: false,
      error: "Finance Tracker env not configured (FINANCE_TRACKER_API_URL/API_KEY).",
    };
  }

  const payload = {
    invoice_number: inv.invoice_number,
    customer_name: inv.customer_name,
    company_name: inv.company_name,
    company_address: inv.company_address,
    gst_number: inv.gst_number,
    pan_number: inv.pan_number,
    product_name: inv.product_name,
    total_amount: Number(inv.total_amount),
    invoice_date: inv.invoice_date,
    source: "crm",
    source_id: inv.id,
  };

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    const body = (await res.json().catch(() => null)) as
      | { id?: string; invoice_id?: string }
      | null;
    return { ok: true, trackerId: body?.id ?? body?.invoice_id ?? undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
