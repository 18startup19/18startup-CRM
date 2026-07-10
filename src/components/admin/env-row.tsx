"use client";

import { useState } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";

// Displays an env-var-style row on the admin Integrations page. Secrets
// are masked by default with a reveal toggle, and every row has a copy
// button so admins don't have to select-and-copy long tokens.
export function EnvRow({
  name,
  value,
  secret = false,
  hint,
}: {
  name: string;
  value: string;
  secret?: boolean;
  hint?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayValue = !value
    ? "— not set —"
    : secret && !revealed
      ? maskSecret(value)
      : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (rare) — no-op; admins can still select the text.
    }
  }

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="text-[12px] font-mono font-bold text-brand-charcoal shrink-0">
          {name}
        </code>
        <code className="flex-1 min-w-0 text-[12px] bg-brand-bg border border-brand-border rounded px-3 py-1.5 font-mono break-all">
          {displayValue}
        </code>
        {secret && value && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-dark-text hover:text-brand-charcoal px-2 py-1"
            title={revealed ? "Hide" : "Reveal"}
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
            {revealed ? "Hide" : "Reveal"}
          </button>
        )}
        {value && (
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 text-[11.5px] font-bold text-brand-orange hover:text-brand-orange-dark px-2 py-1"
            title="Copy"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {hint && (
        <p className="text-[11.5px] text-brand-dark-text mt-1 ml-1">{hint}</p>
      )}
    </div>
  );
}

function maskSecret(v: string): string {
  if (v.length <= 8) return "•".repeat(v.length);
  return v.slice(0, 4) + "•".repeat(Math.max(8, v.length - 8)) + v.slice(-4);
}
