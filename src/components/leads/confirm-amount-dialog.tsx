"use client";

import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  amount: number;
  cohort: string;
  // The cohort other payments on this lead used, if any. When it differs from
  // the just-picked cohort we show a mismatch warning.
  expectedCohort: string | null;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
  // Called when the user clicks "Use Cohort X" — reverts the picker in the
  // caller and closes the dialog.
  onRevertCohort: (cohort: string) => void;
  // Called when the user picks "Shift all to Cohort {new}" — caller
  // reassigns every prior payment on the lead to the new cohort, then
  // saves this payment as normal. Only rendered when set.
  onShiftCohort?: () => void;
}

export function ConfirmAmountDialog({
  open,
  amount,
  cohort,
  expectedCohort,
  pending = false,
  onCancel,
  onConfirm,
  onRevertCohort,
  onShiftCohort,
}: Props) {
  if (!open) return null;

  const mismatch =
    expectedCohort !== null && expectedCohort !== "" && expectedCohort !== cohort;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-[14px] shadow-2xl max-w-[440px] w-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-brand-charcoal">
            {mismatch ? "Cohort mismatch" : "Confirm payment"}
          </h3>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-[8px] hover:bg-brand-bg text-brand-dark-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {mismatch && (
            <div className="flex items-start gap-3 bg-[#FFF6E3] border border-[#F5D26A] rounded-[10px] px-4 py-3">
              <AlertTriangle size={18} className="text-[#B98511] shrink-0 mt-0.5" />
              <div className="text-[13px] text-brand-charcoal">
                Previous payments on this lead used{" "}
                <b>Cohort {expectedCohort}</b>. You picked{" "}
                <b>Cohort {cohort}</b>. This will look inconsistent on the
                cohort dashboards.
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1 text-[13.5px]">
            <div className="flex justify-between">
              <span className="text-brand-dark-text">Amount</span>
              <span className="font-bold text-brand-charcoal">
                ₹{amount.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-dark-text">Cohort</span>
              <span className="font-mono font-bold text-brand-charcoal">
                {cohort || "—"}
              </span>
            </div>
          </div>

        </div>

        <div className="px-5 py-4 border-t border-brand-border flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-[12.5px] font-bold text-brand-dark-text hover:text-brand-charcoal px-3 py-1.5"
          >
            Cancel
          </button>
          {mismatch ? (
            <div className="flex flex-col gap-2 w-full">
              <Button
                type="button"
                size="sm"
                onClick={() => onRevertCohort(expectedCohort!)}
              >
                Use Cohort {expectedCohort}
              </Button>
              {onShiftCohort && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={pending}
                  onClick={onShiftCohort}
                >
                  Shift all payments to Cohort {cohort}
                </Button>
              )}
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              loading={pending}
              onClick={() => onConfirm()}
            >
              Confirm &amp; save
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
