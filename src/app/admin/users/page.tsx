import { supabaseAdmin } from "@/lib/supabase-admin";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "@/components/admin/users-manager";
import type { PipelineRow, UserRow } from "@/lib/database.types";

export default async function UsersPage() {
  const sb = supabaseAdmin();
  const [{ data: userData }, { data: pipelineData }] = await Promise.all([
    sb.from("users").select("*").order("created_at", { ascending: true }),
    sb.from("pipelines").select("*").eq("is_archived", false).order("position"),
  ]);
  const users = (userData ?? []) as UserRow[];
  const pipelines = (pipelineData ?? []) as PipelineRow[];

  return (
    <>
      <PageHeader title="Users" subtitle="Team members with access to the CRM." />
      <div className="p-8">
        <UsersManager users={users} pipelines={pipelines} />
      </div>
    </>
  );
}
