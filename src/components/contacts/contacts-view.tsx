"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { MailIcon, MessageSquare, Search, X } from "lucide-react";
import {
  bulkSendEmailAction,
  bulkSendWhatsAppAction,
  type BulkResult,
} from "@/app/actions/bulk-comms";
import type {
  EmailTemplateRow,
  LeadRow,
  LeadStageRow,
  UserRow,
  WhatsAppTemplateRow,
} from "@/lib/database.types";

// Rendered rows are pre-decorated on the server so the client doesn't
// have to touch dates (avoids en-IN hydration mismatches).
export interface DecoratedContact
  extends Pick<
    LeadRow,
    | "id"
    | "name"
    | "phone"
    | "email"
    | "stage_id"
    | "owner_id"
    | "tags"
    | "is_dnc"
    | "created_at"
  > {
  last_contacted_iso: string | null;
  last_contacted_label: string;
  created_label: string;
}

interface Props {
  leads: DecoratedContact[];
  stages: Pick<LeadStageRow, "id" | "name" | "color" | "pipeline_id">[];
  users: Pick<UserRow, "id" | "name" | "email">[];
  emailTemplates: Pick<EmailTemplateRow, "id" | "name" | "subject">[];
  waTemplates: Pick<WhatsAppTemplateRow, "id" | "name" | "approval_status">[];
}

// Hard cap mirrors the server-side guardrail in bulk-comms.ts — surfaced
// on the client so admins never see a confusing "you have 800 selected but
// only 500 can send" surprise after clicking Send.
const BULK_MAX = 500;

// Table paginates client-side at 100 rows per page. Select-all only touches
// the current page — deliberate so users understand "I'm sending to what I
// can see", not "I'm sending to a filter set I can't visually confirm".
const PAGE_SIZE = 100;

