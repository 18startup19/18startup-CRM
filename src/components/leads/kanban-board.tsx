"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Upload, Search, X } from "lucide-react";
import type {
  CustomFieldRow,
  LeadRow,
  LeadStageRow,
  PipelineRow,
  UserRow,
} from "@/lib/database.types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createPipelineAction,
  type PipelineResult,
} from "@/app/actions/pipelines";
import {
  bulkUpdateLeadsAction,
  moveLeadStageAction,
  saveKanbanCardFieldsAction,
} from "@/app/actions/kanban";
import { formatRelative } from "@/lib/utils";

const BUILTIN_FIELDS: { key: string; label: string }[] = [
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "source", label: "Source" },
  { key: "owner", label: "Owner" },
  { key: "next_callback_at", label: "Next callback" },
  { key: "updated_at", label: "Last updated" },
];

export interface KanbanFilters {
  q: string;
  owner: string;
  tag: string;
  dnc: boolean;
  sort: "updated_desc" | "created_desc" | "created_asc" | "name_asc";
}

export interface FieldFilter {
  field: string;
  op: string;
  value: string;
}

interface Props {
  pipelines: PipelineRow[];
  activePipelineId: string;
  stages: LeadStageRow[];
  allStages: LeadStageRow[];
  leadsByStage: Record<string, LeadRow[]>;
  customFields: CustomFieldRow[];
  cardFields: string[];
  ownerNamesById: Record<string, string>;
  users: Pick<UserRow, "id" | "name">[];
  isAdmin: boolean;
  filters: KanbanFilters;
  tagOptions: string[];
  activeFilters: FieldFilter[];
}

