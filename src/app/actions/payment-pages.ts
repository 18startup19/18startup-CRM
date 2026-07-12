"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/rbac-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { slugifyUrl } from "@/lib/utils";
import type { PaymentPageRow } from "@/lib/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// Find a slug that doesn't collide with any existing payment_pages row.
// Starts with the requested slug, then appends -2, -3, ... until unique.
// Never blocks — worst case an oddly-branded page ends up with -2 suffix.
async function findAvailableSlug(
  sb: SupabaseClient,
  base: string,
  excludeId: string | null,
): Promise<string> {
  const safeBase = base || "page";
  let candidate = safeBase;
  let n = 1;
  while (n < 200) {
    let q = sb.from("payment_pages").select("id").eq("slug", candidate);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.limit(1);
    if (!data || data.length === 0) return candidate;
    n++;
    candidate = `${safeBase}-${n}`;
  }
  // Fallback: pick a truly random one so we never spin forever.
  return `${safeBase}-${Math.random().toString(36).slice(2, 8)}`;
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
  const program_name = String(fd.get("program_name") ?? "").trim() || null;
  const thank_you_url = String(fd.get("thank_you_url") ?? "").trim() || null;
  const thank_you_button_label =
    String(fd.get("thank_you_button_label") ?? "").trim() || null;
  const cohort_id = nullish(String(fd.get("cohort_id") ?? ""));
  const pipeline_id = nullish(String(fd.get("pipeline_id") ?? ""));
  const stage_id = nullish(String(fd.get("stage_id") ?? ""));
  const owner_id = nullish(String(fd.get("owner_id") ?? ""));
  const tags = parseTags(fd.get("tags"));

  if (!internal_label) return { ok: false, error: "Internal label required" };
  if (!title) return { ok: false, error: "Buyer-facing title required" };
  if (!amount_paise) return { ok: false, error: "Amount must be > 0" };

  // Auto-generate a URL slug from the internal label. If admin typed an
  // explicit slug in the form, use that as the base instead.
  const rawSlug = String(fd.get("slug") ?? "").trim();
  const slugBase = slugifyUrl(rawSlug || internal_label);
  const slug = await findAvailableSlug(sb, slugBase, null);

  const { data: inserted, error: insertError } = await sb
    .from("payment_pages")
    .insert({
      internal_label,
      slug,
      title,
      description,
      image_url,
      amount_paise,
      currency: "INR",
      mode,
      program_name,
      thank_you_url,
      thank_you_button_label,
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
  const program_name = String(fd.get("program_name") ?? "").trim() || null;
  const thank_you_url = String(fd.get("thank_you_url") ?? "").trim() || null;
  const thank_you_button_label =
    String(fd.get("thank_you_button_label") ?? "").trim() || null;
  const cohort_id = nullish(String(fd.get("cohort_id") ?? ""));
  const pipeline_id = nullish(String(fd.get("pipeline_id") ?? ""));
  const stage_id = nullish(String(fd.get("stage_id") ?? ""));
  const owner_id = nullish(String(fd.get("owner_id") ?? ""));
  const tags = parseTags(fd.get("tags"));

  if (!internal_label) return { ok: false, error: "Internal label required" };
  if (!title) return { ok: false, error: "Buyer-facing title required" };
  if (!amount_paise) return { ok: false, error: "Amount must be > 0" };

  // Slug: only regenerate if admin actually changed it in the form.
  // Renaming the internal_label alone must NOT change the URL, since
  // that would silently break Webflow buttons already pointing to it.
  const rawSlug = String(fd.get("slug") ?? "").trim();
  let slug: string | undefined;
  if (rawSlug) {
    const slugBase = slugifyUrl(rawSlug);
    slug = await findAvailableSlug(sb, slugBase, id);
  }

  const { error: upErr } = await sb
    .from("payment_pages")
    .update({
      internal_label,
      ...(slug ? { slug } : {}),
      title,
      description,
      image_url,
      amount_paise,
      program_name,
      thank_you_url,
      thank_you_button_label,
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