export function ContactsView({
  leads,
  stages,
  users,
  emailTemplates,
  waTemplates,
}: Props) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<null | "email" | "whatsapp">(null);
  const [page, setPage] = useState(0);
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const l of leads) for (const t of l.tags ?? []) s.add(t);
    return Array.from(s).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (stageFilter && l.stage_id !== stageFilter) return false;
      if (ownerFilter && l.owner_id !== ownerFilter) return false;
      if (tagFilter && !(l.tags ?? []).includes(tagFilter)) return false;
      if (q) {
        const hay = `${l.name} ${l.email ?? ""} ${l.phone ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, stageFilter, ownerFilter, tagFilter]);

  // Reset to page 0 whenever filters change — otherwise a filter that
  // shrinks results could leave you looking at an empty page N.
  useEffect(() => {
    setPage(0);
  }, [search, stageFilter, ownerFilter, tagFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const paged = useMemo(
    () => filtered.slice(pageStart, pageEnd),
    [filtered, pageStart, pageEnd],
  );

  const visibleIds = useMemo(() => paged.map((l) => l.id), [paged]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function clearFilters() {
    setSearch("");
    setStageFilter("");
    setOwnerFilter("");
    setTagFilter("");
  }

  const selectedCount = selected.size;
  const overCap = selectedCount > BULK_MAX;
  const hasFilters =
    !!search || !!stageFilter || !!ownerFilter || !!tagFilter;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="bg-white border border-brand-border rounded-2xl p-4 flex items-center gap-3 flex-wrap">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark-text"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone"
            className="w-full pl-9 pr-3 h-[38px] rounded-[10px] border border-brand-border bg-brand-bg text-[13.5px] text-brand-charcoal outline-none focus:bg-white focus:border-brand-orange"
          />
        </div>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="h-[38px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal"
        >
          <option value="">All stages</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="h-[38px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal"
        >
          <option value="">All owners</option>
          <option value="__unassigned__" disabled>
            (unassigned filter not yet supported)
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="h-[38px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal"
        >
          <option value="">All tags</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[12px] font-bold text-brand-dark-text hover:text-brand-orange"
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto text-[12px] text-brand-dark-text">
          {filtered.length} of {leads.length} leads
        </div>
      </div>

      {/* Bulk-action toolbar (only when rows are selected) */}
      {selectedCount > 0 && (
        <div
          className={`sticky top-2 z-20 rounded-2xl border p-3 flex items-center gap-3 flex-wrap ${overCap ? "border-red-300 bg-red-50" : "border-brand-orange bg-[#FFF4EF]"}`}
        >
          <div className="text-[13px] font-bold text-brand-charcoal">
            {selectedCount} selected
          </div>
          {overCap && (
            <div className="text-[12px] text-red-600">
              Only {BULK_MAX} recipients per bulk send. Narrow your selection.
            </div>
          )}
          <button
            type="button"
            onClick={() => setModal("email")}
            disabled={overCap}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[10px] bg-brand-orange text-white text-[13px] font-bold hover:bg-brand-orange-dark disabled:opacity-50"
          >
            <MailIcon size={13} />
            Send Email
          </button>
          <button
            type="button"
            onClick={() => setModal("whatsapp")}
            disabled={overCap}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[10px] bg-[#25D366] text-white text-[13px] font-bold hover:brightness-95 disabled:opacity-50"
          >
            <MessageSquare size={13} />
            Send WhatsApp
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-[12px] font-bold text-brand-dark-text hover:text-brand-charcoal"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-brand-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-brand-bg sticky top-0">
              <tr>
                <Th className="w-[42px]">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    className="h-4 w-4 accent-brand-orange"
                    aria-label="Select all visible"
                  />
                </Th>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th>Stage</Th>
                <Th>Owner</Th>
                <Th>Tags</Th>
                <Th>Created</Th>
                <Th>Last contact</Th>
              </tr>
            </thead>
            <tbody>
              {paged.map((l) => {
                const stage = l.stage_id ? stageById.get(l.stage_id) : null;
                const owner = l.owner_id ? userById.get(l.owner_id) : null;
                const isSelected = selected.has(l.id);
                return (
                  <tr
                    key={l.id}
                    className={`border-b border-brand-border hover:bg-brand-bg/50 ${isSelected ? "bg-brand-orange/5" : ""}`}
                  >
                    <Td>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(l.id)}
                        className="h-4 w-4 accent-brand-orange"
                        aria-label={`Select ${l.name}`}
                      />
                    </Td>
                    <Td>
                      <Link
                        href={`/leads/${l.id}`}
                        className="text-[13.5px] font-bold text-brand-charcoal hover:text-brand-orange"
                      >
                        {l.name}
                      </Link>
                      {l.is_dnc && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.5px] text-red-600 bg-red-50 border border-red-200 rounded-full px-1.5 py-0.5">
                          DNC
                        </span>
                      )}
                    </Td>
                    <Td>{l.phone ?? "—"}</Td>
                    <Td>{l.email ?? "—"}</Td>
                    <Td>
                      {stage ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
                          style={{
                            backgroundColor: `${stage.color}20`,
                            color: stage.color,
                          }}
                        >
                          {stage.name}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>{owner?.name ?? "—"}</Td>
                    <Td>
                      {l.tags?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {l.tags.map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange text-[10.5px] font-bold"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-brand-dark-text text-[12px] whitespace-nowrap">
                      {l.created_label}
                    </Td>
                    <Td className="text-brand-dark-text text-[12px] whitespace-nowrap">
                      {l.last_contacted_label}
                    </Td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center py-10 text-[13px] text-brand-dark-text"
                  >
                    No contacts match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-brand-border bg-brand-bg/40">
            <div className="text-[12px] text-brand-dark-text">
              Showing{" "}
              <strong>
                {pageStart + 1}–{Math.min(pageEnd, filtered.length)}
              </strong>{" "}
              of <strong>{filtered.length}</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="h-[30px] px-3 rounded-[8px] border border-brand-border bg-white text-[12px] font-bold text-brand-charcoal hover:border-brand-orange disabled:opacity-40 disabled:hover:border-brand-border"
              >
                Prev
              </button>
              <div className="text-[12px] text-brand-dark-text">
                Page <strong>{currentPage + 1}</strong> of{" "}
                <strong>{pageCount}</strong>
              </div>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={currentPage >= pageCount - 1}
                className="h-[30px] px-3 rounded-[8px] border border-brand-border bg-white text-[12px] font-bold text-brand-charcoal hover:border-brand-orange disabled:opacity-40 disabled:hover:border-brand-border"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk confirmation modals */}
      {modal === "email" && (
        <BulkSendModal
          kind="email"
          leadIds={Array.from(selected).slice(0, BULK_MAX)}
          templates={emailTemplates.map((t) => ({ id: t.id, name: t.name }))}
          onClose={() => setModal(null)}
          onSent={() => {
            setModal(null);
            clearSelection();
          }}
        />
      )}
      {modal === "whatsapp" && (
        <BulkSendModal
          kind="whatsapp"
          leadIds={Array.from(selected).slice(0, BULK_MAX)}
          templates={waTemplates
            .filter((t) => t.approval_status === "approved")
            .map((t) => ({ id: t.id, name: t.name }))}
          onClose={() => setModal(null)}
          onSent={() => {
            setModal(null);
            clearSelection();
          }}
        />
      )}
    </div>
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
      className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.6px] text-brand-dark-text ${className}`}
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
  return <td className={`px-4 py-3 text-[13.5px] text-brand-charcoal ${className}`}>{children}</td>;
}

