import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/page-header";
import { FieldsManager } from "@/components/admin/fields-manager";
import type { CustomFieldRow } from "@/lib/database.types";

export default async function FieldsPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("custom_fields")
    .select("*")
    .eq("is_archived", false)
    .order("position", { ascending: true });
  const fields = (data ?? []) as CustomFieldRow[];
  return (
    <>
      <PageHeader
        title="Custom fields"
        subtitle="Add fields to the lead record. They show up in create/edit forms and in filters."
      />
      <div className="p-8">
        <FieldsManager fields={fields} />
      </div>
    </>
  );
}
