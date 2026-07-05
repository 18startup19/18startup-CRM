import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/page-header";
import { WhatsAppTemplatesManager } from "@/components/admin/whatsapp-templates-manager";
import type { WhatsAppTemplateRow } from "@/lib/database.types";

export default async function WhatsAppTemplatesPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("whatsapp_templates")
    .select("*")
    .order("created_at", { ascending: false });
  const templates = (data ?? []) as WhatsAppTemplateRow[];
  return (
    <>
      <PageHeader
        title="WhatsApp templates"
        subtitle="Mirror your BSP-approved templates here. Body uses {{1}}, {{2}}, … which map to the ordered variables."
      />
      <div className="p-8">
        <WhatsAppTemplatesManager templates={templates} />
      </div>
    </>
  );
}
