"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { clearSession, createSession } from "@/lib/session";

export interface LoginResult {
  error?: string;
}

export async function loginAction(_prev: LoginResult, formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Enter your email and password." };

  const sb = supabaseAdmin();
  const { data: user, error } = await sb
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error || !user || !user.is_active) {
    return { error: "Invalid email or password." };
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return { error: "Invalid email or password." };

  await sb.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

  await createSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  redirect(user.role === "admin" ? "/admin" : "/leads");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
