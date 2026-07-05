import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type { LeadRow } from "@/lib/database.types";
import { formatDateTime } from "@/lib/utils";
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
    case "today":
    default:
      return { from: startOfDay(now), to: endOfDay(now), label: "Today" };
  }
}

export default async function CallbacksPage({ searchParams }: PageProps) {
  const session = await requireSession();
  const sb = supabaseAdmin();

  const params = await searchParams;
  const key: RangeKey = params.range ?? "today";
  const { from, to, label } = computeRange(key, params.from, params.to);

  const in24 = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const nowMs = Date.now();

  const [{ data: leadsData }, { data: commsData }] = await Promise.all([
    sb
      .from("leads")
      .select("*")
      .eq("owner_id", session.userId)
      .not("next_callback_at", "is", null)
      .lte("next_callback_at", in24)
      .order("next_callback_at", { ascending: true }),
    sb
      .from("communications")
      .select("id,channel,status,duration_seconds,created_at")
      .eq("actor_id", session.userId)
      .eq("channel", "call")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString()),
  ]);

  const leads = (leadsData ?? []) as LeadRow[];
  const calls = (commsData ?? []) as {
    id: string;
    channel: string;
    status: string;
    duration_seconds: number | null;
    created_at: string;
  }[];

  const totalCalls = calls.length;
  const answered = calls.filter((c) => c.status === "answered").length;
  const totalDurationSecs = calls.reduce(
    (sum, c) => sum + (c.duration_seconds ?? 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="My callbacks"
        subtitle="Leads with callbacks due in the next 24 hours."
      />
      <div className="p-8 flex flex-col gap-6">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-[12px] font-bold uppercase tracking-[0.6px] text-brand-dark-text">
            Call stats · {label}
          </div>
          <CallbacksRangePicker
            current={key}
            fromStr={params.from ?? ""}
            toStr={params.to ?? ""}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Calls made" value={String(totalCalls)} />
          <StatCard
            label="Picked up"
            value={`${answered}${totalCalls ? ` (${Math.round((answered / totalCalls) * 100)}%)` : ""}`}
          />
          <StatCard label="Total duration" value={formatDuration(totalDurationSecs)} />
        </div>

        <div>
          <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
            Upcoming callbacks
          </h2>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-[14px]">
              <thead className="bg-brand-bg border-b border-brand-border text-left">
                <tr>
                  <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                    Name
                  </th>
                  <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                    Callback at
                  </th>
                  <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const overdue =
                    l.next_callback_at && new Date(l.next_callback_at).getTime() < nowMs;
                  return (
                    <tr key={l.id} className="border-b border-brand-border last:border-none">
                      <td className="px-6 py-3">
                        <Link
                          href={`/leads/${l.id}`}
                          className="font-bold text-brand-charcoal hover:text-brand-orange"
                        >
                          {l.name}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-brand-dark-text">{l.phone ?? "—"}</td>
                      <td className="px-6 py-3 text-brand-dark-text">
                        {formatDateTime(l.next_callback_at)}
                      </td>
                      <td className="px-6 py-3">
                        {overdue ? (
                          <span className="text-red-600 font-bold text-[12px]">OVERDUE</span>
                        ) : (
                          <span className="text-brand-orange font-bold text-[12px]">Upcoming</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-brand-dark-text">
                      No callbacks scheduled in the next 24 hours.
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
        {label}
      </div>
      <div className="text-[26px] font-black text-brand-charcoal mt-1">{value}</div>
    </Card>
  );
}

function formatDuration(totalSecs: number): string {
  if (totalSecs < 60) return `${totalSecs}s`;
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m ${secs}s`;
}
