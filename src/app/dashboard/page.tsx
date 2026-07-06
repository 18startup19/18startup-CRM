import { Phone, Clock, IndianRupee, Sparkles, Trophy, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { CallbacksRangePicker } from "@/components/leads/callbacks-range-picker";
import { incentivePercentForAmount } from "@/lib/utils";

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
    default:
      return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
  }
}

function formatDuration(totalSecs: number): string {
  if (totalSecs < 60) return `${totalSecs}s`;
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  const secs = totalSecs % 60;
  return `${mins}m ${secs}s`;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const params = await searchParams;
  const key: RangeKey = params.range ?? "today";
  const { from, to, label } = computeRange(key, params.from, params.to);

  // Month-to-date range for "incentive this month" separate stat
  const now = new Date();
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthTo = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [
    { data: callsData },
    { data: amountsData },
    { data: monthAmountsData },
    { data: me },
    { data: assignedTodayData },
    { data: closedData },
    { data: wonStagesData },
  ] = await Promise.all([
    sb
      .from("communications")
      .select("status,duration_seconds")
      .eq("channel", "call")
      .eq("actor_id", session.userId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString()),
    sb
      .from("lead_amounts")
      .select("amount")
      .eq("actor_id", session.userId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString()),
    sb
      .from("lead_amounts")
      .select("amount")
      .eq("actor_id", session.userId)
      .gte("created_at", monthFrom)
      .lte("created_at", monthTo),
    sb
      .from("users")
      .select("incentive_percent")
      .eq("id", session.userId)
      .maybeSingle<{ incentive_percent: number }>(),
    sb
      .from("lead_activities")
      .select("lead_id,payload")
      .eq("kind", "owner_changed")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString()),
    sb
      .from("leads")
      .select("id,stage_id,owner_id,updated_at")
      .eq("owner_id", session.userId)
      .gte("updated_at", from.toISOString())
      .lte("updated_at", to.toISOString()),
    sb.from("lead_stages").select("id,kind").eq("kind", "won"),
  ]);

  const calls = (callsData ?? []) as { status: string; duration_seconds: number | null }[];
  const totalCalls = calls.length;
  const pickedUp = calls.filter((c) => c.status === "answered").length;
  const talkTimeSecs = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);

  const amounts = (amountsData ?? []) as { amount: number }[];
  const amountToday = amounts.reduce((s, a) => s + Number(a.amount), 0);

  const monthAmounts = (monthAmountsData ?? []) as { amount: number }[];
  const monthAmount = monthAmounts.reduce((s, a) => s + Number(a.amount), 0);

  const ratePct = Number(me?.incentive_percent ?? 0);
  const rate = ratePct / 100;
  const incentiveToday = amountToday * rate;
  const incentiveMonth = monthAmount * rate;

  const assignedTodayCount = (
    (assignedTodayData ?? []) as { payload: Record<string, unknown> }[]
  ).filter((a) => a.payload?.to === session.userId).length;

  const wonStageIds = new Set(
    ((wonStagesData ?? []) as { id: string }[]).map((s) => s.id),
  );
  const closedCount = ((closedData ?? []) as { stage_id: string | null }[]).filter(
    (l) => l.stage_id && wonStageIds.has(l.stage_id),
  ).length;

  return (
    <>
      <PageHeader
        title="My dashboard"
        subtitle="Everything you've done in the selected range."
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

        <div className="grid grid-cols-4 gap-4">
          <StatCard
            icon={<Phone size={14} />}
            label="Calls made"
            value={`${totalCalls}`}
            hint={totalCalls > 0 ? `${pickedUp} picked up` : ""}
          />
          <StatCard
            icon={<Clock size={14} />}
            label="Talk time"
            value={formatDuration(talkTimeSecs)}
          />
          <StatCard
            icon={<IndianRupee size={14} />}
            label="Amount generated"
            value={`₹${amountToday.toLocaleString("en-IN")}`}
          />
          <StatCard
            icon={<Sparkles size={14} />}
            label="Incentive earned"
            value={`₹${Math.round(incentiveToday).toLocaleString("en-IN")}`}
            hint={`This month: ₹${Math.round(incentiveMonth).toLocaleString("en-IN")}`}
          />
          <StatCard
            icon={<Trophy size={14} />}
            label="Leads closed (won)"
            value={String(closedCount)}
          />
          <StatCard
            icon={<UserPlus size={14} />}
            label="Leads assigned to me"
            value={String(assignedTodayCount)}
          />
        </div>

        {(session.role === "manager" || session.role === "admin") && (
          <TeamComparison from={from.toISOString()} to={to.toISOString()} />
        )}
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
        <span className="text-brand-orange">{icon}</span>
        {label}
      </div>
      <div className="text-[22px] font-black text-brand-charcoal mt-1">{value}</div>
      {hint && <div className="text-[11px] text-brand-dark-text mt-0.5">{hint}</div>}
    </Card>
  );
}

