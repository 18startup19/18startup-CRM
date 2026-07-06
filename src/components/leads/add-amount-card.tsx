"use client";

import { useState, useTransition } from "react";
import { IndianRupee, Plus } from "lucide-react";
import { Card, FieldLabel, Input } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addLeadAmountAction } from "@/app/actions/amounts";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";

interface AmountEntry {
  id: string;
  amount: number;
  note: string | null;
  created_at: string;
}

export function AddAmountCard({
  leadId,
  total,
  entries,
}: {
  leadId: string;
  total: number;
  entries: AmountEntry[];
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function submit() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast("Enter a positive amount.", "error");
      return;
    }
    start(async () => {
      const res = await addLeadAmountAction(leadId, n, note);
      if (res.error) toast(res.error, "error");
      else {
        toast(`Added ₹${n.toLocaleString("en-IN")}.`);
        setAmount("");
        setNote("");
      }
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-dark-text">
          Converted amount
        </div>
        <div className="text-[18px] font-black text-brand-charcoal flex items-center">
          <IndianRupee size={15} className="mr-0.5" />
          {total.toLocaleString("en-IN")}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <IndianRupee
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark-text"
            />
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="Amount"
              className="pl-8 !py-2"
            />
          </div>
          <Button
            type="button"
            onClick={submit}
            loading={pending}
            size="sm"
            disabled={!amount.trim()}
          >
            <Plus size={13} className="inline mr-1" /> Add
          </Button>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="!py-2 text-[12.5px]"
        />
      </div>

      {entries.length > 0 && (
        <div className="mt-4 border-t border-brand-border pt-3">
          <FieldLabel>Payment history</FieldLabel>
          <ul className="flex flex-col gap-2 mt-2">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-3 text-[13px]">
                <span className="font-bold text-brand-charcoal min-w-[80px]">
                  ₹{e.amount.toLocaleString("en-IN")}
                </span>
                <span className="flex-1 text-brand-dark-text">
                  {e.note ?? ""}
                </span>
                <span className="text-[11px] text-brand-dark-text whitespace-nowrap">
                  {formatDateTime(e.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
