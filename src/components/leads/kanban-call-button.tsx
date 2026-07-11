"use client";

import { Phone, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { callAction } from "@/app/actions/comms";
import { useToast } from "@/components/ui/toast";

// Small circular call button rendered inline on Kanban lead cards.
// Suppresses the parent Link's navigation + the card's drag events so
// clicking it stays local to the button.
export function KanbanCallButton({
  leadId,
  phone,
  isDnc,
}: {
  leadId: string;
  phone: string | null;
  isDnc: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function stop(e: React.SyntheticEvent) {
    e.stopPropagation();
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!phone) {
      toast("Add a phone number first.", "error");
      return;
    }
    if (isDnc) {
      toast("Lead is marked do-not-contact.", "error");
      return;
    }
    const fd = new FormData();
    fd.set("agent_phone", "");
    startTransition(async () => {
      const res = await callAction(leadId, fd);
      if (res?.error) toast(res.error, "error");
      else {
        toast("Call started.");
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseDown={stop}
      onDragStart={stop}
      draggable={false}
      disabled={isPending}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand-orange text-white hover:bg-brand-orange-dark disabled:opacity-60 shrink-0 shadow-sm transition-colors"
      title="Call this lead"
      aria-label="Call this lead"
    >
      {isPending ? (
        <Loader2 size={10} className="animate-spin" />
      ) : (
        <Phone size={10} strokeWidth={2.5} />
      )}
    </button>
  );
}
