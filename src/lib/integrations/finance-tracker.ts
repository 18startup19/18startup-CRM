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

  // Match the Finance Tracker schema. CRM totals are gross-of-GST (18%);
  // we split them into ex-GST unit_price + gst_rate so the Finance Tracker
  // recomputes the same total with a proper tax breakdown.
  const GST_RATE = 18;
  const grossTotal = Number(inv.total_amount);
  const unitPrice = Number((grossTotal / (1 + GST_RATE / 100)).toFixed(2));

  const payload: Record<string, unknown> = {
    invoice_number: inv.invoice_number,
    invoice_date: inv.invoice_date,
    payee_name: inv.customer_name,
    company_name: inv.company_name,
    bill_to_address: inv.company_address,
    bill_to_gst: inv.gst_number,
    status: "issued",
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

  try {
    // FINANCE_TRACKER_API_URL is the full endpoint (e.g. .../api/external/invoices)
    // — we don't append anything to it.
    const res = await fetch(url, {
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