export function KanbanBoard({
  pipelines,
  activePipelineId,
  stages,
  allStages,
  leadsByStage: initialLeadsByStage,
  customFields,
  cardFields: initialCardFields,
  ownerNamesById,
  users,
  isAdmin,
  filters,
  tagOptions,
  activeFilters,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [leadsByStage, setLeadsByStage] = useState(initialLeadsByStage);

  // Sync local state when the server sends fresh data (after filter/sort URL
  // changes route through the server component).
  useEffect(() => {
    setLeadsByStage(initialLeadsByStage);
  }, [initialLeadsByStage]);

  // Live sort — pure client state so changing the Sort dropdown re-orders
  // instantly. The URL is synced via history.replaceState so a shared link
  // still renders sorted correctly, but no server round-trip happens.
  const [liveSort, setLiveSort] = useState<KanbanFilters["sort"]>(filters.sort);
  // Keep useSearchParams referenced so the linter doesn't complain — used to
  // pick up URL sort on subsequent full navigations.
  void searchParams;
  const sortedLeadsByStage = useMemo(() => {
    const out: Record<string, LeadRow[]> = {};
    for (const [stageId, cards] of Object.entries(leadsByStage)) {
      const copy = [...cards];
      copy.sort((a, b) => {
        switch (liveSort) {
          case "created_desc":
            return b.created_at.localeCompare(a.created_at);
          case "created_asc":
            return a.created_at.localeCompare(b.created_at);
          case "name_asc":
            return a.name.localeCompare(b.name);
          case "updated_desc":
          default:
            return b.updated_at.localeCompare(a.updated_at);
        }
      });
      out[stageId] = copy;
    }
    return out;
  }, [leadsByStage, liveSort]);
  const [dragging, setDragging] = useState<{ leadId: string; fromStage: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const [customizing, setCustomizing] = useState(false);
  const [cardFields, setCardFields] = useState<string[]>(initialCardFields);
  const [addingPipeline, setAddingPipeline] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const fieldOptions = useMemo(
    () => [
      ...BUILTIN_FIELDS,
      ...customFields.map((f) => ({ key: `cf:${f.key}`, label: f.label })),
    ],
    [customFields],
  );

  function onPipelineChange(id: string) {
    setSelected(new Set());
    const url = new URL(window.location.href);
    url.searchParams.set("pipeline", id);
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function updateFilter(patch: Partial<KanbanFilters>) {
    setSelected(new Set());
    const url = new URL(window.location.href);
    const setOrDelete = (key: string, value: string | boolean) => {
      const str = typeof value === "boolean" ? (value ? "1" : "") : value;
      if (str) url.searchParams.set(key, str);
      else url.searchParams.delete(key);
    };
    if (patch.q !== undefined) setOrDelete("q", patch.q);
    if (patch.owner !== undefined) setOrDelete("owner", patch.owner);
    if (patch.tag !== undefined) setOrDelete("tag", patch.tag);
    if (patch.dnc !== undefined) setOrDelete("dnc", patch.dnc);
    if (patch.sort !== undefined && patch.sort !== "updated_desc") {
      url.searchParams.set("sort", patch.sort);
    } else if (patch.sort === "updated_desc") {
      url.searchParams.delete("sort");
    }
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
    router.refresh();
  }

  const hasActiveFilters =
    filters.q !== "" ||
    filters.owner !== "" ||
    filters.tag !== "" ||
    filters.dnc ||
    activeFilters.length > 0;

  function addFieldFilter(f: FieldFilter) {
    const url = new URL(window.location.href);
    const raws = url.searchParams.getAll("filter");
    raws.push(`${f.field}|${f.op}|${f.value}`);
    url.searchParams.delete("filter");
    for (const r of raws) url.searchParams.append("filter", r);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
    router.refresh();
  }

  function removeFieldFilter(idx: number) {
    const url = new URL(window.location.href);
    const raws = url.searchParams.getAll("filter");
    raws.splice(idx, 1);
    url.searchParams.delete("filter");
    for (const r of raws) url.searchParams.append("filter", r);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
    router.refresh();
  }

  function clearAllFilters() {
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    url.searchParams.delete("owner");
    url.searchParams.delete("tag");
    url.searchParams.delete("dnc");
    url.searchParams.delete("filter");
    router.replace(`${url.pathname}?${url.searchParams.toString()}`);
    router.refresh();
  }

  function onDragStart(leadId: string, fromStage: string) {
    setDragging({ leadId, fromStage });
  }

  function onColumnDragOver(e: React.DragEvent, stageId: string) {
    if (!dragging) return;
    e.preventDefault();
    setDropTarget(stageId);
  }

  function onColumnDrop(e: React.DragEvent, toStageId: string) {
    e.preventDefault();
    if (!dragging) return;
    const { leadId, fromStage } = dragging;
    setDragging(null);
    setDropTarget(null);
    if (fromStage === toStageId) return;

    setLeadsByStage((prev) => {
      const next = { ...prev };
      const fromList = [...(next[fromStage] ?? [])];
      const idx = fromList.findIndex((l) => l.id === leadId);
      if (idx === -1) return prev;
      const [moved] = fromList.splice(idx, 1);
      next[fromStage] = fromList;
      next[toStageId] = [{ ...moved, stage_id: toStageId }, ...(next[toStageId] ?? [])];
      return next;
    });

    startTransition(async () => {
      await moveLeadStageAction(leadId, toStageId);
      router.refresh();
    });
  }

  function toggleCardField(key: string) {
    setCardFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  function saveCardFields() {
    startTransition(async () => {
      await saveKanbanCardFieldsAction(cardFields);
      setCustomizing(false);
      router.refresh();
    });
  }

  function toggleLeadSelect(leadId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleColumnSelect(stageId: string) {
    const ids = (leadsByStage[stageId] ?? []).map((l) => l.id);
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function runBulk(patch: { stageId?: string; ownerId?: string; isDnc?: boolean }) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await bulkUpdateLeadsAction(ids, patch);
      if (res.error) {
        alert(res.error);
        return;
      }
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-[0.6px] text-brand-dark-text">
            Pipeline
          </span>
          <select
            value={activePipelineId}
            onChange={(e) => onPipelineChange(e.target.value)}
            className="appearance-none px-3 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] font-semibold text-brand-charcoal outline-none hover:border-brand-orange transition-colors pr-8"
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <NewPipelineButton
            adding={addingPipeline}
            setAdding={setAddingPipeline}
            onCreated={(id) => onPipelineChange(id)}
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <Link href="/leads/new">
            <Button variant="primary" size="sm">
              <Plus size={14} className="inline mr-1 -mt-0.5" />
              New lead
            </Button>
          </Link>
          <Link href="/leads/import">
            <Button variant="outline" size="sm">
              <Upload size={14} className="inline mr-1 -mt-0.5" />
              Import
            </Button>
          </Link>
        </div>

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomizing((v) => !v)}
          >
            Customize card
          </Button>
          {customizing && (
            <div className="absolute right-0 top-full mt-2 w-72 z-20 bg-white border border-brand-border rounded-[12px] shadow-lg p-4">
              <div className="text-[12px] font-bold uppercase tracking-[0.6px] text-brand-dark-text mb-3">
                Fields on the card
              </div>
              <div className="max-h-72 overflow-y-auto flex flex-col gap-2">
                {fieldOptions.map((f) => (
                  <label
                    key={f.key}
                    className="flex items-center gap-2 text-[13px] text-brand-charcoal cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={cardFields.includes(f.key)}
                      onChange={() => toggleCardField(f.key)}
                    />
                    {f.label}
                  </label>
                ))}
                {customFields.length === 0 && (
                  <div className="text-[11px] text-brand-dark-text mt-2">
                    Define custom fields in Admin → Custom fields to add them here.
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" size="sm" onClick={() => setCustomizing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveCardFields}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={filters.owner}
          onChange={(e) => updateFilter({ owner: e.target.value })}
          className="appearance-none px-3 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] font-semibold text-brand-charcoal outline-none pr-8"
        >
          <option value="">Any owner</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={filters.tag}
          onChange={(e) => updateFilter({ tag: e.target.value })}
          className="appearance-none px-3 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] font-semibold text-brand-charcoal outline-none pr-8"
        >
          <option value="">Any tag</option>
          {tagOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] font-semibold text-brand-dark-text px-2 py-1.5 rounded-[8px] border border-transparent cursor-pointer hover:bg-white">
          <input
            type="checkbox"
            checked={filters.dnc}
            onChange={(e) => updateFilter({ dnc: e.target.checked })}
          />
          DNC only
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
            Sort
          </span>
          <select
            value={liveSort}
            onChange={(e) => {
              const value = e.target.value as KanbanFilters["sort"];
              setLiveSort(value);
              // Sync URL for shareable links, without a server round-trip.
              const url = new URL(window.location.href);
              if (value === "updated_desc") url.searchParams.delete("sort");
              else url.searchParams.set("sort", value);
              window.history.replaceState({}, "", url.toString());
            }}
            className="appearance-none px-3 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] font-semibold text-brand-charcoal outline-none pr-8"
          >
            <option value="updated_desc">Last activity</option>
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="name_asc">Alphabetical</option>
          </select>
        </div>
        <FieldFilterPopover
          onAdd={addFieldFilter}
          customFields={customFields}
          allStages={allStages}
        />
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-[12px] font-bold text-brand-dark-text hover:text-brand-charcoal inline-flex items-center gap-1"
          >
            <X size={12} />
            Clear filters
          </button>
        )}
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {activeFilters.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-orange/10 text-brand-orange text-[12px] font-bold"
            >
              {fieldLabel(f.field, customFields)} {opLabel(f.op)} {f.value || "—"}
              <button
                onClick={() => removeFieldFilter(i)}
                className="hover:text-brand-orange-dark"
                aria-label="Remove filter"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {stages.length === 0 ? (
        <div className="text-center text-brand-dark-text text-[13px] py-16 border border-dashed border-brand-border rounded-[12px]">
          No stages in this pipeline yet. Add one from Admin → Lead stages.
        </div>
      ) : (
        <div className="overflow-x-auto pb-24">
          <div className="flex gap-3 min-w-max">
            {stages.map((s) => {
              const cards = sortedLeadsByStage[s.id] ?? [];
              const isTarget = dropTarget === s.id;
              const cardIds = cards.map((c) => c.id);
              const allSelected =
                cardIds.length > 0 && cardIds.every((id) => selected.has(id));
              const someSelected = cardIds.some((id) => selected.has(id));
              return (
                <div
                  key={s.id}
                  className="w-[260px] shrink-0"
                  onDragOver={(e) => onColumnDragOver(e, s.id)}
                  onDragLeave={() => setDropTarget((cur) => (cur === s.id ? null : cur))}
                  onDrop={(e) => onColumnDrop(e, s.id)}
                >
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ background: s.color }}
                    />
                    <span className="text-[12px] font-bold text-brand-charcoal uppercase tracking-[0.4px] truncate flex-1">
                      {s.name}
                    </span>
                    <span className="text-[11px] font-semibold text-brand-dark-text">
                      {cards.length}
                    </span>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allSelected && someSelected;
                      }}
                      onChange={() => toggleColumnSelect(s.id)}
                      disabled={cardIds.length === 0}
                      className="cursor-pointer"
                      title={`Select all in ${s.name}`}
                    />
                  </div>
                  <div
                    className={
                      "flex flex-col gap-2 p-1.5 rounded-[10px] min-h-[80px] transition-colors " +
                      (isTarget ? "bg-brand-orange/10 outline-2 outline-dashed outline-brand-orange" : "")
                    }
                  >
                    {cards.map((l) => (
                      <LeadCard
                        key={l.id}
                        lead={l}
                        cardFields={cardFields}
                        customFields={customFields}
                        ownerNamesById={ownerNamesById}
                        checked={selected.has(l.id)}
                        onToggleSelect={() => toggleLeadSelect(l.id)}
                        onDragStart={() => onDragStart(l.id, s.id)}
                        onDragEnd={() => {
                          setDragging(null);
                          setDropTarget(null);
                        }}
                        isDragging={dragging?.leadId === l.id}
                      />
                    ))}
                    {cards.length === 0 && !isTarget && (
                      <div className="text-center text-brand-dark-text text-[11px] py-3">—</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          stages={stages}
          users={users}
          onClear={() => setSelected(new Set())}
          onMoveStage={(id) => runBulk({ stageId: id })}
          onAssignOwner={(id) => runBulk({ ownerId: id })}
          onDnc={(v) => runBulk({ isDnc: v })}
        />
      )}
    </div>
  );
}

function LeadCard({
  lead,
  cardFields,
  customFields,
  ownerNamesById,
  checked,
  onToggleSelect,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  lead: LeadRow;
  cardFields: string[];
  customFields: CustomFieldRow[];
  ownerNamesById: Record<string, string>;
  checked: boolean;
  onToggleSelect: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={
        "p-3 cursor-grab active:cursor-grabbing hover:border-brand-orange transition-colors relative " +
        (isDragging ? "opacity-40" : "") +
        (checked ? " border-brand-orange ring-1 ring-brand-orange/40" : "")
      }
    >
      <label
        className="absolute top-2.5 right-2.5 flex items-center cursor-pointer"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleSelect}
          className="cursor-pointer"
        />
      </label>
      <Link href={`/leads/${lead.id}`} className="block pr-6" draggable={false}>
        <div className="font-semibold text-brand-charcoal text-[13.5px] leading-snug">
          {lead.name}
        </div>
        <div className="flex flex-col gap-0.5 mt-1.5">
          {cardFields.map((key) => {
            const rendered = renderCardField(key, lead, customFields, ownerNamesById);
            if (!rendered) return null;
            return (
              <div key={key} className="text-[11.5px] text-brand-dark-text truncate">
                {rendered}
              </div>
            );
          })}
        </div>
      </Link>
    </Card>
  );
}

function BulkBar({
  count,
  stages,
  users,
  onClear,
  onMoveStage,
  onAssignOwner,
  onDnc,
}: {
  count: number;
  stages: LeadStageRow[];
  users: Pick<UserRow, "id" | "name">[];
  onClear: () => void;
  onMoveStage: (stageId: string) => void;
  onAssignOwner: (ownerId: string) => void;
  onDnc: (value: boolean) => void;
}) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-white border border-brand-border rounded-[14px] shadow-xl px-5 py-3 flex items-center gap-4">
      <span className="text-[13px] font-bold text-brand-charcoal">
        {count} selected
      </span>
      <div className="h-6 w-px bg-brand-border" />
      <label className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
        Move to
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) {
              onMoveStage(v);
              e.target.value = "";
            }
          }}
          className="appearance-none px-2 py-1 rounded-[6px] border border-brand-border text-[12px] font-semibold text-brand-charcoal outline-none pr-6"
        >
          <option value="">Stage…</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
        Assign
        <select
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value;
            if (v) {
              onAssignOwner(v);
              e.target.value = "";
            }
          }}
          className="appearance-none px-2 py-1 rounded-[6px] border border-brand-border text-[12px] font-semibold text-brand-charcoal outline-none pr-6"
        >
          <option value="">Owner…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => onDnc(true)}
        className="text-[12px] font-bold text-red-600 hover:text-red-700"
      >
        Mark DNC
      </button>
      <div className="h-6 w-px bg-brand-border" />
      <button
        onClick={onClear}
        className="text-[12px] font-bold text-brand-dark-text hover:text-brand-charcoal"
      >
        Clear
      </button>
    </div>
  );
}

