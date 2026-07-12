"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/rbac-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { PaymentPageRow } from "@/lib/database.types";

export type PaymentPageActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Read `amount` from FormData (in RUPEES per the UI) and convert to paise
// with proper rounding. Rejects zero/negative/NaN.
function parseAmountPaise(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const rupees = Number(s);
  if (!Number.isFinite(rupees) || rupees <= 0) return null;
  return Math.round(rupees * 100);
}

function nullish<T>(v: T | null | undefined | ""): T | null {
  return v == null || v === "" ? null : (v as T);
}

function parseTags(raw: unknown): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function createPaymentPageAction(
  _prev: PaymentPageActionResult | undefined,
  fd: FormData,
): Promise<PaymentPageActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();

  const internal_label = String(fd.get("internal_label") ?? "").trim();
  const title = String(fd.get("title") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  const image_url = String(fd.get("image_url") ?? "").trim() || null;
  const amount_paise = parseAmountPaise(fd.get("amount_rupees"));
  const modeRaw = String(fd.get("mode") ?? "test");
  const mode: "test" | "live" = modeRaw === "live" ? "live" : "test";
  const cohort_id = nullish(String(fd.get("cohort_id") ?? ""));
  const pipeline_id = nullish(String(fd.get("pipeline_id") ?? ""));
  const stage_id = nullish(String(fd.get("stage_id") ?? ""));
  const owner_id = nullish(String(fd.get("owner_id") ?? ""));
  const tags = parseTags(fd.get("tags"));

  if (!internal_label) return { ok: false, error: "Internal label required" };
  if (!title) return { ok: false, error: "Buyer-facing title required" };
  if (!amount_paise) return { ok: false, error: "Amount must be > 0" };

  const { data: inserted, error: insertError } = await sb
    .from("payment_pages")
    .insert({
      internal_label,
      title,
      description,
      image_url,
      amount_paise,
      currency: "INR",
      mode,
      cohort_id,
      pipeline_id,
      stage_id,
      owner_id,
      tags,
      is_active: true,
    })
    .select("*")
    .single<PaymentPageRow>();
  if (insertError || !inserted) {
    return { ok: false, error: insertError?.message ?? "Insert failed" };
  }

  revalidatePath("/admin/payment-pages");
  return { ok: true, id: inserted.id };
}

export async function updatePaymentPageAction(
  id: string,
  _prev: PaymentPageActionResult | undefined,
  fd: FormData,
): Promise<PaymentPageActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();

  const internal_label = String(fd.get("internal_label") ?? "").trim();
  const title = String(fd.get("title") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim() || null;
  const image_url = String(fd.get("image_url") ?? "").trim() || null;
  const amount_paise = parseAmountPaise(fd.get("amount_rupees"));
  const cohort_id = nullish(String(fd.get("cohort_id") ?? ""));
  const pipeline_id = nullish(String(fd.get("pipeline_id") ?? ""));
  const stage_id = nullish(String(fd.get("stage_id") ?? ""));
  const owner_id = nullish(String(fd.get("owner_id") ?? ""));
  const tags = parseTags(fd.get("tags"));

  if (!internal_label) return { ok: false, error: "Internal label required" };
  if (!title) return { ok: false, error: "Buyer-facing title required" };
  if (!amount_paise) return { ok: false, error: "Amount must be > 0" };

  const { error: upErr } = await sb
    .from("payment_pages")
    .update({
      internal_label,
      title,
      description,
      image_url,
      amount_paise,
      cohort_id,
      pipeline_id,
      stage_id,
      owner_id,
      tags,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/admin/payment-pages");
  revalidatePath(`/pay/${id}`);
  return { ok: true, id };
}

export async function togglePaymentPageActiveAction(
  id: string,
  active: boolean,
): Promise<PaymentPageActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();

  const { error } = await sb
    .from("payment_pages")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/payment-pages");
  revalidatePath(`/pay/${id}`);
  return { ok: true, id };
}
