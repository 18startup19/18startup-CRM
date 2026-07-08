"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import {
  fetchInvoiceFromFinanceTracker,
  pushInvoiceToFinanceTracker,
  updateInvoiceOnFinanceTracker,
} from "@/lib/integrations/finance-tracker";
import type { InvoiceRow } from "@/lib/database.types";

export interface InvoiceResult {
  error?: string;
  ok?: boolean;
  invoiceId?: string;
}

type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

function pickNumber(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

// The CRM only records invoices for payments that have already come in, so
// every invoice we create is "paid". The field stays in the DB + FT payload
// so the Finance Tracker treats them the same as its own paid invoices.
const DEFAULT_STATUS: InvoiceStatus = "paid";

interface ParsedForm {
  customer_name: string;
  company_name: string;
  company_address: string;
  gst_number: string;
  pan_number: string | null;
  product_name: string;
  total_amount: number;
  invoice_date: string;
  status: InvoiceStatus;
}

function parseForm(form: FormData): { error?: string; data?: ParsedForm } {
  const customer_name = String(form.get("customer_name") ?? "").trim();
  const company_name = String(form.get("company_name") ?? "").trim();
  const company_address = String(form.get("company_address") ?? "").trim();
  const gst_number = String(form.get("gst_number") ?? "").trim().toUpperCase();
  const pan_raw = String(form.get("pan_number") ?? "").trim().toUpperCase();
  const pan_number = pan_raw || null;
  const product_name = String(form.get("product_name") ?? "").trim();
  const total_amount = pickNumber(form.get("total_amount"));
  const invoice_date = String(form.get("invoice_date") ?? "").trim();
  const status: InvoiceStatus = DEFAULT_STATUS;

  if (!customer_name) return { error: "Customer name is required." };
  if (!company_name) return { error: "Company name is required." };
  if (!company_address) return { error: "Company address is required." };
  if (!gst_number) return { error: "GST number is required." };
  if (!product_name) return { error: "Product name is required." };
  if (!invoice_date) return { error: "Program start date is required." };
  if (total_amount <= 0) return { error: "Total amount must be positive." };

  return {
    data: {
      customer_name,
      company_name,
      company_address,
      gst_number,
      pan_number,
      product_name,
      total_amount,
      invoice_date,
      status,
    },
  };
}

export async function createInvoiceAction(
  _prev: InvoiceResult,
  form: FormData,
): Promise<InvoiceResult> {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const parsed = parseForm(form);
  if (parsed.error || !parsed.data) return { error: parsed.error };
  const data = parsed.data;

  // Finance Tracker owns the invoice number — call it first, capture the
  // INV/B2B/#### number it returns, and only then persist. If the tracker
  // is down we still save the invoice with a placeholder number so the
  // work isn't lost; the retry button re-syncs and updates the number.
  const push = await pushInvoiceToFinanceTracker(data);

  const invoice_number = push.ok
    ? push.invoiceNumber ?? `INV-TMP-${Date.now()}`
    : `INV-TMP-${Date.now()}`;

  const { data: inserted, error: insErr } = await sb
    .from("invoices")
    .insert({
      invoice_number,
      customer_name: data.customer_name,
      company_name: data.company_name,
      company_address: data.company_address,
      gst_number: data.gst_number,
      pan_number: data.pan_number,
      product_name: data.product_name,
      total_amount: data.total_amount,
      invoice_date: data.invoice_date,
      status: data.status,
      created_by: session.userId,
      finance_tracker_id: push.trackerId ?? null,
      sync_status: push.ok ? "synced" : "failed",
      sync_error: push.ok ? null : push.error ?? "Unknown sync error",
    })
    .select("id")
    .single();
  if (insErr) return { error: insErr.message };

  revalidatePath("/invoices");
  return { ok: true, invoiceId: (inserted as { id: string }).id };
}

export async function updateInvoiceAction(
  id: string,
  _prev: InvoiceResult,
  form: FormData,
): Promise<InvoiceResult> {
  await requireSession();
  const sb = supabaseAdmin();

  const parsed = parseForm(form);
  if (parsed.error || !parsed.data) return { error: parsed.error };
  const data = parsed.data;

  const { data: existing } = await sb
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (!existing) return { error: "Invoice not found." };

  // Update FT first. If we don't have a tracker id yet (previous sync
  // failed), fall back to a POST — the tracker will assign a number.
  let sync: {
    ok: boolean;
    trackerId?: string;
    invoiceNumber?: string;
    error?: string;
  };
  if (existing.finance_tracker_id) {
    sync = await updateInvoiceOnFinanceTracker(existing.finance_tracker_id, data);
  } else {
    sync = await pushInvoiceToFinanceTracker(data);
  }

  const patch: Record<string, unknown> = {
    customer_name: data.customer_name,
    company_name: data.company_name,
    company_address: data.company_address,
    gst_number: data.gst_number,
    pan_number: data.pan_number,
    product_name: data.product_name,
    total_amount: data.total_amount,
    invoice_date: data.invoice_date,
    status: data.status,
    updated_at: new Date().toISOString(),
    sync_status: sync.ok ? "synced" : "failed",
    sync_error: sync.ok ? null : sync.error ?? "Unknown sync error",
  };
  if (sync.trackerId) patch.finance_tracker_id = sync.trackerId;
  if (sync.invoiceNumber) patch.invoice_number = sync.invoiceNumber;

  const { error: updErr } = await sb.from("invoices").update(patch).eq("id", id);
  if (updErr) return { error: updErr.message };

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}/edit`);
  return { ok: true, invoiceId: id };
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

  const payload = {
    customer_name: data.customer_name,
    company_name: data.company_name,
    company_address: data.company_address,
    gst_number: data.gst_number,
    pan_number: data.pan_number,
    product_name: data.product_name,
    total_amount: data.total_amount,
    invoice_date: data.invoice_date,
    status: data.status,
  };

  const res = data.finance_tracker_id
    ? await updateInvoiceOnFinanceTracker(data.finance_tracker_id, payload)
    : await pushInvoiceToFinanceTracker(payload);

  // If we already have a tracker id but no real invoice number (legacy
  // "INV-TMP-*" rows created before the response parser dug deep enough),
  // pull the invoice from FT to grab its number.
  let invoiceNumberFromFetch: string | undefined;
  const looksTemp =
    !data.invoice_number || data.invoice_number.startsWith("INV-TMP-");
  const trackerIdNow = res.trackerId ?? data.finance_tracker_id;
  if (res.ok && looksTemp && !res.invoiceNumber && trackerIdNow) {
    const fetched = await fetchInvoiceFromFinanceTracker(trackerIdNow);
    if (fetched.ok && fetched.invoiceNumber) {
      invoiceNumberFromFetch = fetched.invoiceNumber;
    }
  }

  const patch: Record<string, unknown> = {
    sync_status: res.ok ? "synced" : "failed",
    sync_error: res.ok ? null : res.error ?? "Unknown sync error",
    updated_at: new Date().toISOString(),
  };
  if (res.trackerId) patch.finance_tracker_id = res.trackerId;
  const finalNumber = res.invoiceNumber ?? invoiceNumberFromFetch;
  if (finalNumber) patch.invoice_number = finalNumber;

  await sb.from("invoices").update(patch).eq("id", id);
  revalidatePath("/invoices");
  return res.ok ? { ok: true } : { error: res.error };
}