function renderCardField(
  key: string,
  lead: LeadRow,
  customFields: CustomFieldRow[],
  ownerNamesById: Record<string, string>,
): string | null {
  switch (key) {
    case "phone":
      return lead.phone || null;
    case "email":
      return lead.email || null;
    case "source":
      return lead.source ? `Source: ${lead.source}` : null;
    case "owner":
      return lead.owner_id ? ownerNamesById[lead.owner_id] ?? null : null;
    case "next_callback_at":
      return lead.next_callback_at ? `Callback ${formatRelative(lead.next_callback_at)}` : null;
    case "updated_at":
      return `Updated ${formatRelative(lead.updated_at)}`;
    default: {
      if (!key.startsWith("cf:")) return null;
      const cfKey = key.slice(3);
      const def = customFields.find((f) => f.key === cfKey);
      const value = lead.custom?.[cfKey];
      if (value == null || value === "") return null;
      const label = def?.label ?? cfKey;
      return `${label}: ${String(value)}`;
    }
  }
}

const BUILTIN_FILTERABLE_FIELDS = [
  { key: "name", label: "Name", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "email", label: "Email", type: "text" },
  { key: "source", label: "Source", type: "text" },
  { key: "stage", label: "Stage", type: "stage" },
  { key: "is_dnc", label: "Do-not-contact", type: "boolean" },
] as const;

