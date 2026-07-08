import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { formatDateTime } from "@/lib/utils";
import { InvoiceResyncButton } from "@/components/invoices/invoice-resync-button";
import type { InvoiceRow, UserRow } from "@/lib/database.types";

export default async function InvoicesPage() {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const scopeAllUsers =
    session.role === "admin" || session.role === "manager";

  let q = sb
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!scopeAllUsers) q = q.eq("created_by", session.userId);

  const [{ data: invoicesData }, { data: usersData }] = await Promise.all([
    q,
    sb.from("users").select("id,name"),
  ]);

  const invoices = (invoicesData ?? []) as InvoiceRow[];
  const usersById = new Map(
    ((usersData ?? []) as Pick<UserRow, "id" | "name">[]).map((u) => [u.id, u.name]),
  );

  const totalAmount = invoices.reduce((s, i) => s + Number(i.total_amount), 0);

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Create invoices here and they sync to the Finance Tracker automatically."
      />
      <div className="p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-brand-dark-text">
                Invoices
              </div>
              <div className="text-[22px] font-black text-brand-charcoal mt-0.5">
                {invoices.length}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.6px] text-brand-dark-text">
                Total value
              </div>
              <div className="text-[22px] font-black text-brand-charcoal mt-0.5">
                ₹{totalAmount.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
          <Link href="/invoices/new">
            <Button variant="primary" size="md">
              <Plus size={14} className="inline mr-1 -mt-0.5" />
              Create new invoice
            </Button>
          </Link>
        </div>

        <Card className="p-0 overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-brand-bg border-b border-brand-border text-left">
              <tr>
                <Th>Invoice #</Th>
                <Th>Customer</Th>
                <Th>Company</Th>
                <Th>Product</Th>
                <Th>Amount</Th>
                <Th>Invoice date</Th>
                <Th>Created by</Th>
                <Th>Finance Tracker</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-brand-border last:border-none hover:bg-brand-bg/40"
                >
                  <Td className="font-mono text-[12.5px] font-bold text-brand-charcoal">
                    {inv.invoice_number}
                  </Td>
                  <Td className="font-semibold">{inv.customer_name}</Td>
                  <Td className="text-brand-dark-text">{inv.company_name}</Td>
                  <Td className="text-brand-dark-text">{inv.product_name}</Td>
                  <Td className="font-semibold">
                    ₹{Number(inv.total_amount).toLocaleString("en-IN")}
                  </Td>
                  <Td className="text-brand-dark-text">
                    {inv.invoice_date
                      ? new Date(inv.invoice_date).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </Td>
                  <Td className="text-brand-dark-text">
                    {inv.created_by ? usersById.get(inv.created_by) ?? "—" : "—"}
                    <div className="text-[11px] text-brand-dark-text">
                      {formatDateTime(inv.created_at)}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Badge
                        color={
                          inv.sync_status === "synced"
                            ? "green"
                            : inv.sync_status === "failed"
                              ? "red"
                              : "amber"
                        }
                      >
                        {inv.sync_status}
                      </Badge>
                      {inv.sync_status !== "synced" && (
                        <InvoiceResyncButton id={inv.id} />
                      )}
                    </div>
                    {inv.sync_error && (
                      <div className="text-[11px] text-red-600 mt-1 line-clamp-2">
                        {inv.sync_error}
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-16 text-center text-brand-dark-text"
                  >
                    No invoices yet. Click <b>Create new invoice</b> to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
