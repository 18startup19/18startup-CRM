"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { markNotificationsReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

interface NotificationItem {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
}

// Renders bulk lead-assigned notifications as a single centered popup instead
// of N toasts. Other kinds still fall back to per-item toasts.
export function NotificationsClient({ items }: { items: NotificationItem[] }) {
  const { toast } = useToast();
  const fired = useRef(false);
  const [assignmentModal, setAssignmentModal] = useState<{
    count: number;
    assignedBy: string | null;
    ids: string[];
  } | null>(null);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // Split by kind so we can aggregate the lead-assigned batch.
    const assigned = items.filter((i) => i.kind === "lead_assigned");
    const other = items.filter((i) => i.kind !== "lead_assigned");

    if (assigned.length > 0) {
      const byName = new Map<string, number>();
      for (const a of assigned) {
        const name =
          typeof a.payload?.assigned_by === "string"
            ? (a.payload.assigned_by as string)
            : "your admin";
        byName.set(name, (byName.get(name) ?? 0) + 1);
      }
      // Pick the largest assigner as the label; edge case where different
      // people assign in the same window is rare.
      const [assignedBy] =
        Array.from(byName.entries()).sort((a, b) => b[1] - a[1])[0] ?? [null];
      setAssignmentModal({
        count: assigned.length,
        assignedBy,
        ids: assigned.map((a) => a.id),
      });
    }

    for (const item of other) toast(renderOtherMessage(item), "info");
    if (other.length > 0) {
      void markNotificationsReadAction(other.map((i) => i.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function dismiss() {
    if (!assignmentModal) return;
    void markNotificationsReadAction(assignmentModal.ids);
    setAssignmentModal(null);
  }

  if (!assignmentModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onClick={dismiss}
    >
      <div
        className="bg-white rounded-[16px] shadow-2xl w-full max-w-[420px] p-6 animate-[slide-up_180ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-brand-orange/10 flex items-center justify-center text-brand-orange">
            <Bell size={16} />
          </div>
          <div className="text-[15px] font-bold text-brand-charcoal">
            New leads assigned
          </div>
        </div>
        <p className="text-[14px] text-brand-dark-text">
          {assignmentModal.count === 1
            ? "You have 1 new lead assigned"
            : `You have ${assignmentModal.count} new leads assigned`}
          {assignmentModal.assignedBy
            ? ` by ${assignmentModal.assignedBy}.`
            : "."}{" "}
          Head to Kanban to start working on them.
        </p>
        <div className="flex justify-end mt-5">
          <Button size="md" onClick={dismiss}>
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}

function renderOtherMessage(item: NotificationItem): string {
  return item.kind.replace(/_/g, " ");
}
