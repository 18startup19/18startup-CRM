import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/page-header";
import { EmailTemplatesManager } from "@/components/admin/email-templates-manager";
import type { EmailTemplateRow } from "@/lib/database.types";

export default async function EmailTemplatesPage() {
  const sb = supabaseAdmin();
  // Include archived rows so the manager can render a Restore section.
  const { data } = await sb
    .from("email_templates")
    .select("*")
    .order("created_at", { ascending: false });
  const templates = (data ?? []) as EmailTemplateRow[];
  return (
    <>
      <PageHeader
        title="Email templates"
        subtitle="Use {{name}}, {{email}}, {{phone}}, {{custom.key}} tokens for interpolation."
      />
      <div className="p-8">
        <EmailTemplatesManager templates={templates} />
      </div>
    </>
  );
}
