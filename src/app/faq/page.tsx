import { PageHeader } from "@/components/page-header";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireSession } from "@/lib/rbac-server";
import { FaqManager } from "@/components/faq-manager";
import type { FaqTemplateRow } from "@/lib/database.types";

export default async function FaqPage() {
  const session = await requireSession();
  const sb = supabaseAdmin();

  // Show templates the user owns + team-wide shared ones (owner_id is null).
  const { data } = await sb
    .from("faq_templates")
    .select("*")
    .eq("is_archived", false)
    .or(`owner_id.eq.${session.userId},owner_id.is.null`)
    .order("created_at", { ascending: false });

  const templates = (data ?? []) as FaqTemplateRow[];

  return (
    <>
      <PageHeader
        title="FAQ templates"
        subtitle="Quick reusable snippets for WhatsApp free text and email. Personal by default, tick 'Share with team' to make one visible to everyone."
      />
      <div className="p-8">
        <FaqManager
          templates={templates}
          currentUserId={session.userId}
          isAdmin={session.role === "admin"}
        />
      </div>
    </>
  );
}
