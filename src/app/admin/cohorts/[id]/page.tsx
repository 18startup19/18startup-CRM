import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, IndianRupee, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  GroupedPaymentTable,
  type LeadGroup,
} from "@/components/leads/grouped-payment-table";
import {
  ExportCohortCsvButton,
  type CsvRow,
} from "@/components/admin/export-cohort-csv-button";
import type { OnboardingState } from "@/components/leads/onboard-lms-button";
import type {
  CohortRow,
  LeadAmountRow,
  LeadLmsOnboardingRow,
  LeadRow,
  UserRow,
} from "@/lib/database.types";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function CohortDetailPage({ params }: Params) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: cohort } = await sb
    .from("cohorts")
    .select("*")
    .eq("id", id)
    .maybeSingle<CohortRow>();
  if (!cohort) notFound();

  const { data: amountsData } = await sb
    .from("lead_amounts")
    .select("id,lead_id,actor_id,amount,note,cohort_number,created_at")
    .eq("cohort_number", cohort.number)
    .order("created_at", { ascending: false });
  const amounts = (amountsData ?? []) as LeadAmountRow[];

  const leadIds = Array.from(new Set(amounts.map((a) => a.lead_id)));
  const actorIds = Array.from(
    new Set(amounts.map((a) => a.actor_id).filter((v): v is string => !!v)),
  );

  const [{ data: leadsData }, { data: usersData }] = await Promise.all([
    leadIds.length
      ? sb
          .from("leads")
          .select("id,name,phone,email,source,custom")
          .in("id", leadIds)
      : Promise.resolve({ data: [] }),
    actorIds.length
      ? sb.from("users").select("id,name").in("id", actorIds)
      : Promise.resolve({ data: [] }),
  ]);
  const leadById = new Map(
    (
      (leadsData ?? []) as Pick<
        LeadRow,
        "id" | "name" | "phone" | "email" | "source" | "custom"
      >[]
    ).map((l) => [l.id, l]),
  );
  const userById = new Map(
    ((usersData ?? []) as Pick<UserRow, "id" | "name">[]).map((u) => [u.id, u.name]),
  );

  const total = amounts.reduce((sum, a) => sum + Number(a.amount), 0);

  // LMS onboarding status per lead for this cohort.
  const { data: onboardingsData } = leadIds.length
    ? await sb
        .from("lead_lms_onboardings")
        .select("lead_id,status,sent_at,error")
        .eq("cohort_id", cohort.id)
        .in("lead_id", leadIds)
    : { data: [] as Pick<
        LeadLmsOnboardingRow,
        "lead_id" | "status" | "sent_at" | "error"
      >[] };
  const onboardingByLead = new Map<string, OnboardingState>();
  for (const o of (onboardingsData ?? []) as Pick<
    LeadLmsOnboardingRow,
    "lead_id" | "status" | "sent_at" | "error"
  >[]) {
    onboardingByLead.set(o.lead_id, {
      status: o.status === "pending" ? null : o.status,
      sentAt: o.sent_at,
      error: o.error,
    });
  }

  // Multiple payments from the same lead — collapse into one row that
  // expands inline on click.
  const groups = new Map<string, LeadGroup>();
  for (const a of amounts) {
    const lead = leadById.get(a.lead_id);
    const existing = groups.get(a.lead_id);
    const p = {
      id: a.id,
      amount: Number(a.amount),
      note: a.note,
      cohort_number: a.cohort_number,
      created_at: a.created_at,
      actor_id: a.actor_id,
      actorName: a.actor_id ? userById.get(a.actor_id) ?? "" : "",
    };
    if (existing) {
      existing.payments.push(p);
    } else {
      groups.set(a.lead_id, {
        leadId: a.lead_id,
        leadName: lead?.name ?? "Unknown lead",
        leadPhone: lead?.phone ?? null,
        payments: [p],
      });
    }
  }
  const leadGroups = Array.from(groups.values()).sort(
    (a, b) => (a.payments[0].created_at < b.payments[0].created_at ? 1 : -1),
  );

  // Clubbed rows for the CSV: one row per lead, with the summed amount.
  // City lives in the lead's JSONB `custom` field (from the "city" custom
  // field the CRM lets admins define); fall back to blank when absent.
  const csvRows: CsvRow[] = leadGroups.map((g) => {
    const lead = leadById.get(g.leadId);
    const custom = (lead?.custom ?? {}) as Record<string, unknown>;
    const cityRaw =
      custom.city ?? custom.City ?? custom.location ?? custom.Location;
    const totalAmount = g.payments.reduce((s, p) => s + p.amount, 0);
    return {
      name: lead?.name ?? "Unknown",
      phone: lead?.phone ?? "",
      email: lead?.email ?? "",
      city: cityRaw != null ? String(cityRaw) : "",
      source: lead?.source ?? "",
      total_amount: totalAmount,
    };
  });
  const csvFilename = `cohort-${cohort.number}-leads.csv`;

  return (
    <>
      <PageHeader
        title={`Cohort ${cohort.number}`}
        subtitle={cohort.label ?? "Converted leads recorded against this cohort."}
      />
      <div className="p-8 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link
            href="/admin/cohorts"
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand-dark-text hover:text-brand-charcoal"
          >
            <ArrowLeft size={14} />
            Back to Cohort Onboarding
          </Link>
          <ExportCohortCsvButton filename={csvFilename} rows={csvRows} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Stat icon={<Users size={14} />} label="Converted leads" value={String(leadIds.length)} />
          <Stat
            icon={<IndianRupee size={14} />}
            label="Amount"
            value={`₹${total.toLocaleString("en-IN")}`}
          />
        </div>

        <GroupedPaymentTable
          groups={leadGroups}
          editable={false}
          emptyLabel="No converted leads recorded against this cohort yet."
          onboarding={{
            cohortId: cohort.id,
            byLeadId: onboardingByLead,
          }}
        />
        {!cohort.lms_cohort_id && (
          <div className="rounded-[10px] bg-red-50 border border-red-200 px-4 py-3 text-[12.5px] text-red-700">
            <strong>Heads up:</strong> This cohort has no <code>lms_cohort_id</code>{" "}
            set — LMS onboarding will fail until you add one from{" "}
            <Link href="/admin/cohorts" className="underline font-bold">
              Cohort Onboarding
            </Link>
            .
          </div>
        )}
      </div>
    </>
  );
}

function Stat({
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
      <div className="text-[22px] font-black text-brand-charcoal mt-1">{value}</div>
    </Card>
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
