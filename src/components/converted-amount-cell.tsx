"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { updateLeadAmountAction } from "@/app/actions/amounts";
import { useToast } from "@/components/ui/toast";

interface Props {
  amountId: string;
  initialAmount: number;
  initialNote: string | null;
}

export function ConvertedAmountCell({ amountId, initialAmount, initialNote }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(String(initialAmount));
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      toast("Enter a valid amount.", "error");
      return;
    }
    start(async () => {
      const res = await updateLeadAmountAction(amountId, n, initialNote ?? undefined);
      if (res?.error) {
        toast(res.error, "error");
        return;
      }
      setEditing(false);
      toast("Amount updated.");
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div
        className="inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-brand-dark-text">₹</span>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-28 px-2 py-1 rounded-[6px] border border-brand-orange bg-white text-[14px] font-semibold outline-none"
          autoFocus
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          title="Save"
          className="p-1 rounded-[6px] text-brand-orange hover:bg-brand-orange/10"
        >
          <Check size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(String(initialAmount));
            setEditing(false);
          }}
          title="Cancel"
          className="p-1 rounded-[6px] text-brand-dark-text hover:bg-brand-bg"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span>₹{Number(initialAmount).toLocaleString("en-IN")}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setEditing(true);
        }}
        title="Edit amount"
        className="p-1 rounded-[6px] text-brand-dark-text hover:text-brand-orange hover:bg-brand-orange/10 opacity-70 hover:opacity-100"
      >
        <Pencil size={12} />
      </button>
    </span>
  );
}
