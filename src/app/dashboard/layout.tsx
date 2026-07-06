import { AppShell } from "@/components/app-shell";
import { NotificationsBridge } from "@/components/notifications-bridge";
import { ActiveCallMount } from "@/components/leads/active-call-mount";
import { requireSession } from "@/lib/rbac-server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <AppShell session={session} section="leads">
      <NotificationsBridge />
      <ActiveCallMount />
      {children}
    </AppShell>
  );
}
