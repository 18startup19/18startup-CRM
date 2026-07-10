"use client";

import { useState, useTransition } from "react";
import { IndianRupee, Plus } from "lucide-react";
import { Card, FieldLabel, Input, Select } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  addLeadAmountAction,
  deleteLeadAmountAction,
  shiftLeadPaymentsCohortAction,
  updateLeadAmountAction,
} from "@/app/actions/amounts";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import { ConfirmAmountDialog } from "@/components/leads/confirm-amount-dialog";

interface AmountEntry {
  id: string;
  amount: number;
  note: string | null;
  cohort_number: string | null;
  created_at: string;
}

export function AddAmountCard({
  leadId,
  total,
  totalFee,
  entries,
  cohorts,
}: {
  leadId: string;
  total: number;
  totalFee: number | null;
  entries: AmountEntry[];
  cohorts: { number: string; label: string | null }[];
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [cohort, setCohort] = useState("");
  const [feeInput, setFeeInput] = useState(
    totalFee != null ? String(totalFee) : "",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  const feeNum = Number(feeInput);
  const feeSet = Number.isFinite(feeNum) && feeNum > 0;
  const pendingAmount = feeSet ? Math.max(0, feeNum - total) : null;

  // Prior cohort on this lead — used to detect a mismatch when the user is
  // logging another payment against a lead that already sits in a cohort.
  const expectedCohort =
    entries.find((e) => e.cohort_number)?.cohort_number ?? null;

  function openConfirm() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast("Enter a positive amount.", "error");
      return;
    }
    if (!cohort) {
      toast("Pick a cohort before saving.", "error");
      return;
    }
    if (!feeSet) {
      toast("Enter the total cohort fee.", "error");
      return;
    }
    if (feeNum < n) {
      toast("Total fee can't be less than the payment amount.", "error");
      return;
    }
    setConfirmOpen(true);
  }

  function doSubmit(mismatchReason?: string) {
    const n = Number(amount);
    const finalNote = mismatchReason
      ? note
        ? `[Cohort mismatch: ${mismatchReason}] ${note}`
        : `[Cohort mismatch: ${mismatchReason}]`
      : note;
    start(async () => {
      const res = await addLeadAmountAction(
        leadId,
        n,
        finalNote,
        cohort,
        feeNum,
      );
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      toast(`Added ₹${n.toLocaleString("en-IN")}.`);
      setAmount("");
      setNote("");
      setCohort("");
      // Keep feeInput populated — subsequent payments on the same lead use it.
      setConfirmOpen(false);
    });
  }

  function doShiftThenAdd() {
    if (!expectedCohort || !cohort) return;
    const n = Number(amount);
    start(async () => {
      const shift = await shiftLeadPaymentsCohortAction(
        leadId,
        expectedCohort,
        cohort,
      );
      if (shift.error) {
        toast(shift.error, "error");
        return;
      }
      const res = await addLeadAmountAction(leadId, n, note, cohort, feeNum);
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      toast(`Shifted prior payments to Cohort ${cohort} and added ₹${n.toLocaleString("en-IN")}.`);
      setAmount("");
      setNote("");
      setCohort("");
      setConfirmOpen(false);
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-dark-text">
          Converted amount
        </div>
        <div className="text-[18px] font-black text-brand-charcoal flex items-center">
          <IndianRupee size={15} className="mr-0.5" />
          {total.toLocaleString("en-IN")}
          {feeSet && (
            <span className="text-brand-dark-text font-semibold text-[13px] ml-1">
              / ₹{feeNum.toLocaleString("en-IN")}
            </span>
          )}
        </div>
      </div>
      {feeSet && pendingAmount !== null && (
        <div className="mb-3 flex items-center gap-2">
          {pendingAmount > 0 ? (
            <span className="text-[11.5px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
              ₹{pendingAmount.toLocaleString("en-IN")} pending
            </span>
          ) : (
            <span className="text-[11.5px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              Fully paid
            </span>
          )}
        </div>
      )}
      {!feeSet && <div className="mb-3" />}

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
            onClick={openConfirm}
            loading={pending}
            size="sm"
            disabled={!amount.trim()}
          >
            <Plus size={13} className="inline mr-1" /> Add
          </Button>
        </div>
        {cohorts.length === 0 ? (
          <div className="text-[11.5px] text-red-600 bg-[#FFF4EF] border border-[#FFD5C2] rounded-[8px] px-3 py-2">
            No cohorts yet. Ask an admin to add one under Admin → Cohort
            Onboarding before recording a payment.
          </div>
        ) : (
          <Select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            required
            className="!py-2 text-[12.5px] !bg-brand-yellow border-brand-yellow font-semibold"
          >
            <option value="">Cohort number (required)</option>
            {cohorts.map((c) => (
              <option key={c.number} value={c.number}>
                Cohort {c.number}
                {c.label ? ` — ${c.label}` : ""}
              </option>
            ))}
          </Select>
        )}
        <Input
          value={feeInput}
          onChange={(e) => setFeeInput(e.target.value.replace(/[^0-9.]/g, ""))}
          placeholder="Total cohort fee (required)"
          className="!py-2 text-[12.5px] !bg-brand-yellow border-brand-yellow font-semibold placeholder:text-brand-charcoal placeholder:font-bold"
          required
        />
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
              <AmountRow
                key={e.id}
                leadId={leadId}
                entry={e}
                cohorts={cohorts}
                otherEntries={entries.filter((x) => x.id !== e.id)}
              />
            ))}
          </ul>
        </div>
      )}

      <ConfirmAmountDialog
        open={confirmOpen}
        amount={Number(amount) || 0}
        cohort={cohort}
        expectedCohort={expectedCohort}
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={doSubmit}
        onRevertCohort={(c) => {
          setCohort(c);
          setConfirmOpen(false);
        }}
        onShiftCohort={doShiftThenAdd}
      />
    </Card>
  );
}

