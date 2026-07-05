import { AppShell } from "@/components/app-shell";
import { NotificationsBridge } from "@/components/notifications-bridge";
import { requireAdmin } from "@/lib/rbac-server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <AppShell session={session} section="admin">
      <NotificationsBridge />
      {children}
    </AppShell>
  );
}
