import { redirect } from "next/navigation";
import { getSession, type Session } from "./session";

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/leads");
  return session;
}

// Admin OR manager — gates the Contacts module and any other "leadership"
// view. Regular members get bounced back to the Kanban.
export async function requireAdminOrManager(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin" && session.role !== "manager") {
    redirect("/leads/kanban");
  }
  return session;
}
