import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/page-header";
import { WorkflowsManager } from "@/components/admin/workflows-manager";
import type {
  CustomFieldRow,
  EmailTemplateRow,
  LeadStageRow,
  UserRow,
  WhatsAppTemplateRow,
  WorkflowRuleRow,
} from "@/lib/database.types";

export default async function WorkflowsPage() {
  const sb = supabaseAdmin();
  const [w, s, u, e, wa, cf] = await Promise.all([
    sb.from("workflow_rules").select("*").order("created_at", { ascending: false }),
    sb.from("lead_stages").select("*").eq("is_archived", false).order("position"),
    sb.from("users").select("*").eq("is_active", true),
    sb.from("email_templates").select("*").eq("is_archived", false),
    sb.from("whatsapp_templates").select("*").eq("is_active", true),
    sb.from("custom_fields").select("*").eq("is_archived", false).order("position"),
  ]);
  return (
    <>
      <PageHeader
        title="Workflows"
        subtitle="When something happens (trigger) → check conditions → run an action."
      />
      <div className="p-8">
        <WorkflowsManager
          workflows={(w.data ?? []) as WorkflowRuleRow[]}
          stages={(s.data ?? []) as LeadStageRow[]}
          users={(u.data ?? []) as UserRow[]}
          emailTemplates={(e.data ?? []) as EmailTemplateRow[]}
          whatsappTemplates={(wa.data ?? []) as WhatsAppTemplateRow[]}
          customFields={(cf.data ?? []) as CustomFieldRow[]}
        />
      </div>
    </>
  );
}
