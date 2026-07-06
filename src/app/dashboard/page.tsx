import { Phone, Clock, IndianRupee, Sparkles, Trophy, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { CallbacksRangePicker } from "@/components/leads/callbacks-range-picker";

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
          <StatCard
            icon={<Users size={14} />}
            label="Incentive rate"
            value={`${ratePct}%`}
            hint="Set by admin in Users."
          />
        </div>
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
