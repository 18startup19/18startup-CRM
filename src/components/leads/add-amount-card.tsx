"use client";

import { useState, useTransition } from "react";
import { IndianRupee, Plus } from "lucide-react";
import { Card, FieldLabel, Input } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  addLeadAmountAction,
  deleteLeadAmountAction,
  updateLeadAmountAction,
} from "@/app/actions/amounts";
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
              <AmountRow key={e.id} entry={e} />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function AmountRow({
  entry,
}: {
  entry: { id: string; amount: number; note: string | null; created_at: string };
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(entry.amount));
  const [note, setNote] = useState(entry.note ?? "");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  if (editing) {
    return (
      <li className="border border-brand-border rounded-[8px] p-2 flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          <IndianRupee size={13} className="text-brand-dark-text" />
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="!py-1 flex-1"
          />
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note"
          className="!py-1 text-[12.5px]"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setAmount(String(entry.amount));
              setNote(entry.note ?? "");
            }}
            className="text-[12px] font-bold text-brand-dark-text"
          >
            Cancel
          </button>
          <Button
            size="sm"
            type="button"
            loading={pending}
            disabled={!amount.trim()}
            onClick={() => {
              start(async () => {
                const n = Number(amount);
                if (!Number.isFinite(n) || n <= 0) {
                  toast("Amount must be positive.", "error");
                  return;
                }
                const res = await updateLeadAmountAction(entry.id, n, note);
                if (res.error) toast(res.error, "error");
                else {
                  toast("Payment updated.");
                  setEditing(false);
                }
              });
            }}
          >
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 text-[13px] group">
      <span className="font-bold text-brand-charcoal min-w-[80px]">
        ₹{entry.amount.toLocaleString("en-IN")}
      </span>
      <span className="flex-1 text-brand-dark-text">{entry.note ?? ""}</span>
      <span className="text-[11px] text-brand-dark-text whitespace-nowrap mr-1">
        {formatDateTime(entry.created_at)}
      </span>
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11.5px] font-bold text-brand-orange hover:text-brand-orange-dark"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirm("Delete this payment entry? This can't be undone."))
              return;
            start(async () => {
              const res = await deleteLeadAmountAction(entry.id);
              if (res.error) toast(res.error, "error");
              else toast("Payment deleted.");
            });
          }}
          className="text-[11.5px] font-bold text-red-500 hover:text-red-600"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
