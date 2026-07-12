"use client";

import { useState, useTransition } from "react";
import { Card, FieldError, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { updateFallbackStageAction } from "@/app/actions/routing";

export interface StageOption {
  id: string;
  name: string;
  color: string;
  pipelineName: string;
}

// Kept for backward compatibility with the server component's data fetch —
// unused fields (rules, razorpayRequireRule, unmatched) are ignored so the
// page.tsx query surface can stay untouched. All Razorpay routing UI was
// removed on user request; payment routing now lives in Payment Pages, and
// Webflow routing lives in the Webflow forms + field mapping card below.
export interface UnmatchedKey {
  source: "razorpay" | "webflow";
  match_value: string;
  count: number;
  last_seen_label: string;
}

interface Props {
  rules?: unknown[];
  stages: StageOption[];
  fallbackStageId: string | null;
  razorpayRequireRule?: boolean;
  unmatched?: UnmatchedKey[];
}

export function RoutingManager({ stages, fallbackStageId }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <FallbackCard stages={stages} fallbackStageId={fallbackStageId} />
    </div>
  );
}

function FallbackCard({
  stages,
  fallbackStageId,
}: {
  stages: StageOption[];
  fallbackStageId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(fallbackStageId ?? "");
  const [flash, setFlash] = useState<null | "saved" | "error">(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateFallbackStageAction(value || null);
      if (res.error) {
        setError(res.error);
        setFlash("error");
      } else {
        setFlash("saved");
        setTimeout(() => setFlash(null), 1500);
      }
    });
  }

  const dirty = (value || null) !== (fallbackStageId ?? null);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-bold text-brand-charcoal">
            Fallback stage
          </h2>
          <p className="text-[12.5px] text-brand-dark-text mt-1">
            Where a Razorpay payment or Webflow submit lands when no rule
            matches. Leave blank to fall back to the leftmost open stage.
          </p>
        </div>
        {flash === "saved" && (
          <span className="text-[12px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            Saved
          </span>
        )}
      </div>
      <div className="mt-4 max-w-[420px]">
        <FieldLabel htmlFor="fallback">Stage</FieldLabel>
        <StageSelect
          id="fallback"
          value={value}
          onChange={setValue}
          stages={stages}
          placeholder="— leftmost open stage —"
        />
      </div>
      {error && (
        <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3 mt-4">
          <FieldError>{error}</FieldError>
        </div>
      )}
      <div className="mt-4">
        <Button type="button" onClick={save} disabled={isPending || !dirty}>
          {isPending ? "Saving…" : dirty ? "Save fallback" : "No changes"}
        </Button>
      </div>
    </Card>
  );
}

function StageSelect({
  id,
  value,
  onChange,
  stages,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  stages: StageOption[];
  placeholder: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[38px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal focus:outline-none focus:border-brand-orange w-full"
    >
      <option value="">{placeholder}</option>
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.pipelineName} · {s.name}
        </option>
      ))}
    </select>
  );
}