function AmountRow({
  leadId,
  entry,
  cohorts,
  otherEntries,
}: {
  leadId: string;
  entry: {
    id: string;
    amount: number;
    note: string | null;
    cohort_number: string | null;
    created_at: string;
  };
  cohorts: { number: string; label: string | null }[];
  otherEntries: {
    id: string;
    cohort_number: string | null;
  }[];
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(entry.amount));
  const [note, setNote] = useState(entry.note ?? "");
  const [cohort, setCohort] = useState(entry.cohort_number ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  // Notes that were force-continued through the mismatch dialog carry a
  // "[Cohort mismatch: <reason>] …" prefix. Split it out so the row shows
  // only the human note; the reason is visible in the details modal.
  const { cleanNote, mismatchReason } = parseNoteMarker(entry.note);

  // Expected cohort based on other payments on this lead.
  const expectedCohort =
    otherEntries.find((e) => e.cohort_number)?.cohort_number ?? null;

  function openConfirm() {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast("Amount must be positive.", "error");
      return;
    }
    if (!cohort) {
      toast("Pick a cohort.", "error");
      return;
    }
    setConfirmOpen(true);
  }

  function doSave(mismatchReason?: string) {
    const n = Number(amount);
    const finalNote = mismatchReason
      ? note
        ? `[Cohort mismatch: ${mismatchReason}] ${note}`
        : `[Cohort mismatch: ${mismatchReason}]`
      : note;
    start(async () => {
      const res = await updateLeadAmountAction(entry.id, n, finalNote, cohort);
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      toast("Payment updated.");
      setEditing(false);
      setConfirmOpen(false);
    });
  }

  function doShiftThenSave() {
    if (!expectedCohort || !cohort) return;
    const n = Number(amount);
    start(async () => {
      const shift = await shiftLeadPaymentsCohortAction(
        leadId,
        expectedCohort,
        cohort,
      );
      if (shift.error) {
        toast(shift.error, "error");
        return;
      }
      const res = await updateLeadAmountAction(entry.id, n, note, cohort);
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      toast(`Shifted all payments to Cohort ${cohort}.`);
      setEditing(false);
      setConfirmOpen(false);
    });
  }

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
        <Select
          value={cohort}
          onChange={(e) => setCohort(e.target.value)}
          required
          className="!py-1 text-[12.5px] !bg-brand-yellow border-brand-yellow font-semibold"
        >
          <option value="">Cohort number (required)</option>
          {/* Always include the current cohort as a fallback so an archived
              or renamed cohort still shows up until the user re-picks. */}
          {cohort && !cohorts.some((c) => c.number === cohort) && (
            <option value={cohort}>Cohort {cohort}</option>
          )}
          {cohorts.map((c) => (
            <option key={c.number} value={c.number}>
              Cohort {c.number}
              {c.label ? ` — ${c.label}` : ""}
            </option>
          ))}
        </Select>
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
              setCohort(entry.cohort_number ?? "");
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
            onClick={openConfirm}
          >
            Save
          </Button>
        </div>
        <ConfirmAmountDialog
          open={confirmOpen}
          amount={Number(amount) || 0}
          cohort={cohort}
          expectedCohort={expectedCohort}
          pending={pending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doSave}
          onRevertCohort={(c) => {
            setCohort(c);
            setConfirmOpen(false);
          }}
          onShiftCohort={doShiftThenSave}
        />
      </li>
    );
  }

  return (
    <li
      className="flex items-start gap-3 text-[13px] group cursor-pointer hover:bg-brand-bg/60 rounded-[6px] px-1 py-0.5 -mx-1"
      onClick={() => setDetailsOpen(true)}
    >
      <span className="font-bold text-brand-charcoal min-w-[80px]">
        ₹{entry.amount.toLocaleString("en-IN")}
      </span>
      {entry.cohort_number && (
        <span className="text-[11px] font-bold text-brand-orange bg-brand-orange/10 px-1.5 py-0.5 rounded-full self-center whitespace-nowrap">
          Cohort {entry.cohort_number}
        </span>
      )}
      <span className="flex-1 text-brand-dark-text">{cleanNote}</span>
      <span className="text-[11px] text-brand-dark-text whitespace-nowrap mr-1">
        {formatDateTime(entry.created_at)}
      </span>
      <div
        className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
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

      {detailsOpen && (
        <PaymentDetailsModal
          entry={entry}
          cleanNote={cleanNote}
          mismatchReason={mismatchReason}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </li>
  );
}

function parseNoteMarker(raw: string | null): {
  cleanNote: string;
  mismatchReason: string | null;
} {
  if (!raw) return { cleanNote: "", mismatchReason: null };
  const match = raw.match(/^\[Cohort mismatch:\s*([^\]]*)\]\s*/);
  if (!match) return { cleanNote: raw, mismatchReason: null };
  return {
    cleanNote: raw.slice(match[0].length),
    mismatchReason: match[1].trim() || null,
  };
}

