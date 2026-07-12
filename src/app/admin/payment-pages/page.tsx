import { PageHeader } from "@/components/page-header";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { PaymentPagesManager } from "@/components/admin/payment-pages-manager";
import type {
  CohortRow,
  LeadStageRow,
  PaymentPageRow,
  PipelineRow,
  UserRow,
} from "@/lib/database.types";

export default async function AdminPaymentPagesPage() {
  const sb = supabaseAdmin();

  const [
    { data: pagesData },
    { data: cohortsData },
    { data: pipelinesData },
    { data: stagesData },
    { data: usersData },
  ] = await Promise.all([
    sb.from("payment_pages").select("*").order("created_at", { ascending: false }),
    sb.from("cohorts").select("id,number,label").eq("is_active", true).order("number"),
    sb.from("pipelines").select("id,name").order("name"),
    sb
      .from("lead_stages")
      .select("id,name,pipeline_id,color")
      .eq("is_archived", false)
      .order("position"),
    sb
      .from("users")
      .select("id,name,email")
      .eq("is_active", true)
      .order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="Payment Pages"
        subtitle="Create a payment page and paste its URL into your website buttons. Each page defines the price, the buyer form, and where the resulting lead lands in the CRM. Payments are processed by Razorpay."
      />
      <div className="p-8">
        <PaymentPagesManager
          pages={(pagesData ?? []) as PaymentPageRow[]}
          cohorts={
            (cohortsData ?? []) as Pick<CohortRow, "id" | "number" | "label">[]
          }
          pipelines={(pipelinesData ?? []) as Pick<PipelineRow, "id" | "name">[]}
          stages={
            (stagesData ?? []) as Pick<
              LeadStageRow,
              "id" | "name" | "pipeline_id" | "color"
            >[]
          }
          users={(usersData ?? []) as Pick<UserRow, "id" | "name" | "email">[]}
        />
      </div>
    </>
  );
}
