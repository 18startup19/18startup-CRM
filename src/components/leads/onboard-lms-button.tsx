"use client";

import { useState, useTransition } from "react";
import { GraduationCap, Loader2, RefreshCcw, AlertTriangle } from "lucide-react";
import { onboardLeadToLmsAction } from "@/app/actions/onboard";
import { useToast } from "@/components/ui/toast";

export interface OnboardingState {
  status: "sent" | "failed" | null;
  sentAt: string | null;
  error: string | null;
}

interface Props {
  leadId: string;
  cohortId: string;
  state: OnboardingState;
}

export function OnboardLmsButton({ leadId, cohortId, state }: Props) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  function fire() {
    startTransition(async () => {
      const res = await onboardLeadToLmsAction(leadId, cohortId);
      const delivered: string[] = [];
      if (!res.waSkipped && !res.waError) delivered.push("WhatsApp");
      if (!res.emailSkipped && !res.emailError) delivered.push("Email");
      if (!res.enrollSkipped && !res.enrollError) delivered.push("LMS");
      const failed: string[] = [];
      if (res.waError) failed.push(`WA: ${res.waError}`);
      if (res.emailError) failed.push(`Email: ${res.emailError}`);
      if (res.enrollError) failed.push(`LMS: ${res.enrollError}`);

      if (delivered.length === 0) {
        toast(`Onboarding failed — ${failed.join(" · ") || res.error}`, "error");
      } else if (failed.length > 0) {
        toast(
          `Sent: ${delivered.join(" + ")}. Failed: ${failed.join(" · ")}`,
          "error",
        );
      } else {
        toast(`Sent: ${delivered.join(" + ")}`, "success");
      }
      setConfirmOpen(false);
    });
  }

  const isSent = state.status === "sent";
  const isFailed = state.status === "failed";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmOpen(true);
        }}
        disabled={isPending}
        className={
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition " +
          (isSent
            ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
            : isFailed
              ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
              : "bg-brand-orange text-white border border-brand-orange hover:bg-brand-orange-dark")
        }
        title={state.error ?? ""}
      >
        {isPending ? (
          <Loader2 size={12} className="animate-spin" />
        ) : isSent ? (
          <RefreshCcw size={12} />
        ) : isFailed ? (
          <AlertTriangle size={12} />
        ) : (
          <GraduationCap size={12} />
        )}
        {isSent
          ? "Resend"
          : isFailed
            ? "Retry"
            : "Onboard to LMS"}
      </button>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(false);
          }}
        >
          <div
            className="bg-white rounded-2xl border border-brand-border shadow-xl max-w-[440px] w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0">
                <GraduationCap size={18} className="text-brand-orange" />
              </div>
              <div className="flex-1">
                <h3 className="text-[16px] font-black text-brand-charcoal">
                  {isSent ? "Resend onboarding?" : "Onboard this lead?"}
                </h3>
                <p className="text-[13px] text-brand-dark-text mt-1">
                  Confirm the lead has paid the <strong>full amount</strong>.
                  This will enroll them in the LMS cohort and send a
                  welcome WhatsApp + email.
                </p>
                {isFailed && state.error && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded-[10px] px-3 py-2 text-[12px] text-red-700">
                    Last error: {state.error}
                  </div>
                )}
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(false)}
                    className="px-3 py-1.5 rounded-[8px] text-[12.5px] font-bold text-brand-dark-text hover:bg-brand-bg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={fire}
                    disabled={isPending}
                    className="px-4 py-1.5 rounded-[8px] text-[12.5px] font-bold bg-brand-orange text-white hover:bg-brand-orange-dark inline-flex items-center gap-1.5"
                  >
                    {isPending && (
                      <Loader2 size={12} className="animate-spin" />
                    )}
                    {isSent ? "Resend" : "Yes, onboard now"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