function PaymentDetailsModal({
  entry,
  cleanNote,
  mismatchReason,
  onClose,
}: {
  entry: AmountEntry;
  cleanNote: string;
  mismatchReason: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[14px] shadow-2xl max-w-[440px] w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-brand-charcoal">Payment details</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] hover:bg-brand-bg text-brand-dark-text text-[16px] font-bold"
          >
            ×
          </button>
        </div>
        <div className="p-5 flex flex-col gap-3 text-[13.5px]">
          <Row label="Amount" value={`₹${entry.amount.toLocaleString("en-IN")}`} bold />
          <Row label="Cohort" value={entry.cohort_number ? `Cohort ${entry.cohort_number}` : "—"} mono />
          <Row label="Recorded" value={formatDateTime(entry.created_at)} />
          {cleanNote && <Row label="Note" value={cleanNote} block />}
          {mismatchReason && (
            <div className="border border-[#F5D26A] bg-[#FFF6E3] rounded-[10px] px-3 py-2 flex flex-col gap-0.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#B98511]">
                Cohort mismatch reason
              </div>
              <div className="text-[13px] text-brand-charcoal">{mismatchReason}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  mono,
  block,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
  block?: boolean;
}) {
  return (
    <div className={block ? "flex flex-col gap-0.5" : "flex justify-between gap-4"}>
      <span className="text-brand-dark-text">{label}</span>
      <span
        className={
          (bold ? "font-bold text-brand-charcoal " : "text-brand-charcoal ") +
          (mono ? "font-mono " : "") +
          (block ? "whitespace-pre-wrap" : "text-right")
        }
      >
        {value}
      </span>
    </div>
  );
}
