"use client";

import { useRouter } from "next/navigation";

interface Props {
  current: string;
  fromStr: string;
  toStr: string;
}

const RANGES = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom" },
];

export function CallbacksRangePicker({ current, fromStr, toStr }: Props) {
  const router = useRouter();

  function updateParams(patch: Record<string, string>) {
    const url = new URL(window.location.href);
    for (const [k, v] of Object.entries(patch)) {
      if (v) url.searchParams.set(k, v);
      else url.searchParams.delete(k);
    }
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={current}
        onChange={(e) =>
          updateParams({
            range: e.target.value,
            ...(e.target.value === "custom" ? {} : { from: "", to: "" }),
          })
        }
        className="appearance-none px-3 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] font-semibold text-brand-charcoal outline-none pr-8"
      >
        {RANGES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {current === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            defaultValue={fromStr}
            onBlur={(e) => updateParams({ from: e.target.value })}
            className="px-2 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none"
          />
          <span className="text-[12px] text-brand-dark-text">→</span>
          <input
            type="date"
            defaultValue={toStr}
            onBlur={(e) => updateParams({ to: e.target.value })}
            className="px-2 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none"
          />
        </div>
      )}
    </div>
  );
}
