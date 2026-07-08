"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { syncInvoiceToFinanceTracker } from "@/lib/integrations/finance-tracker";
import type { InvoiceRow } from "@/lib/database.types";

export interface InvoiceResult {
  error?: string;
  ok?: boolean;
  invoiceId?: string;
}

function pickNumber(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function createInvoiceAction(
  _prev: InvoiceResult,
  form: FormData,
): Promise<InvoiceResult> {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const customer_name = String(form.get("customer_name") ?? "").trim();
  const company_name = String(form.get("company_name") ?? "").trim();
  const company_address = String(form.get("company_address") ?? "").trim();
  const gst_number = String(form.get("gst_number") ?? "").trim();
  const pan_number = String(form.get("pan_number") ?? "").trim() || null;
  const product_name = String(form.get("product_name") ?? "").trim();
  const total_amount = pickNumber(form.get("total_amount"));
  const invoice_date = String(form.get("invoice_date") ?? "").trim();

  if (!customer_name) return { error: "Customer name is required." };
  if (!company_name) return { error: "Company name is required." };
  if (!company_address) return { error: "Company address is required." };
  if (!gst_number) return { error: "GST number is required." };
  if (!product_name) return { error: "Product name is required." };
  if (!invoice_date) return { error: "Program start date is required." };
  if (total_amount <= 0) return { error: "Total amount must be positive." };

  // DB-side next_invoice_number() gives us INV-YYYY-#### atomically.
  const { data: nextNumRow, error: numErr } = await sb.rpc("next_invoice_number");
  if (numErr) return { error: `Couldn't generate invoice number: ${numErr.message}` };
  const invoice_number = (nextNumRow as unknown as string) ?? "";
  if (!invoice_number) return { error: "Failed to generate invoice number." };

  const { data: inserted, error: insErr } = await sb
    .from("invoices")
    .insert({
      invoice_number,
      customer_name,
      company_name,
      company_address,
      gst_number,
      pan_number,
      product_name,
      total_amount,
      invoice_date,
      created_by: session.userId,
      sync_status: "pending",
    })
    .select("*")
    .single();
  if (insErr) return { error: insErr.message };

  const row = inserted as InvoiceRow;

  // Fire the Finance Tracker sync now — but don't fail the whole action if it
  // errors, so the invoice still lands in the CRM. The list view surfaces the
  // sync state so the user can retry.
  const res = await syncInvoiceToFinanceTracker(row);
  await sb
    .from("invoices")
    .update({
      sync_status: res.ok ? "synced" : "failed",
      finance_tracker_id: res.trackerId ?? null,
      sync_error: res.ok ? null : res.error ?? "Unknown sync error",
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  revalidatePath("/invoices");
  return { ok: true, invoiceId: row.id };
}

export async function resyncInvoiceAction(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  await requireSession();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (!data) return { error: "Invoice not found." };
  const res = await syncInvoiceToFinanceTracker(data);
  await sb
    .from("invoices")
    .update({
      sync_status: res.ok ? "synced" : "failed",
      finance_tracker_id: res.trackerId ?? data.finance_tracker_id,
      sync_error: res.ok ? null : res.error ?? "Unknown sync error",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/invoices");
  return res.ok ? { ok: true } : { error: res.error };
}
