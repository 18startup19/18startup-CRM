import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pencil } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { formatDateTime } from "@/lib/utils";
import type { InvoiceRow, UserRow } from "@/lib/database.types";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: Params) {
  const session = await requireSession();
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data } = await sb
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle<InvoiceRow>();
  if (!data) notFound();

  const scopeAllUsers = session.role === "admin" || session.role === "manager";
  if (!scopeAllUsers && data.created_by !== session.userId) notFound();

  const creator = data.created_by
    ? await sb
        .from("users")
        .select("name")
        .eq("id", data.created_by)
        .maybeSingle<Pick<UserRow, "name">>()
    : null;

  const gross = Number(data.total_amount);
  const subtotal = Number((gross / 1.18).toFixed(2));
  const gst = Number((gross - subtotal).toFixed(2));
  const invoiceDate = new Date(data.invoice_date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <>
      <PageHeader
        title={data.invoice_number ?? "Invoice"}
        subtitle="Invoice summary."
      />
      <div className="p-8 max-w-[820px] flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/invoices"
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-dark-text hover:text-brand-charcoal"
          >
            <ArrowLeft size={14} />
            Back to invoices
          </Link>
          <div className="flex items-center gap-2">
            <a href={`/api/invoices/${data.id}/pdf`} target="_blank" rel="noreferrer">
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={!data.pdf_url}
                title={
                  data.pdf_url
                    ? "Download PDF from Finance Tracker"
                    : "PDF is only available once the invoice has synced to the Finance Tracker."
                }
              >
                <Download size={14} className="inline mr-1 -mt-0.5" />
                Download PDF
              </Button>
            </a>
            <Link href={`/invoices/${data.id}/edit`}>
              <Button variant="primary" size="sm" type="button">
                <Pencil size={14} className="inline mr-1 -mt-0.5" />
                Edit
              </Button>
            </Link>
          </div>
        </div>

        <Card className="p-6 flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-brand-dark-text">
                Invoice
              </div>
              <div className="font-mono text-[20px] font-black text-brand-charcoal mt-0.5">
                {data.invoice_number ?? "—"}
              </div>
              <div className="text-[12.5px] text-brand-dark-text mt-1">
                Dated {invoiceDate}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge
                color={
                  data.sync_status === "synced"
                    ? "green"
                    : data.sync_status === "failed"
                      ? "red"
                      : "amber"
                }
              >
                Finance Tracker: {data.sync_status}
              </Badge>
              <Badge color="green">Paid</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <SummaryBlock label="Bill to">
              <div className="font-bold text-brand-charcoal text-[15px]">
                {data.customer_name}
              </div>
              <div className="text-[13px] text-brand-dark-text">
                {data.company_name}
              </div>
              <div className="text-[12.5px] text-brand-dark-text whitespace-pre-wrap">
                {data.company_address}
              </div>
              <div className="text-[12px] text-brand-dark-text mt-2">
                <div>
                  <span className="font-bold">GST:</span> {data.gst_number}
                </div>
                {data.pan_number && (
                  <div>
                    <span className="font-bold">PAN:</span> {data.pan_number}
                  </div>
                )}
              </div>
            </SummaryBlock>

            <SummaryBlock label="Metadata">
              <div className="text-[12.5px] text-brand-dark-text">
                <div>
                  <span className="font-bold">Created by:</span>{" "}
                  {creator?.data?.name ?? "—"}
                </div>
                <div>
                  <span className="font-bold">Created at:</span>{" "}
                  {formatDateTime(data.created_at)}
                </div>
                {data.finance_tracker_id && (
                  <div className="font-mono text-[11px] mt-1">
                    FT ID: {data.finance_tracker_id}
                  </div>
                )}
                {data.sync_error && (
                  <div className="mt-2 text-[11.5px] text-red-600 whitespace-pre-wrap">
                    {data.sync_error}
                  </div>
                )}
              </div>
            </SummaryBlock>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-brand-dark-text mb-2">
              Line items
            </div>
            <table className="w-full text-[13.5px]">
              <thead className="border-y border-brand-border">
                <tr>
                  <th className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                    Description
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                    Qty
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                    Rate (ex-GST)
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                    GST
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-brand-border">
                  <td className="px-3 py-3 font-semibold text-brand-charcoal">
                    {data.product_name}
                  </td>
                  <td className="px-3 py-3 text-right">1</td>
                  <td className="px-3 py-3 text-right">
                    ₹{subtotal.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-3 text-right">18%</td>
                  <td className="px-3 py-3 text-right font-semibold">
                    ₹{gross.toLocaleString("en-IN")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-[280px] text-[13.5px]">
              <TotalsRow label="Subtotal" value={`₹${subtotal.toLocaleString("en-IN")}`} />
              <TotalsRow label="GST 18%" value={`₹${gst.toLocaleString("en-IN")}`} />
              <div className="border-t border-brand-border mt-1 pt-1">
                <TotalsRow
                  label="Total"
                  value={`₹${gross.toLocaleString("en-IN")}`}
                  bold
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}

function SummaryBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-brand-dark-text mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function TotalsRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={
        "flex items-center justify-between py-1 " +
        (bold ? "font-bold text-brand-charcoal text-[15px]" : "text-brand-dark-text")
      }
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
