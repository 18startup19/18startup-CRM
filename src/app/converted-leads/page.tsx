import Link from "next/link";
import { IndianRupee, Users, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { formatDateTime, incentivePercentForAmount, netAfterGst } from "@/lib/utils";
import { CallbacksRangePicker } from "@/components/leads/callbacks-range-picker";
import { ConvertedAmountCell } from "@/components/converted-amount-cell";

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
      return { from: startOfDay(now), to: endOfDay(now), label: "This month" };
  }
}

export default async function ConvertedLeadsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const params = await searchParams;
  const key: RangeKey = params.range ?? "this_month";
  const { from, to, label } = computeRange(key, params.from, params.to);

  // Non-admin members see only their own conversions. Admins + managers see
  // everyone's.
  const scopeAllUsers = session.role === "admin" || session.role === "manager";

  let amountsQ = sb
    .from("lead_amounts")
    .select("id,lead_id,actor_id,amount,note,created_at")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: false });
  if (!scopeAllUsers) amountsQ = amountsQ.eq("actor_id", session.userId);

  const [{ data: amountsData }, { data: usersData }] = await Promise.all([
    amountsQ,
    sb.from("users").select("id,name,incentive_percent,incentive_rules"),
  ]);

  const amounts = (amountsData ?? []) as {
    id: string;
    lead_id: string;
    actor_id: string | null;
    amount: number;
    note: string | null;
    created_at: string;
  }[];
  const users = (usersData ?? []) as {
    id: string;
    name: string;
    incentive_percent: number;
    incentive_rules: { from: number; to: number | null; percent: number }[] | null;
  }[];
  const userById = new Map(users.map((u) => [u.id, u]));

  // Look up lead names
  const leadIds = Array.from(new Set(amounts.map((a) => a.lead_id)));
  const { data: leadsData } =
    leadIds.length > 0
      ? await sb.from("leads").select("id,name").in("id", leadIds)
      : { data: [] };
  const leadNameById = new Map(
    ((leadsData ?? []) as { id: string; name: string }[]).map((l) => [l.id, l.name]),
  );

  const totalAmount = amounts.reduce((sum, a) => sum + Number(a.amount), 0);
  const uniqueLeads = new Set(amounts.map((a) => a.lead_id));
  const uniqueUsers = new Set(amounts.map((a) => a.actor_id).filter(Boolean));

  // Per-payment incentive using range tiers (with base % fallback). The
  // customer-paid amount is gross-of-GST; the tier match + payout use the
  // net (post-GST) figure per company policy.
  const incentiveForAmount = (u: (typeof users)[number] | null, amount: number) => {
    if (!u) return 0;
    const net = netAfterGst(amount);
    const pct = incentivePercentForAmount(net, u.incentive_rules, Number(u.incentive_percent ?? 0));
    return net * (pct / 100);
  };

  const totalIncentive = amounts.reduce(
    (sum, a) => sum + incentiveForAmount(a.actor_id ? userById.get(a.actor_id) ?? null : null, Number(a.amount)),
    0,
  );

  // Per-team-member breakdown for the range
  const perUser = new Map<string, { name: string; amount: number; incentive: number; count: number }>();
  for (const a of amounts) {
    const u = a.actor_id ? userById.get(a.actor_id) : null;
    const name = u?.name ?? "Unknown";
    const inc = incentiveForAmount(u ?? null, Number(a.amount));
    const entry = perUser.get(a.actor_id ?? "unknown") ?? {
      name,
      amount: 0,
      incentive: 0,
      count: 0,
    };
    entry.amount += Number(a.amount);
    entry.incentive += inc;
    entry.count += 1;
    perUser.set(a.actor_id ?? "unknown", entry);
  }
  const perUserRows = Array.from(perUser.values()).sort(
    (a, b) => b.amount - a.amount,
  );

  return (
    <>
      <PageHeader
        title="Converted leads"
        subtitle="Payments collected + incentives earned. Range applies to everything on this page."
      />
      <div className="p-8 flex flex-col gap-6">
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

        <div className="grid grid-cols-3 gap-4">
          <StatCard
            icon={<IndianRupee size={14} />}
            label="Amount collected"
            value={`₹${totalAmount.toLocaleString("en-IN")}`}
          />
          <StatCard
            icon={<Users size={14} />}
            label="Leads converted"
            value={String(uniqueLeads.size)}
          />
          <StatCard
            icon={<Sparkles size={14} />}
            label="Incentive earned"
            value={`₹${Math.round(totalIncentive).toLocaleString("en-IN")}`}
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
                    <Th>Leads converted</Th>
                    <Th>Amount</Th>
                    <Th>Incentive earned</Th>
                  </tr>
                </thead>
                <tbody>
                  {perUserRows.map((r, i) => (
                    <tr key={i} className="border-b border-brand-border last:border-none">
                      <Td className="font-semibold">{r.name}</Td>
                      <Td>{r.count}</Td>
                      <Td>₹{r.amount.toLocaleString("en-IN")}</Td>
                      <Td className="text-brand-orange font-semibold">
                        ₹{Math.round(r.incentive).toLocaleString("en-IN")}
                      </Td>
                    </tr>
                  ))}
                  {perUserRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-brand-dark-text">
                        No conversions in this range yet.
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
            Payment log
          </h2>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-[14px]">
              <thead className="bg-brand-bg border-b border-brand-border text-left">
                <tr>
                  <Th>Lead</Th>
                  <Th>Team member</Th>
                  <Th>Amount</Th>
                  <Th>Note</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {amounts.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-brand-border last:border-none hover:bg-brand-bg cursor-pointer"
                  >
                    <Td>
                      <Link
                        href={`/leads/${a.lead_id}`}
                        className="block font-bold text-brand-charcoal hover:text-brand-orange"
                      >
                        {leadNameById.get(a.lead_id) ?? "Unknown"}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/leads/${a.lead_id}`} className="block">
                        {a.actor_id ? userById.get(a.actor_id)?.name ?? "—" : "—"}
                      </Link>
                    </Td>
                    <Td className="font-semibold">
                      <ConvertedAmountCell
                        amountId={a.id}
                        initialAmount={Number(a.amount)}
                        initialNote={a.note}
                      />
                    </Td>
                    <Td className="text-brand-dark-text">
                      <Link href={`/leads/${a.lead_id}`} className="block">
                        {a.note ?? "—"}
                      </Link>
                    </Td>
                    <Td className="text-brand-dark-text">
                      <Link href={`/leads/${a.lead_id}`} className="block">
                        {formatDateTime(a.created_at)}
                      </Link>
                    </Td>
                  </tr>
                ))}
                {amounts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-brand-dark-text">
                      No payments in this range.
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

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-6 py-3 align-top ${className}`}>{children}</td>;
}
