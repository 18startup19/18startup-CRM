"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface Props {
  name: string;
  defaultValue?: string[];
  placeholder?: string;
  id?: string;
}

export function TagChipInput({ name, defaultValue = [], placeholder, id }: Props) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTags(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue.join("|")]);

  function commit(raw?: string) {
    const source = raw ?? draft;
    const clean = source.trim();
    if (!clean) return;
    if (tags.includes(clean)) {
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
        onBlur={() => commit()}
        className="flex-1 min-w-[80px] bg-transparent outline-none text-[13.5px] py-1"
      />
      {/* Hidden field mirrors the tags as a comma-separated string for the form */}
      <input type="hidden" name={name} value={tags.join(",")} />
    </div>
  );
}
