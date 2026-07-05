import { NextRequest } from "next/server";
import Papa from "papaparse";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSession } from "@/lib/session";
import type { CustomFieldRow, LeadRow } from "@/lib/database.types";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const sb = supabaseAdmin();
  const { data: me } = await sb.from("users").select("permissions").eq("id", session.userId).maybeSingle();
  const canExport =
    session.role === "admin" ||
    (me?.permissions as Record<string, boolean> | null)?.["leads:export"] === true;
  if (!canExport) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const stageId = url.searchParams.get("stage");
  const ownerId = url.searchParams.get("owner");

  let query = sb.from("leads").select("*").order("created_at", { ascending: false });
  if (stageId) query = query.eq("stage_id", stageId);
  if (ownerId) query = query.eq("owner_id", ownerId);

  const [{ data: leadRows }, { data: fieldRows }] = await Promise.all([
    query,
    sb.from("custom_fields").select("*").eq("is_archived", false).order("position"),
  ]);
  const leads = (leadRows ?? []) as LeadRow[];
  const fields = (fieldRows ?? []) as CustomFieldRow[];

  const flat = leads.map((l) => ({
    name: l.name,
    phone: l.phone,
    email: l.email,
    stage_id: l.stage_id,
    owner_id: l.owner_id,
    next_callback_at: l.next_callback_at,
    is_dnc: l.is_dnc,
    created_at: l.created_at,
    updated_at: l.updated_at,
    ...Object.fromEntries(fields.map((f) => [f.key, l.custom?.[f.key] ?? ""])),
  }));

  const csv = Papa.unparse(flat);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
