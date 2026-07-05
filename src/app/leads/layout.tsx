import { AppShell } from "@/components/app-shell";
import { NotificationsBridge } from "@/components/notifications-bridge";
import { requireSession } from "@/lib/rbac-server";

export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell session={session} section="leads">
      <NotificationsBridge />
      {children}
    </AppShell>
  );
}
