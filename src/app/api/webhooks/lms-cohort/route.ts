import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CohortRow } from "@/lib/database.types";

// LMS → CRM cohort sync webhook. The LMS calls this endpoint every time a
// cohort is created, updated, or archived on its side, and the CRM upserts
// the matching row so admins never have to duplicate cohort setup.
//
// Auth:  Authorization: Bearer <LMS_WEBHOOK_SECRET>
// Body:  { cohort_id: uuid, number: string, label?: string, is_active?: boolean }
//
// Matching happens on `lms_cohort_id`. If a CRM cohort already has that
// UUID we PATCH its number/label/is_active; otherwise we INSERT a new row.
//
// Number conflicts (LMS sends a `number` that already belongs to a
// *different* CRM cohort) return 409 so the LMS knows to reconcile — we
// don't silently reassign or overwrite the wrong row.

export async function POST(req: NextRequest) {
  const expected = process.env.LMS_WEBHOOK_SECRET;
  if (!expected) {
    return Response.json(
      { ok: false, error: "LMS_WEBHOOK_SECRET not configured on CRM." },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (provided !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const cohort_id = typeof body.cohort_id === "string" ? body.cohort_id.trim() : "";
  const number = typeof body.number === "string" ? body.number.trim() : "";
  const label =
    typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;
  const is_active = typeof body.is_active === "boolean" ? body.is_active : true;

  if (!cohort_id) {
    return Response.json(
      { ok: false, error: "cohort_id (UUID) is required" },
      { status: 400 },
    );
  }
  if (!number) {
    return Response.json(
      { ok: false, error: "number is required" },
      { status: 400 },
    );
  }

  const sb = supabaseAdmin();

  // Look up existing row by lms_cohort_id first — that's the canonical
  // pointer. If it exists, PATCH; otherwise INSERT.
  const { data: existing } = await sb
    .from("cohorts")
    .select("id,number")
    .eq("lms_cohort_id", cohort_id)
    .maybeSingle<Pick<CohortRow, "id" | "number">>();

  if (existing) {
    const { error } = await sb
      .from("cohorts")
      .update({
        number,
        label,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) {
      if (error.code === "23505") {
        // Another CRM cohort already owns this `number`. LMS should either
        // update that cohort's LMS mapping or send a different number.
        return Response.json(
          {
            ok: false,
            error: `Number "${number}" already belongs to a different CRM cohort.`,
          },
          { status: 409 },
        );
      }
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    revalidatePath("/admin/cohorts");
    revalidatePath("/leads");
    return Response.json({
      ok: true,
      action: "updated",
      cohort_id,
      crm_cohort_id: existing.id,
    });
  }

  // No match on lms_cohort_id — insert a fresh row. Number-collision
  // surfaces as a 23505 unique-violation on `number`.
  const { data: inserted, error } = await sb
    .from("cohorts")
    .insert({ number, label, is_active, lms_cohort_id: cohort_id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return Response.json(
        {
          ok: false,
          error: `Number "${number}" already exists in the CRM without an LMS mapping. Attach the LMS UUID to that row from Admin → Cohort Onboarding instead of creating a duplicate.`,
        },
        { status: 409 },
      );
    }
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  revalidatePath("/admin/cohorts");
  revalidatePath("/leads");
  return Response.json({
    ok: true,
    action: "created",
    cohort_id,
    crm_cohort_id: inserted?.id,
  });
}
