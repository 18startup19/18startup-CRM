"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/rbac-server";
import { slugifyKey } from "@/lib/utils";
import type { CustomFieldType } from "@/lib/database.types";

const VALID: CustomFieldType[] = [
  "text",
  "longtext",
  "number",
  "date",
  "dropdown",
  "checkbox",
  "phone",
  "email",
];

export interface FieldResult {
  error?: string;
  ok?: boolean;
}

export async function createFieldAction(
  _prev: FieldResult,
  form: FormData,
): Promise<FieldResult> {
  await requireAdmin();

  const label = String(form.get("label") ?? "").trim();
  const type = String(form.get("type") ?? "") as CustomFieldType;
  const isRequired = form.get("is_required") === "on";
  const optionsRaw = String(form.get("options") ?? "");

  if (!label) return { error: "Label is required." };
  if (!VALID.includes(type)) return { error: "Invalid field type." };

  const options =
    type === "dropdown"
      ? optionsRaw
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  if (type === "dropdown" && options.length === 0) {
    return { error: "Dropdown fields need at least one option (one per line)." };
  }

  const sb = supabaseAdmin();
  const key = slugifyKey(label);
  const { count } = await sb
    .from("custom_fields")
    .select("id", { count: "exact", head: true })
    .eq("is_archived", false);

  const { error } = await sb.from("custom_fields").insert({
    key,
    label,
    type,
    options,
    is_required: isRequired,
    position: (count ?? 0) + 1,
  });

  if (error) {
    if (error.code === "23505") return { error: "A field with this key already exists." };
    return { error: error.message };
  }

  revalidatePath("/admin/fields");
  revalidatePath("/leads");
  return { ok: true };
}

export async function archiveFieldAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("custom_fields").update({ is_archived: true }).eq("id", id);
  revalidatePath("/admin/fields");
  revalidatePath("/leads");
}

export async function restoreFieldAction(id: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  await sb.from("custom_fields").update({ is_archived: false }).eq("id", id);
  revalidatePath("/admin/fields");
  revalidatePath("/leads");
}

export async function updateFieldAction(id: string, form: FormData): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  const patch: Record<string, unknown> = {};
  const label = String(form.get("label") ?? "").trim();
  const isRequired = form.get("is_required") === "on";
  const optionsRaw = String(form.get("options") ?? "");
  if (label) patch.label = label;
  patch.is_required = isRequired;
  if (optionsRaw.trim()) {
    patch.options = optionsRaw
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  await sb.from("custom_fields").update(patch).eq("id", id);
  revalidatePath("/admin/fields");
  revalidatePath("/leads");
}
