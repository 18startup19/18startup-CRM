import { AppShell } from "@/components/app-shell";
import { NotificationsBridge } from "@/components/notifications-bridge";
import { WhatsAppInboundToaster } from "@/components/wa-inbound-toaster";
import { requireAdmin } from "@/lib/rbac-server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <AppShell session={session} section="admin">
      <NotificationsBridge />
      <WhatsAppInboundToaster />
      {children}
    </AppShell>
  );
}
