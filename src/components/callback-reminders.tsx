"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Clock, Phone, X } from "lucide-react";
import {
  getDueCallbacksAction,
  type DueCallback,
} from "@/app/actions/callback-reminders";
import { formatDateTime } from "@/lib/utils";

// Poll every minute for callbacks due for the currently signed-in owner.
// Persistent bottom-right cards until dismissed or snoozed. Client-side
// only — nothing here writes to the DB (Dismiss/Snooze are local).
const POLL_MS = 60_000;
const SNOOZE_MS = 5 * 60_000;

export function CallbackReminders() {
  const [dueList, setDueList] = useState<DueCallback[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    try {
      const list = await getDueCallbacksAction();
      setDueList(list);
    } catch {
      // Signed out / redirect / network flake — skip this tick silently
      // so a bad request doesn't spam the console every minute.
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const visible = useMemo(() => {
    const now = Date.now();
    return dueList.filter((c) => {
      if (dismissedIds.has(c.leadId)) return false;
      const snoozedTs = snoozedUntil[c.leadId];
      if (snoozedTs && now < snoozedTs) return false;
      return true;
    });
  }, [dueList, dismissedIds, snoozedUntil]);

  if (visible.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-[340px]">
      {visible.map((c) => (
        <ReminderCard
          key={c.leadId}
          reminder={c}
          onDismiss={() =>
            setDismissedIds((prev) => {
              const next = new Set(prev);
              next.add(c.leadId);
              return next;
            })
          }
          onSnooze={() =>
            setSnoozedUntil((prev) => ({
              ...prev,
              [c.leadId]: Date.now() + SNOOZE_MS,
            }))
          }
        />
      ))}
    </div>
  );
}

function ReminderCard({
  reminder,
  onDismiss,
  onSnooze,
}: {
  reminder: DueCallback;
  onDismiss: () => void;
  onSnooze: () => void;
}) {
  return (
    <div className="bg-white border-2 border-brand-orange rounded-[12px] shadow-lg p-3 flex flex-col gap-2 animate-in slide-in-from-right">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bell size={14} className="text-brand-orange" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-orange">
            Callback due
          </div>
          <Link
            href={`/leads/${reminder.leadId}`}
            className="block text-[14px] font-bold text-brand-charcoal hover:text-brand-orange leading-tight truncate"
          >
            {reminder.leadName}
          </Link>
          {reminder.leadPhone && (
            <div className="text-[12px] text-brand-dark-text mt-0.5 flex items-center gap-1">
              <Phone size={10} />
              <span className="truncate">{reminder.leadPhone}</span>
            </div>
          )}
          <div className="text-[11px] text-brand-dark-text mt-0.5 flex items-center gap-1">
            <Clock size={10} />
            <span>{formatDateTime(reminder.scheduledAtIso)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded hover:bg-brand-bg text-brand-dark-text hover:text-red-500"
          title="Dismiss (won't show again this session)"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center gap-2 pl-10">
        <Link
          href={`/leads/${reminder.leadId}`}
          className="text-[11.5px] font-bold text-brand-orange hover:text-brand-orange-dark"
        >
          Open lead →
        </Link>
        <span className="text-brand-dark-text text-[11px]">·</span>
        <button
          type="button"
          onClick={onSnooze}
          className="text-[11.5px] font-bold text-brand-dark-text hover:text-brand-charcoal"
        >
          Snooze 5 min
        </button>
      </div>
    </div>
  );
}