async function TeamComparison({ from, to }: { from: string; to: string }) {
  const sb = supabaseAdmin();

  const [{ data: usersData }, { data: callsData }, { data: amountsData }] =
    await Promise.all([
      sb
        .from("users")
        .select("id,name,role,incentive_percent,incentive_rules")
        .eq("is_active", true)
        .in("role", ["member", "manager"]),
      sb
        .from("communications")
        .select("actor_id,status,duration_seconds")
        .eq("channel", "call")
        .gte("created_at", from)
        .lte("created_at", to),
      sb
        .from("lead_amounts")
        .select("actor_id,amount")
        .gte("created_at", from)
        .lte("created_at", to),
    ]);

  const users = (usersData ?? []) as {
    id: string;
    name: string;
    role: string;
    incentive_percent: number;
    incentive_rules: { from: number; to: number | null; percent: number }[] | null;
  }[];
  const calls = (callsData ?? []) as {
    actor_id: string | null;
    status: string;
    duration_seconds: number | null;
  }[];
  const amounts = (amountsData ?? []) as {
    actor_id: string | null;
    amount: number;
  }[];

  const stats = users
    .map((u) => {
      const myCalls = calls.filter((c) => c.actor_id === u.id);
      const totalCalls = myCalls.length;
      const connected = myCalls.filter((c) => c.status === "answered").length;
      const talkTime = myCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
      const myAmounts = amounts.filter((a) => a.actor_id === u.id);
      const amountTotal = myAmounts.reduce((s, a) => s + Number(a.amount), 0);
      const incentive = myAmounts.reduce(
        (s, a) =>
          s +
          Number(a.amount) *
            (incentivePercentForAmount(
              Number(a.amount),
              u.incentive_rules,
              Number(u.incentive_percent ?? 0),
            ) /
              100),
        0,
      );
      return {
        id: u.id,
        name: u.name,
        role: u.role,
        totalCalls,
        connected,
        talkTime,
        amountTotal,
        incentive,
      };
    })
    .sort((a, b) => b.amountTotal - a.amountTotal);

  const fmtDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${secs % 60}s`;
  };

  return (
    <div>
      <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
        Team performance
      </h2>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="bg-brand-bg border-b border-brand-border text-left">
            <tr>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Team member
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Calls made
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Connected
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Talk time
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Amount collected
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Incentive
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.id} className="border-b border-brand-border last:border-none">
                <td className="px-6 py-3">
                  <div className="font-semibold text-brand-charcoal">{s.name}</div>
                  <div className="text-[11px] text-brand-dark-text uppercase tracking-[0.4px]">
                    {s.role}
                  </div>
                </td>
                <td className="px-6 py-3">{s.totalCalls}</td>
                <td className="px-6 py-3">
                  {s.connected}
                  {s.totalCalls > 0 && (
                    <span className="text-[11px] text-brand-dark-text ml-1">
                      ({Math.round((s.connected / s.totalCalls) * 100)}%)
                    </span>
                  )}
                </td>
                <td className="px-6 py-3">{fmtDuration(s.talkTime)}</td>
                <td className="px-6 py-3 font-semibold">
                  ₹{s.amountTotal.toLocaleString("en-IN")}
                </td>
                <td className="px-6 py-3 text-brand-orange font-semibold">
                  ₹{Math.round(s.incentive).toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-brand-dark-text">
                  No team members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
