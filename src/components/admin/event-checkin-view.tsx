"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, Search } from "lucide-react";
import {
  manualCheckinAction,
  rotateCheckinTokenAction,
} from "@/app/actions/events";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

interface Registration {
  id: string;
  attended_at: string | null;
  registered_at: string;
  checkin_source: string | null;
  leads: { name: string; phone: string | null; email: string | null };
}

interface Props {
  eventId: string;
  eventTitle: string;
  checkinUrl: string;
  qrDataUrl: string;
  registrations: Registration[];
}

export function EventCheckinView({
  eventId,
  eventTitle,
  checkinUrl,
  qrDataUrl,
  registrations,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [rotatePending, startRotate] = useTransition();

  const attendedCount = registrations.filter((r) => r.attended_at).length;
  const pendingCount = registrations.length - attendedCount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registrations;
    return registrations.filter((r) => {
      const hay = `${r.leads.name} ${r.leads.phone ?? ""} ${r.leads.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [registrations, search]);

  function copy() {
    navigator.clipboard.writeText(checkinUrl).then(() => {
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    });
  }

  function onRotate() {
    if (
      !confirm(
        "Regenerate the check-in URL? The old QR code will stop working immediately. Anyone still using it won't be able to check in until you show them the new one.",
      )
    ) {
      return;
    }
    startRotate(async () => {
      await rotateCheckinTokenAction(eventId);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[400px_1fr] gap-6 items-start">
      {/* QR panel */}
      <Card className="p-6 flex flex-col items-center text-center">
        <h2 className="text-[14px] font-bold text-brand-charcoal mb-1">
          Attendee check-in QR
        </h2>
        <p className="text-[12px] text-brand-dark-text mb-4">
          Show this on a tablet/phone at the venue.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt="Check-in QR code"
          width={320}
          height={320}
          className="rounded-[10px] border border-brand-border"
        />
        <div className="mt-4 w-full">
          <div className="flex items-center gap-2 bg-brand-bg rounded-[8px] px-3 py-2">
            <input
              type="text"
              readOnly
              value={checkinUrl}
              className="flex-1 bg-transparent text-[11.5px] text-brand-charcoal outline-none min-w-0"
            />
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1 text-[11px] font-bold text-brand-orange hover:text-brand-orange-dark shrink-0"
            >
              <Copy size={11} />
              {copyState === "copied" ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={onRotate}
            disabled={rotatePending}
            className="mt-3 w-full inline-flex items-center justify-center gap-1 text-[12px] font-bold text-brand-dark-text hover:text-red-600 disabled:opacity-50"
          >
            <RefreshCw size={11} />
            {rotatePending ? "Regenerating…" : "Regenerate QR (invalidate old link)"}
          </button>
        </div>
      </Card>

      {/* Registrations panel */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <h2 className="text-[15px] font-bold text-brand-charcoal">
              {eventTitle}
            </h2>
            <div className="text-[12.5px] text-brand-dark-text mt-0.5">
              <strong className="text-green-700">{attendedCount}</strong> attended ·{" "}
              <strong>{pendingCount}</strong> yet to check in ·{" "}
              <strong>{registrations.length}</strong> registered
            </div>
          </div>
          <div className="relative min-w-[240px]">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark-text"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name / phone / email"
              className="w-full pl-9 pr-3 h-[36px] rounded-[10px] border border-brand-border bg-brand-bg text-[13px] outline-none focus:bg-white focus:border-brand-orange"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-brand-bg">
              <tr>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Registered</Th>
                <Th>Attended</Th>
                <Th className="w-[110px]">Action</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <Row key={r.id} reg={r} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center py-10 text-[13px] text-brand-dark-text"
                  >
                    {registrations.length === 0
                      ? "No registrations yet."
                      : "No one matches that search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Row({ reg }: { reg: Registration }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const attended = !!reg.attended_at;

  function markAttended() {
    startTransition(async () => {
      await manualCheckinAction(reg.id);
      router.refresh();
    });
  }

  return (
    <tr
      className={`border-b border-brand-border ${attended ? "bg-green-50/40" : ""}`}
    >
      <Td>
        <div className="font-bold text-brand-charcoal">{reg.leads.name}</div>
        {reg.leads.email && (
          <div className="text-[11.5px] text-brand-dark-text">{reg.leads.email}</div>
        )}
      </Td>
      <Td>{reg.leads.phone ?? "—"}</Td>
      <Td className="text-brand-dark-text text-[12px] whitespace-nowrap">
        {formatDateTime(reg.registered_at)}
      </Td>
      <Td className="text-brand-dark-text text-[12px] whitespace-nowrap">
        {attended ? (
          <span className="text-green-700 font-bold">
            ✓ {formatDateTime(reg.attended_at!)}
          </span>
        ) : (
          "—"
        )}
      </Td>
      <Td>
        {attended ? (
          <span className="text-[11px] text-brand-dark-text">
            {reg.checkin_source === "self_scan"
              ? "Self-scan"
              : reg.checkin_source === "walkin"
                ? "Walk-in"
                : "Manual"}
          </span>
        ) : (
          <button
            type="button"
            onClick={markAttended}
            disabled={pending}
            className="text-[11.5px] font-bold text-brand-orange hover:text-brand-orange-dark disabled:opacity-50"
          >
            {pending ? "…" : "Mark attended"}
          </button>
        )}
      </Td>
    </tr>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.6px] text-brand-dark-text ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2.5 text-[13px] text-brand-charcoal ${className}`}>
      {children}
    </td>
  );
}
