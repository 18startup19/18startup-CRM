import Link from "next/link";
import { IndianRupee, Users, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { formatDateTime, incentivePercentForAmount, netAfterGst } from "@/lib/utils";
import { CallbacksRangePicker } from "@/components/leads/callbacks-range-picker";
import { GroupedPaymentTable, type LeadGroup } from "@/components/leads/grouped-payment-table";
import type { OnboardingState } from "@/components/leads/onboard-lms-button";
import type { LeadLmsOnboardingRow } from "@/lib/database.types";

type RangeKey =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "custom";

interface PageProps {
  searchParams: Promise<{
    range?: RangeKey;
    from?: string;
    to?: string;
    cohort?: string;
  }>;
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
    .select("id,lead_id,actor_id,amount,note,cohort_number,created_at")
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
    cohort_number: string | null;
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

  // Per-cohort breakdown for the range — clicking a row filters the log below.
  const perCohort = new Map<
    string,
    { number: string; count: number; amount: number; leadIds: Set<string> }
  >();
  for (const a of amounts) {
    const key = a.cohort_number ?? "";
    if (!key) continue;
    const entry = perCohort.get(key) ?? {
      number: key,
      count: 0,
      amount: 0,
      leadIds: new Set<string>(),
    };
    entry.leadIds.add(a.lead_id);
    entry.count += 1;
    entry.amount += Number(a.amount);
    perCohort.set(key, entry);
  }
  const perCohortRows = Array.from(perCohort.values()).sort((a, b) => {
    const na = Number(a.number);
    const nb = Number(b.number);
    if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
    return a.number.localeCompare(b.number);
  });

  const cohortFilter = params.cohort?.trim() || null;
  const displayedAmounts = cohortFilter
    ? amounts.filter((a) => a.cohort_number === cohortFilter)
    : amounts;

  // When a specific cohort is picked, resolve the cohort row + onboarding
  // status so we can render the "Onboard to LMS" button per lead. Without
  // a cohort filter the mapping is ambiguous (lead could be in >1 cohorts),
  // so we skip the button in that case and prompt the user to filter.
  let onboardingProp:
    | { cohortId: string; byLeadId: Map<string, OnboardingState> }
    | undefined;
  if (cohortFilter) {
    const { data: cohortRow } = await sb
      .from("cohorts")
      .select("id")
      .eq("number", cohortFilter)
      .maybeSingle<{ id: string }>();
    if (cohortRow) {
      const displayedLeadIds = Array.from(
        new Set(displayedAmounts.map((a) => a.lead_id)),
      );
      const { data: onboardingsData } = displayedLeadIds.length
        ? await sb
            .from("lead_lms_onboardings")
            .select("lead_id,status,sent_at,error")
            .eq("cohort_id", cohortRow.id)
            .in("lead_id", displayedLeadIds)
        : { data: [] as Pick<
            LeadLmsOnboardingRow,
            "lead_id" | "status" | "sent_at" | "error"
          >[] };
      const byLeadId = new Map<string, OnboardingState>();
      for (const o of (onboardingsData ?? []) as Pick<
        LeadLmsOnboardingRow,
        "lead_id" | "status" | "sent_at" | "error"
      >[]) {
        byLeadId.set(o.lead_id, {
          status: o.status === "pending" ? null : o.status,
          sentAt: o.sent_at,
          error: o.error,
        });
      }
      onboardingProp = { cohortId: cohortRow.id, byLeadId };
    }
  }

  // Group by lead so multiple payments from the same lead show as a single
  // clickable row that expands to the individual payments.
  const groups = new Map<string, LeadGroup>();
  for (const a of displayedAmounts) {
    const existing = groups.get(a.lead_id);
    const p = {
      id: a.id,
      amount: Number(a.amount),
      note: a.note,
      cohort_number: a.cohort_number,
      created_at: a.created_at,
      actor_id: a.actor_id,
      actorName: a.actor_id ? userById.get(a.actor_id)?.name ?? "" : "",
    };
    if (existing) {
      existing.payments.push(p);
    } else {
      groups.set(a.lead_id, {
        leadId: a.lead_id,
        leadName: leadNameById.get(a.lead_id) ?? "Unknown",
        payments: [p],
      });
    }
  }
  const leadGroups = Array.from(groups.values()).sort(
    (a, b) => (a.payments[0].created_at < b.payments[0].created_at ? 1 : -1),
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

        <div
          className={`grid grid-cols-1 gap-4 ${scopeAllUsers ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
        >
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
          {/* Incentive tile shown only to admin + manager. Members see
              amount + leads count but not the incentive figure. */}
          {scopeAllUsers && (
            <StatCard
              icon={<Sparkles size={14} />}
              label="Incentive earned"
              value={`₹${Math.round(totalIncentive).toLocaleString("en-IN")}`}
            />
          )}
        </div>

        {scopeAllUsers && (
          <div>
            <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
              By team member
            </h2>
            <Card className="p-0 overflow-x-auto">
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

        {perCohortRows.length > 0 && (
          <div>
            <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
              By cohort
            </h2>
            <Card className="p-0 overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead className="bg-brand-bg border-b border-brand-border text-left">
                  <tr>
                    <Th>Cohort #</Th>
                    <Th>Unique leads</Th>
                    <Th>Payments</Th>
                    <Th>Amount</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {perCohortRows.map((c) => {
                    const isActive = cohortFilter === c.number;
                    const href = (() => {
                      const usp = new URLSearchParams();
                      if (params.range) usp.set("range", params.range);
                      if (params.from) usp.set("from", params.from);
                      if (params.to) usp.set("to", params.to);
                      if (!isActive) usp.set("cohort", c.number);
                      const q = usp.toString();
                      return q ? `?${q}` : "/converted-leads";
                    })();
                    return (
                      <tr
                        key={c.number}
                        className={
                          "border-b border-brand-border last:border-none " +
                          (isActive ? "bg-brand-orange/5" : "hover:bg-brand-bg")
                        }
                      >
                        <Td>
                          <Link
                            href={href}
                            className="block font-mono font-bold text-brand-orange hover:text-brand-orange-dark"
                          >
                            Cohort {c.number}
                          </Link>
                        </Td>
                        <Td>{c.leadIds.size}</Td>
                        <Td>{c.count}</Td>
                        <Td className="font-semibold">
                          ₹{c.amount.toLocaleString("en-IN")}
                        </Td>
                        <Td>
                          <Link
                            href={href}
                            className="text-[12px] font-bold text-brand-orange hover:text-brand-orange-dark"
                          >
                            {isActive ? "Clear filter" : "View leads →"}
                          </Link>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        )}

        <div>
          <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
            Payment log
            {cohortFilter && (
              <span className="ml-2 text-[12px] font-bold text-brand-orange bg-brand-orange/10 rounded-full px-2 py-0.5 align-middle">
                Cohort {cohortFilter}
              </span>
            )}
          </h2>
          <GroupedPaymentTable
            groups={leadGroups}
            emptyLabel="No payments in this range."
            onboarding={onboardingProp}
          />
          {!cohortFilter && perCohortRows.length > 0 && (
            <p className="mt-2 text-[11.5px] text-brand-dark-text">
              Pick a cohort above to enable the LMS onboarding button per lead.
            </p>
          )}
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
