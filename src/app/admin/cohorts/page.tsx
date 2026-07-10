import { PageHeader } from "@/components/page-header";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { CohortsManager, type TemplateOption } from "@/components/admin/cohorts-manager";
import type {
  CohortRow,
  LeadAmountRow,
  LmsSettingsRow,
} from "@/lib/database.types";

export default async function AdminCohortsPage() {
  const sb = supabaseAdmin();

  // Cohorts + per-cohort payment summary + active templates + the single
  // global onboarding-template picks.
  const [
    { data: cohortsData },
    { data: amountsData },
    { data: waTemplateData },
    { data: emailTemplateData },
    { data: settingsData },
  ] = await Promise.all([
    sb.from("cohorts").select("*").order("number", { ascending: false }),
    sb
      .from("lead_amounts")
      .select("cohort_number,amount,lead_id")
      .not("cohort_number", "is", null),
    sb
      .from("whatsapp_templates")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    sb
      .from("email_templates")
      .select("id,name")
      .eq("is_archived", false)
      .order("name"),
    sb
      .from("lms_settings")
      .select("whatsapp_template_id,email_template_id")
      .eq("id", 1)
      .maybeSingle<
        Pick<LmsSettingsRow, "whatsapp_template_id" | "email_template_id">
      >(),
  ]);

  const cohorts = (cohortsData ?? []) as CohortRow[];
  const amounts = (amountsData ?? []) as Pick<
    LeadAmountRow,
    "cohort_number" | "amount" | "lead_id"
  >[];

  // Count distinct leads (not payments) so multiple payments from the same
  // lead don't inflate the cohort "leads" number.
  const stats = new Map<
    string,
    { leadIds: Set<string>; amount: number }
  >();
  for (const a of amounts) {
    const key = a.cohort_number ?? "";
    if (!key) continue;
    const entry = stats.get(key) ?? { leadIds: new Set<string>(), amount: 0 };
    entry.leadIds.add(a.lead_id);
    entry.amount += Number(a.amount);
    stats.set(key, entry);
  }

  const decorated = cohorts.map((c) => {
    const s = stats.get(c.number);
    return {
      ...c,
      stats: {
        count: s?.leadIds.size ?? 0,
        amount: s?.amount ?? 0,
      },
    };
  });

  return (
    <>
      <PageHeader
        title="Cohort Onboarding"
        subtitle="Cohorts sync automatically from the LMS. Pick the onboarding templates once here — they apply to every cohort."
      />
      <div className="p-8">
        <CohortsManager
          cohorts={decorated}
          waTemplates={(waTemplateData ?? []) as TemplateOption[]}
          emailTemplates={(emailTemplateData ?? []) as TemplateOption[]}
          settings={{
            whatsapp_template_id: settingsData?.whatsapp_template_id ?? null,
            email_template_id: settingsData?.email_template_id ?? null,
          }}
        />
      </div>
    </>
  );
}

