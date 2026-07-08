import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { InvoiceForm } from "@/components/invoices/invoice-form";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type { InvoiceRow } from "@/lib/database.types";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function EditInvoicePage({ params }: Params) {
  await requireSession();
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (!data) notFound();

  return (
    <>
      <PageHeader
        title={`Edit ${data.invoice_number ?? "invoice"}`}
        subtitle="Changes sync to the Finance Tracker on save."
      />
      <div className="p-8 max-w-[720px]">
        <InvoiceForm invoice={data} />
      </div>
    </>
  );
}
