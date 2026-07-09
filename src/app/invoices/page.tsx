import Link from "next/link";
import { Plus, FileText, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { formatDateTime } from "@/lib/utils";
import { InvoiceResyncButton } from "@/components/invoices/invoice-resync-button";
import { CallbacksRangePicker } from "@/components/leads/callbacks-range-picker";
import type { InvoiceRow, UserRow } from "@/lib/database.types";

type RangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "custom";

interface PageProps {
  searchParams: Promise<{ range?: RangeKey; from?: string; to?: string }>;
}

function computeRange(
  key: RangeKey,
  fromStr?: string,
  toStr?: string,
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const endOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(23, 59, 59, 999);
    return c;
  };
  switch (key) {
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y), label: "Yesterday" };
    }
    case "7d": {
      const f = new Date(now);
      f.setDate(now.getDate() - 6);
      return { from: startOfDay(f), to: endOfDay(now), label: "Last 7 days" };
    }
    case "30d": {
      const f = new Date(now);
      f.setDate(now.getDate() - 29);
      return { from: startOfDay(f), to: endOfDay(now), label: "Last 30 days" };
    }
    case "this_month": {
      const f = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(f), to: endOfDay(now), label: "This month" };
    }
    case "last_month": {
      const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const t = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(f), to: endOfDay(t), label: "Last month" };
    }
    case "custom": {
      const f = fromStr ? new Date(fromStr) : startOfDay(now);
      const t = toStr ? new Date(toStr) : endOfDay(now);
      return { from: startOfDay(f), to: endOfDay(t), label: "Custom" };
    }
    case "today":
    default:
      return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
  }
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const scopeAllUsers =
    session.role === "admin" || session.role === "manager";

  const params = await searchParams;
  const key: RangeKey = params.range ?? "this_month";
  const { from, to, label } = computeRange(key, params.from, params.to);

  let q = sb
    .from("invoices")
    .select("*")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);
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

  // Per-team-member breakdown for admin + manager views.
  const perUser = new Map<
    string,
    { name: string; count: number; amount: number }
  >();
  if (scopeAllUsers) {
    for (const inv of invoices) {
      const key = inv.created_by ?? "unknown";
      const name = inv.created_by
        ? usersById.get(inv.created_by) ?? "Unknown"
        : "Unknown";
      const entry = perUser.get(key) ?? { name, count: 0, amount: 0 };
      entry.count += 1;
      entry.amount += Number(inv.total_amount);
      perUser.set(key, entry);
    }
  }
  const perUserRows = Array.from(perUser.values()).sort(
    (a, b) => b.amount - a.amount,
  );

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Create invoices here and they sync to the Finance Tracker automatically."
      />
      <div className="p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="text-[12px] font-bold uppercase tracking-[0.6px] text-brand-dark-text">
              {label}
            </div>
            <CallbacksRangePicker
              current={key}
              fromStr={params.from ?? ""}
              toStr={params.to ?? ""}
            />
          </div>
          <Link href="/invoices/new">
            <Button variant="primary" size="md">
              <Plus size={14} className="inline mr-1 -mt-0.5" />
              Create new invoice
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<FileText size={14} />}
            label="Invoices"
            value={String(invoices.length)}
          />
          <StatCard
            icon={<FileText size={14} />}
            label="Amount billed"
            value={`₹${totalAmount.toLocaleString("en-IN")}`}
          />
          <StatCard
            icon={<FileText size={14} />}
            label="Team members"
            value={String(perUserRows.length || (invoices.length ? 1 : 0))}
          />
        </div>

        {scopeAllUsers && (
          <div>
            <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
              By team member
            </h2>
            <Card className="p-0 overflow-hidden">
              <table className="w-full text-[14px]">
                <thead className="bg-brand-bg border-b border-brand-border text-left">
                  <tr>
                    <Th>Team member</Th>
                    <Th>Invoices</Th>
                    <Th>Amount billed</Th>
                  </tr>
                </thead>
                <tbody>
                  {perUserRows.map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-brand-border last:border-none"
                    >
                      <Td className="font-semibold">{r.name}</Td>
                      <Td>{r.count}</Td>
                      <Td className="font-semibold">
                        ₹{r.amount.toLocaleString("en-IN")}
                      </Td>
                    </tr>
                  ))}
                  {perUserRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-6 py-10 text-center text-brand-dark-text"
                      >
                        No invoices in this range yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        <div>
          <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
            All invoices
          </h2>
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
                    className="border-b border-brand-border last:border-none hover:bg-brand-bg/40 cursor-pointer"
                  >
                    <Td className="font-mono text-[12.5px] font-bold">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="block text-brand-orange hover:text-brand-orange-dark underline decoration-dotted underline-offset-2"
                      >
                        {inv.invoice_number ?? "—"}
                      </Link>
                    </Td>
                    <Td className="font-semibold">
                      <Link href={`/invoices/${inv.id}`} className="block">
                        {inv.customer_name}
                      </Link>
                    </Td>
                    <Td className="text-brand-dark-text">
                      <Link href={`/invoices/${inv.id}`} className="block">
                        {inv.company_name}
                      </Link>
                    </Td>
                    <Td className="text-brand-dark-text">
                      <Link href={`/invoices/${inv.id}`} className="block">
                        {inv.product_name}
                      </Link>
                    </Td>
                    <Td className="font-semibold">
                      <Link href={`/invoices/${inv.id}`} className="block">
                        ₹{Number(inv.total_amount).toLocaleString("en-IN")}
                      </Link>
                    </Td>
                    <Td className="text-brand-dark-text">
                      <Link href={`/invoices/${inv.id}`} className="block">
                        {inv.invoice_date
                          ? new Date(inv.invoice_date).toLocaleDateString(
                              "en-IN",
                              {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              },
                            )
                          : "—"}
                      </Link>
                    </Td>
                    <Td className="text-brand-dark-text">
                      <Link href={`/invoices/${inv.id}`} className="block">
                        {inv.created_by
                          ? usersById.get(inv.created_by) ?? "—"
                          : "—"}
                        <div className="text-[11px] text-brand-dark-text">
                          {formatDateTime(inv.created_at)}
                        </div>
                      </Link>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {inv.sync_status === "synced" && inv.pdf_url && (
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-orange hover:text-brand-orange-dark"
                            title="Download invoice PDF from Finance Tracker"
                          >
                            <Download size={11} />
                            PDF
                          </a>
                        )}
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
                      No invoices in this range. Click <b>Create new invoice</b>{" "}
                      to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
        <span className="text-brand-orange">{icon}</span>
        {label}
      </div>
      <div className="text-[22px] font-black text-brand-charcoal mt-1">
        {value}
      </div>
    </Card>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
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
