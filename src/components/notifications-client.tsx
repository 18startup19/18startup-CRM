"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import { markNotificationsReadAction } from "@/app/actions/notifications";

interface NotificationItem {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
}

export function NotificationsClient({ items }: { items: NotificationItem[] }) {
  const { toast } = useToast();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    for (const item of items) {
      toast(renderMessage(item), "info");
    }
    void markNotificationsReadAction(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function renderMessage(item: NotificationItem): string {
  const p = item.payload ?? {};
  switch (item.kind) {
    case "lead_assigned":
      return `New lead assigned: ${p.lead_name ?? "a lead"}${
        p.assigned_by ? ` (by ${p.assigned_by})` : ""
      }`;
    default:
      return item.kind.replace(/_/g, " ");
  }
}
