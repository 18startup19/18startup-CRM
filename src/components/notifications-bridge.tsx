import { fetchUnreadNotifications } from "@/app/actions/notifications";
import { NotificationsClient } from "./notifications-client";

export async function NotificationsBridge() {
  const rows = await fetchUnreadNotifications();
  if (rows.length === 0) return null;
  return (
    <NotificationsClient
      items={rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        payload: n.payload,
      }))}
    />
  );
}
