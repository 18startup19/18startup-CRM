"use client";

import { useEffect, useState, useTransition } from "react";
import { Phone, PhoneOff, Mail, User } from "lucide-react";
import { createNoteAction } from "@/app/actions/leads";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/card";

interface Lead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export function ActiveCallCard({
  lead,
  onClose,
}: {
  lead: Lead;
  onClose: () => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  useEffect(() => {
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  function saveNote() {
    const body = note.trim();
    if (!body) return;
    setSavingNote(true);
    const fd = new FormData();
    fd.set("body", body);
    start(async () => {
      try {
        await createNoteAction(lead.id, fd);
        setNote("");
        toast("Note added.");
      } catch {
        toast("Failed to add note.", "error");
      } finally {
        setSavingNote(false);
      }
    });
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 w-[360px] bg-white border border-brand-border rounded-[14px] shadow-2xl overflow-hidden animate-[slide-up_180ms_ease-out]">
      <div className="px-4 py-3 bg-brand-orange text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white/60 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          </span>
          <Phone size={14} />
          <span className="text-[12px] font-bold uppercase tracking-[0.5px]">
            Call in progress · {mm}:{ss}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-white/80 hover:text-white transition-colors"
          title="End / dismiss"
        >
          <PhoneOff size={14} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-orange/10 flex items-center justify-center text-brand-orange shrink-0">
            <User size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-brand-charcoal text-[15px] truncate">
              {lead.name}
            </div>
            {lead.phone && (
              <div className="text-[12.5px] text-brand-dark-text flex items-center gap-1.5 mt-0.5">
                <Phone size={11} />
                {lead.phone}
              </div>
            )}
            {lead.email && (
              <div className="text-[12.5px] text-brand-dark-text flex items-center gap-1.5">
                <Mail size={11} />
                {lead.email}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text mb-1.5 block">
            Add a note
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What are they saying?"
            rows={2}
            className="!py-2 !min-h-[60px]"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={onClose}
            disabled={pending || savingNote}
          >
            Close
          </Button>
          <Button
            size="sm"
            type="button"
            onClick={saveNote}
            loading={pending || savingNote}
            disabled={!note.trim()}
          >
            Add note
          </Button>
        </div>
      </div>
    </div>
  );
}
