"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { fetchRecentWhatsAppInbound, type InboundPing } from "@/app/actions/wa-inbound";
import { sendWhatsAppAction } from "@/app/actions/comms";
import { useToast } from "@/components/ui/toast";

// Auto-dismiss window (ms). If the reply input has been focused or the user is
// typing, the timer is paused so we don't yank the popup mid-reply.
const AUTO_DISMISS_MS = 5000;
const POLL_MS = 4000;
const SEEN_KEY = "wa_inbound_last_seen";

interface Toast extends InboundPing {
  addedAt: number;
}

export function WhatsAppInboundToaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastSeenRef = useRef<string>(
    typeof window !== "undefined"
      ? window.localStorage.getItem(SEEN_KEY) ?? new Date().toISOString()
      : new Date().toISOString(),
  );
  const shownIdsRef = useRef<Set<string>>(new Set());

  // Poll for new inbound WhatsApp messages every POLL_MS. Skip when the tab
  // is hidden; catch up on `visibilitychange`.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.hidden) return;
      try {
        const pings = await fetchRecentWhatsAppInbound(lastSeenRef.current);
        if (cancelled || pings.length === 0) return;
        const fresh = pings.filter((p) => !shownIdsRef.current.has(p.commId));
        if (fresh.length === 0) return;
        for (const p of fresh) shownIdsRef.current.add(p.commId);
        const now = Date.now();
        setToasts((prev) => [
          ...prev,
          ...fresh.map((p) => ({ ...p, addedAt: now })),
        ]);
        const newestTs = pings[pings.length - 1].createdAt;
        if (newestTs > lastSeenRef.current) {
          lastSeenRef.current = newestTs;
          window.localStorage.setItem(SEEN_KEY, newestTs);
        }
      } catch {
        // Silent — polling failures shouldn't spam toasts.
      }
    }

    const id = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    // First poll immediately so a message received while the user was on
    // another tab still shows up when they return.
    poll();
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const dismiss = useCallback((commId: string) => {
    setToasts((prev) => prev.filter((t) => t.commId !== commId));
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-[360px]">
      {toasts.map((t) => (
        <InboundToast key={t.commId} toast={t} onDismiss={() => dismiss(t.commId)} />
      ))}
    </div>
  );
}

function InboundToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [reply, setReply] = useState("");
  const [pending, start] = useTransition();
  const [interacted, setInteracted] = useState(false);
  const { toast: showToast } = useToast();

  // 5s auto-dismiss, paused once the user starts typing a reply so we don't
  // steal focus mid-thought.
  useEffect(() => {
    if (interacted) return;
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [interacted, onDismiss]);

  function sendReply(e?: React.FormEvent) {
    e?.preventDefault();
    const text = reply.trim();
    if (!text) return;
    const fd = new FormData();
    fd.set("text", text);
    start(async () => {
      try {
        await sendWhatsAppAction(toast.leadId, fd);
        setReply("");
        showToast("Reply sent.");
        onDismiss();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to send.", "error");
      }
    });
  }

  return (
    <div className="bg-white border border-brand-border rounded-[14px] shadow-2xl overflow-hidden animate-[slide-up_180ms_ease-out]">
      <div className="px-4 py-2.5 bg-[#25D366] text-white flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare size={14} className="shrink-0" />
          <span className="text-[12px] font-bold uppercase tracking-[0.5px] truncate">
            New WhatsApp
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-white/80 hover:text-white transition-colors"
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/whatsapp?lead=${toast.leadId}`}
              className="block font-bold text-brand-charcoal text-[14px] truncate hover:text-brand-orange"
            >
              {toast.leadName}
            </Link>
            {toast.leadPhone && (
              <div className="text-[11px] text-brand-dark-text">{toast.leadPhone}</div>
            )}
          </div>
        </div>

        <div className="text-[13px] text-brand-charcoal bg-brand-bg border border-brand-border rounded-[8px] px-2.5 py-2 whitespace-pre-wrap line-clamp-4">
          {toast.body || "—"}
        </div>

        <form
          onSubmit={sendReply}
          className="flex items-end gap-2"
          onFocus={() => setInteracted(true)}
          onClick={() => setInteracted(true)}
        >
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type a reply…"
            disabled={pending}
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendReply();
              }
            }}
            className="flex-1 px-2.5 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none focus:border-brand-orange resize-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !reply.trim()}
            className="w-8 h-8 rounded-full bg-brand-orange text-white flex items-center justify-center hover:bg-brand-orange-dark disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            title="Send reply"
          >
            <Send size={13} />
          </button>
        </form>
      </div>
    </div>
  );
}
