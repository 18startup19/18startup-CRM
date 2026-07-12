"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/rbac-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createPaymentPage,
  deactivatePaymentPage,
  updatePaymentPage,
} from "@/lib/razorpay-pages";
import type { PaymentPageRow } from "@/lib/database.types";

export type PaymentPageActionResult =
  | { ok: true; id: string; shortUrl?: string }
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

  // Insert first — we need the row's UUID to stamp into Razorpay's notes so
  // the webhook can map back. If the Razorpay call fails, we roll the row
  // back so the admin isn't left with a ghost that has no hosted page.
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

  try {
    const { razorpayPageId, shortUrl } = await createPaymentPage(
      {
        title,
        description,
        imageUrl: image_url,
        amountPaise: amount_paise,
        currency: "INR",
        crmPageId: inserted.id,
      },
      mode,
    );
    await sb
      .from("payment_pages")
      .update({
        razorpay_page_id: razorpayPageId,
        razorpay_short_url: shortUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
    revalidatePath("/admin/payment-pages");
    return { ok: true, id: inserted.id, shortUrl };
  } catch (err) {
    // Roll back so admins can retry cleanly.
    await sb.from("payment_pages").delete().eq("id", inserted.id);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Razorpay call failed",
    };
  }
}

export async function updatePaymentPageAction(
  id: string,
  _prev: PaymentPageActionResult | undefined,
  fd: FormData,
): Promise<PaymentPageActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from("payment_pages")
    .select("*")
    .eq("id", id)
    .maybeSingle<PaymentPageRow>();
  if (!existing) return { ok: false, error: "Page not found" };

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

  // Update the DB first, then mirror to Razorpay. If Razorpay fails, restore
  // the previous values so DB and hosted page don't drift.
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

  if (existing.razorpay_page_id) {
    try {
      await updatePaymentPage(
        existing.razorpay_page_id,
        {
          title,
          description,
          imageUrl: image_url,
          amountPaise: amount_paise,
        },
        existing.mode,
      );
    } catch (err) {
      // Restore previous values.
      await sb
        .from("payment_pages")
        .update({
          internal_label: existing.internal_label,
          title: existing.title,
          description: existing.description,
          image_url: existing.image_url,
          amount_paise: existing.amount_paise,
          cohort_id: existing.cohort_id,
          pipeline_id: existing.pipeline_id,
          stage_id: existing.stage_id,
          owner_id: existing.owner_id,
          tags: existing.tags,
        })
        .eq("id", id);
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Razorpay sync failed",
      };
    }
  }

  revalidatePath("/admin/payment-pages");
  return { ok: true, id };
}

export async function togglePaymentPageActiveAction(
  id: string,
  active: boolean,
): Promise<PaymentPageActionResult> {
  await requireAdmin();
  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from("payment_pages")
    .select("*")
    .eq("id", id)
    .maybeSingle<PaymentPageRow>();
  if (!existing) return { ok: false, error: "Page not found" };

  if (!active && existing.razorpay_page_id) {
    try {
      await deactivatePaymentPage(existing.razorpay_page_id, existing.mode);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Razorpay deactivate failed",
      };
    }
  }

  await sb
    .from("payment_pages")
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/admin/payment-pages");
  return { ok: true, id };
}