const OPS = [
  { key: "eq", label: "equals" },
  { key: "neq", label: "does not equal" },
  { key: "contains", label: "contains" },
  { key: "is_empty", label: "is empty" },
  { key: "is_not_empty", label: "is not empty" },
] as const;

function fieldLabel(key: string, customFields: CustomFieldRow[]): string {
  const builtin = BUILTIN_FILTERABLE_FIELDS.find((f) => f.key === key);
  if (builtin) return builtin.label;
  if (key.startsWith("custom.")) {
    const cfKey = key.slice(7);
    return customFields.find((f) => f.key === cfKey)?.label ?? cfKey;
  }
  return key;
}

function opLabel(op: string): string {
  return OPS.find((o) => o.key === op)?.label ?? op;
}

function FieldFilterPopover({
  onAdd,
  customFields,
  allStages,
}: {
  onAdd: (f: FieldFilter) => void;
  customFields: CustomFieldRow[];
  allStages: LeadStageRow[];
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<string>("name");
  const [op, setOp] = useState<string>("contains");
  const [value, setValue] = useState<string>("");

  const allFields = [
    ...BUILTIN_FILTERABLE_FIELDS.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type as string,
    })),
    ...customFields.map((f) => ({
      key: `custom.${f.key}`,
      label: f.label,
      type:
        f.type === "dropdown"
          ? "dropdown"
          : f.type === "checkbox"
            ? "boolean"
            : "text",
      options: f.options,
    })),
  ];
  const current = allFields.find((f) => f.key === field);
  const needsValue = op !== "is_empty" && op !== "is_not_empty";

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        + Filter
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] z-30 bg-white border border-brand-border rounded-[12px] shadow-lg p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                Field
              </label>
              <select
                value={field}
                onChange={(e) => setField(e.target.value)}
                className="px-3 py-2 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none appearance-none pr-8"
              >
                {allFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                Condition
              </label>
              <select
                value={op}
                onChange={(e) => setOp(e.target.value)}
                className="px-3 py-2 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none appearance-none pr-8"
              >
                {OPS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {needsValue && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                  Value
                </label>
                {current?.type === "stage" ? (
                  <select
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="px-3 py-2 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none appearance-none pr-8"
                  >
                    <option value="">Pick a stage…</option>
                    {allStages.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : current?.type === "dropdown" && "options" in current ? (
                  <select
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="px-3 py-2 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none appearance-none pr-8"
                  >
                    <option value="">—</option>
                    {(current.options as string[]).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : current?.type === "boolean" ? (
                  <select
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="px-3 py-2 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none appearance-none pr-8"
                  >
                    <option value="">—</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : (
                  <input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="px-3 py-2 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none"
                  />
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (needsValue && !value) return;
                  onAdd({ field, op, value });
                  setValue("");
                  setOpen(false);
                }}
              >
                Add filter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPipelineButton({
  adding,
  setAdding,
  onCreated,
}: {
  adding: boolean;
  setAdding: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [state, formAction, isPending] = useActionState<PipelineResult, FormData>(
    createPipelineAction,
    {},
  );

  if (state.ok && state.pipelineId && adding) {
    setAdding(false);
    onCreated(state.pipelineId);
  }

  if (!adding) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
        + New pipeline
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input
        name="name"
        autoFocus
        placeholder="Pipeline name"
        className="px-3 py-1.5 rounded-[8px] border-[1.5px] border-brand-border bg-white text-[13px] outline-none focus:border-brand-orange"
      />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "…" : "Create"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setAdding(false)} type="button">
        Cancel
      </Button>
      {state.error && <span className="text-[12px] text-red-500">{state.error}</span>}
    </form>
  );
}
