import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { PageHeader } from "@/components/page-header";
import { LeadForm } from "@/components/leads/lead-form";
import { getTagSuggestions } from "@/lib/tag-suggestions";
import type { CustomFieldRow, LeadStageRow, UserRow } from "@/lib/database.types";

export default async function NewLeadPage() {
  const session = await requireSession();
  const sb = supabaseAdmin();
  const [s, f, u, tagSuggestions] = await Promise.all([
    sb.from("lead_stages").select("*").eq("is_archived", false).order("position"),
    sb.from("custom_fields").select("*").eq("is_archived", false).order("position"),
    sb.from("users").select("id,name,email").eq("is_active", true),
    getTagSuggestions(),
  ]);
  return (
    <>
      <PageHeader title="New lead" subtitle="Add a lead manually." />
      <div className="p-8 max-w-[720px]">
        <LeadForm
          stages={(s.data ?? []) as LeadStageRow[]}
          fields={(f.data ?? []) as CustomFieldRow[]}
          users={(u.data ?? []) as Pick<UserRow, "id" | "name" | "email">[]}
          currentUserId={session.userId}
          tagSuggestions={tagSuggestions}
        />
      </div>
    </>
  );
}
