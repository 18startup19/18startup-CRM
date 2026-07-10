"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { ConvertedAmountCell } from "@/components/converted-amount-cell";
import {
  OnboardLmsButton,
  type OnboardingState,
} from "@/components/leads/onboard-lms-button";

export interface Payment {
  id: string;
  amount: number;
  note: string | null;
  cohort_number: string | null;
  created_at: string;
  actor_id: string | null;
  actorName: string;
}

export interface LeadGroup {
  leadId: string;
  leadName: string;
  leadPhone?: string | null;
  payments: Payment[];
}

interface Props {
  groups: LeadGroup[];
  // Turn on to hide the "Team member" column (e.g. on admin cohort detail
  // where every row is often the same admin — keep it flexible).
  hideTeamMember?: boolean;
  emptyLabel?: string;
  // Optional link builder for the child rows (defaults to disabled — the
  // parent row and inline expansion is enough).
  editable?: boolean;
  // When provided, render an "Onboard to LMS" column that fires the
  // manual sales-team-owned onboarding action. Requires a specific cohort
  // context — the mapping is per (lead, cohort).
  onboarding?: {
    cohortId: string;
    byLeadId: Map<string, OnboardingState>;
  };
}

export function GroupedPaymentTable({
  groups,
  hideTeamMember = false,
  emptyLabel = "No payments in this range.",
  editable = true,
  onboarding,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-2xl bg-white border border-brand-border overflow-x-auto">
      <table className="w-full min-w-[720px] text-[14px]">
        <thead className="bg-brand-bg border-b border-brand-border text-left">
          <tr>
            <Th />
            <Th>Lead</Th>
            {!hideTeamMember && <Th>Team member</Th>}
            <Th>Payments</Th>
            <Th>Total amount</Th>
            <Th>Cohort #</Th>
            <Th>Last payment</Th>
            {onboarding && <Th>LMS</Th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isOpen = expanded.has(g.leadId);
            const total = g.payments.reduce((s, p) => s + p.amount, 0);
            const cohorts = Array.from(
              new Set(g.payments.map((p) => p.cohort_number).filter(Boolean)),
            ) as string[];
            const cohortDisplay =
              cohorts.length === 0
                ? "—"
                : cohorts.length === 1
                  ? cohorts[0]
                  : `${cohorts.length} cohorts`;
            const teamMembers = Array.from(
              new Set(g.payments.map((p) => p.actorName).filter(Boolean)),
            );
            const memberDisplay =
              teamMembers.length === 0
                ? "—"
                : teamMembers.length === 1
                  ? teamMembers[0]
                  : `${teamMembers.length} members`;
            const latest = g.payments[0];
            return (
              <RowFragment key={g.leadId}>
                <tr
                  className="border-b border-brand-border last:border-none hover:bg-brand-bg cursor-pointer"
                  onClick={() => toggle(g.leadId)}
                >
                  <Td className="w-8">
                    <ChevronRight
                      size={14}
                      className={
                        "text-brand-dark-text transition-transform " +
                        (isOpen ? "rotate-90" : "")
                      }
                    />
                  </Td>
                  <Td>
                    <Link
                      href={`/leads/${g.leadId}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block font-bold text-brand-charcoal hover:text-brand-orange"
                    >
                      {g.leadName}
                    </Link>
                    {g.leadPhone && (
                      <div className="text-[11.5px] text-brand-dark-text">
                        {g.leadPhone}
                      </div>
                    )}
                  </Td>
                  {!hideTeamMember && (
                    <Td className="text-brand-dark-text">{memberDisplay}</Td>
                  )}
                  <Td className="font-semibold">{g.payments.length}</Td>
                  <Td className="font-semibold">
                    ₹{total.toLocaleString("en-IN")}
                  </Td>
                  <Td className="text-brand-dark-text font-mono">{cohortDisplay}</Td>
                  <Td className="text-brand-dark-text whitespace-nowrap">
                    {formatDateTime(latest.created_at)}
                  </Td>
                  {onboarding && (
                    <Td onClick={(e) => e.stopPropagation()}>
                      <OnboardLmsButton
                        leadId={g.leadId}
                        cohortId={onboarding.cohortId}
                        state={
                          onboarding.byLeadId.get(g.leadId) ?? {
                            status: null,
                            sentAt: null,
                            error: null,
                          }
                        }
                      />
                    </Td>
                  )}
                </tr>
                {isOpen && (
                  <tr className="bg-brand-bg/40 border-b border-brand-border last:border-none">
                    <td
                      colSpan={
                        (hideTeamMember ? 6 : 7) + (onboarding ? 1 : 0)
                      }
                      className="px-4 py-3"
                    >
                      <div className="rounded-[10px] border border-brand-border bg-white overflow-hidden">
                        <table className="w-full text-[13px]">
                          <thead className="bg-brand-bg border-b border-brand-border text-left">
                            <tr>
                              <Th>Amount</Th>
                              {!hideTeamMember && <Th>Team member</Th>}
                              <Th>Cohort #</Th>
                              <Th>Note</Th>
                              <Th>When</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.payments.map((p) => {
                              const { cleanNote } = parseNoteMarker(p.note);
                              return (
                                <tr
                                  key={p.id}
                                  className="border-b border-brand-border last:border-none"
                                >
                                  <Td className="font-semibold">
                                    {editable ? (
                                      <ConvertedAmountCell
                                        amountId={p.id}
                                        initialAmount={p.amount}
                                        initialNote={p.note}
                                      />
                                    ) : (
                                      `₹${p.amount.toLocaleString("en-IN")}`
                                    )}
                                  </Td>
                                  {!hideTeamMember && (
                                    <Td className="text-brand-dark-text">
                                      {p.actorName || "—"}
                                    </Td>
                                  )}
                                  <Td className="text-brand-dark-text font-mono">
                                    {p.cohort_number ?? "—"}
                                  </Td>
                                  <Td className="text-brand-dark-text">
                                    {cleanNote || "—"}
                                  </Td>
                                  <Td className="text-brand-dark-text whitespace-nowrap">
                                    {formatDateTime(p.created_at)}
                                  </Td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </RowFragment>
            );
          })}
          {groups.length === 0 && (
            <tr>
              <td
                colSpan={
                  (hideTeamMember ? 6 : 7) + (onboarding ? 1 : 0)
                }
                className="px-6 py-10 text-center text-brand-dark-text"
              >
                {emptyLabel}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RowFragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}) {
  return (
    <td
      className={`px-4 py-3 align-top ${className}`}
      onClick={onClick}
    >
      {children}
    </td>
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
