"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_MEMBER_PERMISSIONS, type Permission, PERMISSIONS } from "@/lib/rbac";
import { requireAdmin } from "@/lib/rbac-server";

export interface UserFormResult {
  error?: string;
  ok?: boolean;
}

export async function createUserAction(
  _prev: UserFormResult,
  form: FormData,
): Promise<UserFormResult> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role") ?? "member") as "admin" | "member";

  if (!name || !email || password.length < 8) {
    return { error: "Name, email, and 8+ char password are required." };
  }

  const permissions: Record<string, boolean> = {};
  if (role === "member") {
    for (const p of DEFAULT_MEMBER_PERMISSIONS) permissions[p] = true;
  }

  const sb = supabaseAdmin();
  const hash = await bcrypt.hash(password, 10);
  const { error } = await sb.from("users").insert({
    name,
    email,
    password_hash: hash,
    role,
    permissions,
  });

  if (error) {
    if (error.code === "23505") return { error: "A user with this email already exists." };
    return { error: error.message };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateUserAction(userId: string, form: FormData): Promise<void> {
  await requireAdmin();
  const name = String(form.get("name") ?? "").trim();
  const role = String(form.get("role") ?? "member") as "admin" | "member";
  const isActive = form.get("is_active") === "on";

  const permissions: Record<string, boolean> = {};
  for (const p of PERMISSIONS) {
    if (form.get(`perm_${p}`) === "on") permissions[p as Permission] = true;
  }

  const pipelineIds: string[] = [];
  for (const entry of form.getAll("pipeline_ids")) {
    const id = String(entry).trim();
    if (id) pipelineIds.push(id);
  }

  const sb = supabaseAdmin();
  await sb
    .from("users")
    .update({
      name,
      role,
      is_active: isActive,
      permissions,
      pipeline_ids: pipelineIds,
    })
    .eq("id", userId);

  revalidatePath("/admin/users");
}

export async function deleteUserAction(userId: string): Promise<void> {
  await requireAdmin();
  const sb = supabaseAdmin();
  // Soft delete by deactivating; keeps history intact.
  await sb.from("users").update({ is_active: false }).eq("id", userId);
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(userId: string, form: FormData): Promise<void> {
  await requireAdmin();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return;
  const hash = await bcrypt.hash(password, 10);
  const sb = supabaseAdmin();
  await sb.from("users").update({ password_hash: hash }).eq("id", userId);
  revalidatePath("/admin/users");
}
