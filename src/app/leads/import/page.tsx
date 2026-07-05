import { PageHeader } from "@/components/page-header";
import { requireSession } from "@/lib/rbac-server";
import { ImportForm } from "@/components/leads/import-form";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CustomFieldRow } from "@/lib/database.types";

export default async function ImportPage() {
  await requireSession();
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("custom_fields")
    .select("*")
    .eq("is_archived", false)
    .order("position");
  const fields = (data ?? []) as CustomFieldRow[];

  return (
    <>
      <PageHeader
        title="Import leads"
        subtitle="Download the template, fill it in, then upload. Pipelines and stages are auto-created."
      />
      <div className="p-8 max-w-[640px]">
        <ImportForm fields={fields} />
      </div>
    </>
  );
}
