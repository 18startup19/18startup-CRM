"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  name: string;
  defaultValue?: string[];
  placeholder?: string;
  id?: string;
  suggestions?: string[];
}

export function TagChipInput({
  name,
  defaultValue = [],
  placeholder,
  id,
  suggestions = [],
}: Props) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTags(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue.join("|")]);

  const filteredSuggestions = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const existing = new Set(tags.map((t) => t.toLowerCase()));
    return suggestions
      .filter((s) => !existing.has(s.toLowerCase()))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 8);
  }, [draft, tags, suggestions]);

  function commit(raw?: string) {
    const source = raw ?? draft;
    const clean = source.trim();
    if (!clean) return;
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setDraft("");
      return;
    }
    setTags((prev) => [...prev, clean]);
    setDraft("");
  }

  function removeAt(i: number) {
    setTags((prev) => prev.filter((_, idx) => idx !== i));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      e.preventDefault();
      removeAt(tags.length - 1);
    }
  }

  return (
    <div className="relative">
      <div
        className="w-full min-h-[48px] px-3 py-2 rounded-[10px] border-[1.5px] border-brand-border bg-brand-bg text-brand-charcoal text-[14px] outline-none transition-colors duration-200 focus-within:bg-white focus-within:border-brand-orange flex flex-wrap items-center gap-1.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t, i) => (
          <span
            key={`${t}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand-orange/10 text-brand-orange text-[12px] font-bold"
          >
            {t}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
              className="hover:text-brand-orange-dark"
              aria-label={`Remove ${t}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={draft}
          placeholder={tags.length === 0 ? placeholder : ""}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Delay so the click on a suggestion registers first.
            setTimeout(() => {
              setShowSuggestions(false);
              commit();
            }, 120);
          }}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-[13.5px] py-1"
        />
        <input type="hidden" name={name} value={tags.join(",")} />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-full max-h-56 overflow-y-auto z-20 bg-white border border-brand-border rounded-[10px] shadow-lg py-1">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                commit(s);
              }}
              className="w-full text-left px-3 py-1.5 text-[13.5px] hover:bg-brand-bg text-brand-charcoal"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
