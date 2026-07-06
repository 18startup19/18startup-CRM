import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Team members + managers land on Kanban; admins land on the admin console.
  redirect(session.role === "admin" ? "/admin" : "/leads/kanban");
}
