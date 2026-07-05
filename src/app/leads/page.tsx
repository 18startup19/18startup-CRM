import { redirect } from "next/navigation";
import { requireSession } from "@/lib/rbac-server";

export default async function LeadsPage() {
  await requireSession();
  redirect("/leads/kanban");
}
