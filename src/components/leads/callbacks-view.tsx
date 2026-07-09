"use client";

import Link from "next/link";
import { useState } from "react";
import { Phone, X } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { formatDateTime, formatRelative } from "@/lib/utils";
import type { CommunicationRow } from "@/lib/database.types";

interface UpcomingLead {
  id: string;
  name: string;
  phone: string | null;
  next_callback_at: string | null;
  stage_id: string | null;
}

interface Props {
  upcomingLeads: UpcomingLead[];
  calls: CommunicationRow[];
  leadNameById: Record<string, string>;
  leadPhoneById: Record<string, string | null>;
  notesByLead: Record<string, { body: string; created_at: string }[]>;
  actorNamesById: Record<string, string>;
}

const STATUS_COLOR: Record<
  string,
  "green" | "amber" | "red" | "slate" | "orange" | "blue"
> = {
  answered: "green",
  sent: "green",
  delivered: "green",
  missed: "red",
  failed: "red",
  no_answer: "amber",
  busy: "amber",
  queued: "slate",
};

export function CallbacksView({
  upcomingLeads,
  calls,
  leadNameById,
  leadPhoneById,
  notesByLead,
  actorNamesById,
}: Props) {
  const [viewing, setViewing] = useState<CommunicationRow | null>(null);
  const now = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
          Upcoming callbacks ({upcomingLeads.length})
        </h2>
        <Card className="p-0 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="bg-brand-bg border-b border-brand-border text-left">
              <tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Callback at</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {upcomingLeads.map((l) => {
                const overdue =
                  l.next_callback_at && new Date(l.next_callback_at).getTime() < now;
                return (
                  <tr key={l.id} className="border-b border-brand-border last:border-none">
                    <Td>
                      <Link
                        href={`/leads/${l.id}`}
                        className="font-bold text-brand-charcoal hover:text-brand-orange"
                      >
                        {l.name}
                      </Link>
                    </Td>
                    <Td className="text-brand-dark-text">{l.phone ?? "—"}</Td>
                    <Td className="text-brand-dark-text">
                      {formatDateTime(l.next_callback_at)}
                    </Td>
                    <Td>
                      {overdue ? (
                        <span className="text-red-600 font-bold text-[12px]">OVERDUE</span>
                      ) : (
                        <span className="text-brand-orange font-bold text-[12px]">Upcoming</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {upcomingLeads.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-brand-dark-text">
                    No callbacks scheduled in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
          Call log ({calls.length})
        </h2>
        <Card className="p-0 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead className="bg-brand-bg border-b border-brand-border text-left">
              <tr>
                <Th>Lead</Th>
                <Th>Time</Th>
                <Th>Status</Th>
                <Th>Duration</Th>
                <Th className="w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {calls.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setViewing(c)}
                  className="border-b border-brand-border last:border-none cursor-pointer hover:bg-brand-bg"
                >
                  <Td>
                    <div className="font-semibold text-brand-charcoal">
                      {leadNameById[c.lead_id] ?? "Unknown"}
                    </div>
                    <div className="text-[12px] text-brand-dark-text">
                      {leadPhoneById[c.lead_id] ?? "—"}
                    </div>
                  </Td>
                  <Td className="text-brand-dark-text">{formatRelative(c.created_at)}</Td>
                  <Td>
                    <Badge color={STATUS_COLOR[c.status] ?? "slate"}>
                      {c.outcome ?? c.status}
                    </Badge>
                  </Td>
                  <Td className="text-brand-dark-text">
                    {c.duration_seconds != null ? `${c.duration_seconds}s` : "—"}
                  </Td>
                  <Td>
                    <span className="text-[12px] font-bold text-brand-orange">Open</span>
                  </Td>
                </tr>
              ))}
              {calls.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-brand-dark-text">
                    No calls in this window.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {viewing && (
        <CallDetailModal
          call={viewing}
          leadName={leadNameById[viewing.lead_id] ?? "Unknown"}
          leadPhone={leadPhoneById[viewing.lead_id] ?? null}
          actorName={
            viewing.actor_id ? actorNamesById[viewing.actor_id] ?? null : null
          }
          notes={notesByLead[viewing.lead_id] ?? []}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

function CallDetailModal({
  call,
  leadName,
  leadPhone,
  actorName,
  notes,
  onClose,
}: {
  call: CommunicationRow;
  leadName: string;
  leadPhone: string | null;
  actorName: string | null;
  notes: { body: string; created_at: string }[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[14px] shadow-2xl max-w-[600px] w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
          <div className="flex items-center gap-2 min-w-0">
            <Phone size={16} className="text-brand-charcoal" />
            <h3 className="text-[15px] font-bold text-brand-charcoal truncate">
              Call · {leadName}
            </h3>
            <Badge color={STATUS_COLOR[call.status] ?? "slate"}>
              {call.status}
            </Badge>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-[8px] hover:bg-brand-bg">
            <X size={16} className="text-brand-dark-text" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          <Row label="Lead">
            <Link
              href={`/leads/${call.lead_id}`}
              className="text-brand-orange font-bold hover:text-brand-orange-dark"
            >
              {leadName}
            </Link>
            {leadPhone && (
              <span className="text-brand-dark-text ml-2">({leadPhone})</span>
            )}
          </Row>
          <Row label="Time">{formatDateTime(call.created_at)}</Row>
          {actorName && <Row label="By">{actorName}</Row>}
          {call.outcome && <Row label="Outcome">{call.outcome}</Row>}
          {call.duration_seconds != null && (
            <Row label="Duration">{call.duration_seconds}s</Row>
          )}
          {call.provider && <Row label="Provider">{call.provider}</Row>}
          {call.provider_message_id && (
            <Row label="Provider ID">
              <code className="text-[12px] font-mono">{call.provider_message_id}</code>
            </Row>
          )}
          {call.recording_url && (
            <Row label="Recording">
              <a
                href={call.recording_url}
                target="_blank"
                rel="noreferrer"
                className="text-brand-orange font-bold underline"
              >
                Open recording
              </a>
            </Row>
          )}
          {call.body && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                Summary
              </div>
              <div className="rounded-[10px] border border-brand-border p-3 text-[13.5px] bg-brand-bg whitespace-pre-wrap">
                {call.body}
              </div>
            </div>
          )}
          {call.error && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
              <span className="font-bold">Error:</span> {call.error}
            </div>
          )}
          {notes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                Notes on this lead
              </div>
              <ul className="flex flex-col gap-2">
                {notes.map((n, i) => (
                  <li
                    key={i}
                    className="border-l-2 border-brand-orange pl-3 py-1 text-[13px]"
                  >
                    <p className="text-brand-charcoal whitespace-pre-wrap">{n.body}</p>
                    <p className="text-[11px] text-brand-dark-text mt-0.5">
                      {formatRelative(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-[13.5px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text w-24 shrink-0">
        {label}
      </span>
      <span className="text-brand-charcoal">{children}</span>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-6 py-3 align-top ${className}`}>{children}</td>;
}
