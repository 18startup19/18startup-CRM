"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";

// Card whose body starts collapsed and expands on click. Used on the
// Integrations page so long docs (LMS onboarding, etc.) don't dominate
// the grid — admins click into the one they care about.
export function CollapsibleCard({
  title,
  summary,
  headerRight,
  children,
  defaultOpen = false,
}: {
  title: string;
  summary?: string;
  headerRight?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card
      className={`p-0 overflow-hidden md:col-span-2 transition-colors ${
        open ? "" : "hover:border-brand-orange cursor-pointer"
      }`}
      onClick={open ? undefined : () => setOpen(true)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-6 py-4 flex items-start justify-between gap-4 flex-wrap"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-brand-charcoal">{title}</h3>
            <ChevronDown
              size={14}
              className={`text-brand-dark-text transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
          {summary && (
            <p className="text-[12.5px] text-brand-dark-text mt-1">
              {summary}
            </p>
          )}
        </div>
        {headerRight && (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {headerRight}
          </div>
        )}
      </button>
      {open && (
        <div
          className="px-6 pb-6 border-t border-brand-border"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </Card>
  );
}