function BulkSendModal({
  kind,
  leadIds,
  templates,
  onClose,
  onSent,
}: {
  kind: "email" | "whatsapp";
  leadIds: string[];
  templates: { id: string; name: string }[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [templateId, setTemplateId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSend() {
    setError(null);
    if (!templateId) {
      setError("Pick a template first.");
      return;
    }
    startTransition(async () => {
      const res =
        kind === "email"
          ? await bulkSendEmailAction(leadIds, templateId)
          : await bulkSendWhatsAppAction(leadIds, templateId);
      if (!res.ok) {
        setError(res.error ?? "Send failed.");
        return;
      }
      setResult(res);
      // Give the user a moment to read the summary before closing.
      setTimeout(() => onSent(), 2500);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-brand-border">
          <h3 className="text-[16px] font-bold text-brand-charcoal">
            {kind === "email" ? "Send Email" : "Send WhatsApp"} to {leadIds.length}{" "}
            {leadIds.length === 1 ? "lead" : "leads"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-brand-bg text-brand-dark-text"
            title="Cancel"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {result ? (
            <div className="text-[13.5px] text-brand-charcoal">
              <div className="font-bold text-green-700 mb-2">✓ Done</div>
              <div>Sent: {result.sent ?? 0}</div>
              <div>Skipped: {result.skipped ?? 0}</div>
              {result.errors && result.errors.length > 0 && (
                <details className="mt-2 text-[12px] text-brand-dark-text">
                  <summary>Show skip reasons</summary>
                  <ul className="mt-1 pl-4 list-disc">
                    {result.errors.map((e, i) => (
                      <li key={i}>
                        {e.leadId.slice(0, 6)}… — {e.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                  Template
                </span>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="h-[40px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal focus:outline-none focus:border-brand-orange"
                >
                  <option value="">— Pick a template —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {templates.length === 0 && (
                  <span className="text-[11.5px] text-brand-dark-text">
                    No {kind === "email" ? "email" : "approved WhatsApp"}{" "}
                    templates exist yet.
                  </span>
                )}
              </label>
              <div className="text-[12.5px] text-brand-dark-text bg-brand-bg rounded-[10px] px-3 py-2">
                About to send to <strong>{leadIds.length}</strong>{" "}
                {leadIds.length === 1 ? "person" : "people"}. Leads without a{" "}
                {kind === "email" ? "email address" : "phone number"} will be
                skipped.
              </div>
              {error && (
                <div className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-[8px] px-3 py-2">
                  {error}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-[36px] px-4 rounded-[10px] border border-brand-border text-[13px] font-bold text-brand-charcoal hover:bg-brand-bg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSend}
                  disabled={pending || !templateId}
                  className="h-[36px] px-4 rounded-[10px] bg-brand-orange text-white text-[13px] font-bold hover:bg-brand-orange-dark disabled:opacity-50"
                >
                  {pending ? "Sending…" : "Send now"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
