import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type { InvoiceRow } from "@/lib/database.types";

// Streams the invoice PDF from the Finance Tracker back to the browser as a
// file download. Auth stays server-side so the tracker API key never leaks
// to the client.

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const { data } = await sb
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Non-admin members can only pull their own invoices.
  const scopeAllUsers = session.role === "admin" || session.role === "manager";
  if (!scopeAllUsers && data.created_by !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const key = process.env.FINANCE_TRACKER_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Finance Tracker env not configured." },
      { status: 500 },
    );
  }

  // Prefer the pdf_url the tracker sent back on create — it's the
  // canonical, dashboard-matching link. Fall back to constructing one from
  // the finance_tracker_id for legacy rows that pre-date the pdf_url column.
  let pdfUrl = data.pdf_url;
  if (!pdfUrl && data.finance_tracker_id) {
    const base = process.env.FINANCE_TRACKER_API_URL;
    if (base) {
      pdfUrl = `${base.replace(/\/$/, "")}/${data.finance_tracker_id}/pdf`;
    }
  }
  if (!pdfUrl) {
    return NextResponse.json(
      {
        error:
          "Invoice hasn't been synced to the Finance Tracker yet — retry the sync first.",
      },
      { status: 409 },
    );
  }

  const res = await fetch(pdfUrl, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Finance Tracker returned ${res.status}: ${text.slice(0, 200)}` },
      { status: 502 },
    );
  }

  const body = await res.arrayBuffer();
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${data.invoice_number ?? "invoice"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
