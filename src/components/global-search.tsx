"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  User,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Loader2,
} from "lucide-react";
import { globalSearchAction, type SearchHit } from "@/app/actions/search";
import { formatRelative } from "@/lib/utils";

const KIND_ICON: Record<SearchHit["kind"], typeof User> = {
  lead: User,
  email: Mail,
  whatsapp: MessageSquare,
  call: Phone,
  note: StickyNote,
};

const KIND_LABEL: Record<SearchHit["kind"], string> = {
  lead: "Lead",
  email: "Email",
  whatsapp: "WhatsApp",
  call: "Call",
  note: "Note",
};

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      start(async () => {
        const results = await globalSearchAction(q);
        setHits(results);
      });
    }, 250);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [q]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(hit: SearchHit) {
    setOpen(false);
    setQ("");
    router.push(`/leads/${hit.leadId}`);
  }

  return (
    <div ref={wrapRef} className="relative w-full max-w-[520px]">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark-text"
        />
        <input
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          placeholder="Search leads, emails, WhatsApp, notes…"
          className="w-full pl-8 pr-9 py-2 rounded-[10px] border-[1.5px] border-brand-border bg-white text-[13.5px] outline-none focus:border-brand-orange transition-colors"
        />
        {pending && (
          <Loader2
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-orange animate-spin"
          />
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-30 bg-white border border-brand-border rounded-[12px] shadow-xl max-h-[420px] overflow-y-auto animate-fade-in">
          {hits.length === 0 && !pending && (
            <div className="px-4 py-6 text-center text-brand-dark-text text-[13px]">
              No matches.
            </div>
          )}
          {hits.length === 0 && pending && (
            <div className="px-4 py-6 text-center text-brand-dark-text text-[13px]">
              Searching…
            </div>
          )}
          <ul>
            {hits.map((h, i) => {
              const Icon = KIND_ICON[h.kind];
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => pick(h)}
                    className="w-full text-left px-4 py-2.5 hover:bg-brand-bg flex items-start gap-3 border-b border-brand-border last:border-none transition-colors"
                  >
                    <span className="mt-0.5 text-brand-dark-text shrink-0">
                      <Icon size={14} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-brand-charcoal truncate">
                          {h.leadName}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.4px] text-brand-dark-text bg-brand-bg px-1.5 py-0.5 rounded-full">
                          {KIND_LABEL[h.kind]}
                        </span>
                      </span>
                      <span className="block text-[12px] text-brand-dark-text truncate mt-0.5">
                        {h.snippet}
                      </span>
                    </span>
                    {h.when && (
                      <span className="text-[11px] text-brand-dark-text shrink-0 mt-0.5">
                        {formatRelative(h.when)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
