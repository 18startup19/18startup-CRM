import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import type { CommunicationRow, LeadRow } from "@/lib/database.types";
import { CallbacksRangePicker } from "@/components/leads/callbacks-range-picker";
import { CallbacksView } from "@/components/leads/callbacks-view";

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

  const [
    { data: callbacksData },
    { data: callsData },
    { data: usersData },
    { data: notesData },
  ] = await Promise.all([
    // Callbacks due within the selected range (today by default)
    sb
      .from("leads")
      .select("id,name,phone,next_callback_at,stage_id")
      .eq("owner_id", session.userId)
      .not("next_callback_at", "is", null)
      .gte("next_callback_at", from.toISOString())
      .lte("next_callback_at", to.toISOString())
      .order("next_callback_at", { ascending: true }),
    // ALL call communications by this user in the range
    sb
      .from("communications")
      .select("*")
      .eq("actor_id", session.userId)
      .eq("channel", "call")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: false }),
    sb.from("users").select("id,name").eq("is_active", true),
    sb
      .from("lead_notes")
      .select("id,lead_id,author_id,body,created_at")
      .eq("author_id", session.userId)
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString()),
  ]);

  const upcomingLeads = (callbacksData ?? []) as Pick<
    LeadRow,
    "id" | "name" | "phone" | "next_callback_at" | "stage_id"
  >[];
  const calls = (callsData ?? []) as CommunicationRow[];
  const users = (usersData ?? []) as { id: string; name: string }[];
  const notesByLead = new Map<string, { body: string; created_at: string }[]>();
  for (const n of (notesData ?? []) as {
    lead_id: string;
    body: string;
    created_at: string;
  }[]) {
    const arr = notesByLead.get(n.lead_id) ?? [];
    arr.push({ body: n.body, created_at: n.created_at });
    notesByLead.set(n.lead_id, arr);
  }

  // Fetch names for leads referenced by the calls
  const leadIds = Array.from(
    new Set([...calls.map((c) => c.lead_id), ...upcomingLeads.map((l) => l.id)]),
  );
  const { data: leadsForCalls } =
    leadIds.length > 0
      ? await sb
          .from("leads")
          .select("id,name,phone")
          .in("id", leadIds)
      : { data: [] };
  const leadNameById = new Map<string, string>(
    ((leadsForCalls ?? []) as { id: string; name: string }[]).map((l) => [
      l.id,
      l.name,
    ]),
  );
  const leadPhoneById = new Map<string, string | null>(
    ((leadsForCalls ?? []) as { id: string; name: string; phone: string | null }[]).map(
      (l) => [l.id, l.phone],
    ),
  );

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
        subtitle="Callbacks and call logs. Default view is today (midnight to midnight)."
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
          <StatCard label="Calls made" value={String(totalCalls)} />
          <StatCard
            label="Picked up"
            value={`${answered}${totalCalls ? ` (${Math.round((answered / totalCalls) * 100)}%)` : ""}`}
          />
          <StatCard label="Total duration" value={formatDuration(totalDurationSecs)} />
        </div>

        <CallbacksView
          upcomingLeads={upcomingLeads}
          calls={calls}
          leadNameById={Object.fromEntries(leadNameById)}
          leadPhoneById={Object.fromEntries(leadPhoneById)}
          notesByLead={Object.fromEntries(notesByLead)}
          actorNamesById={Object.fromEntries(users.map((u) => [u.id, u.name]))}
        />
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
