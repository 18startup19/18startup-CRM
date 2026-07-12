"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, ExternalLink, Pencil, Plus, Power, X } from "lucide-react";
import {
  Card,
  FieldError,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createPaymentPageAction,
  togglePaymentPageActiveAction,
  updatePaymentPageAction,
  type PaymentPageActionResult,
} from "@/app/actions/payment-pages";
import type {
  CohortRow,
  LeadStageRow,
  PaymentPageRow,
  PipelineRow,
  UserRow,
} from "@/lib/database.types";

interface Props {
  pages: PaymentPageRow[];
  cohorts: Pick<CohortRow, "id" | "number" | "label">[];
  pipelines: Pick<PipelineRow, "id" | "name">[];
  stages: Pick<LeadStageRow, "id" | "name" | "pipeline_id" | "color">[];
  users: Pick<UserRow, "id" | "name" | "email">[];
}

export function PaymentPagesManager({
  pages,
  cohorts,
  pipelines,
  stages,
  users,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const active = pages.filter((p) => p.is_active);
  const inactive = pages.filter((p) => !p.is_active);

  return (
    <div className="flex flex-col gap-6">
      {!creating && !editingId && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)} className="flex items-center gap-2">
            <Plus size={14} /> New payment page
          </Button>
        </div>
      )}

      {creating && (
        <PageForm
          mode="create"
          cohorts={cohorts}
          pipelines={pipelines}
          stages={stages}
          users={users}
          onDone={() => setCreating(false)}
        />
      )}

      {editingId && (
        <PageForm
          mode="edit"
          page={pages.find((p) => p.id === editingId)!}
          cohorts={cohorts}
          pipelines={pipelines}
          stages={stages}
          users={users}
          onDone={() => setEditingId(null)}
        />
      )}

      {!creating && !editingId && (
        <>
          <PageList
            heading={`Active pages (${active.length})`}
            pages={active}
            cohorts={cohorts}
            pipelines={pipelines}
            stages={stages}
            users={users}
            onEdit={setEditingId}
          />
          {inactive.length > 0 && (
            <PageList
              heading={`Inactive (${inactive.length})`}
              pages={inactive}
              cohorts={cohorts}
              pipelines={pipelines}
              stages={stages}
              users={users}
              onEdit={setEditingId}
            />
          )}
        </>
      )}
    </div>
  );
}

function PageList({
  heading,
  pages,
  cohorts,
  pipelines,
  stages,
  users,
  onEdit,
}: {
  heading: string;
  pages: PaymentPageRow[];
  cohorts: Pick<CohortRow, "id" | "number" | "label">[];
  pipelines: Pick<PipelineRow, "id" | "name">[];
  stages: Pick<LeadStageRow, "id" | "name" | "pipeline_id" | "color">[];
  users: Pick<UserRow, "id" | "name" | "email">[];
  onEdit: (id: string) => void;
}) {
  if (pages.length === 0) return null;
  return (
    <Card>
      <h3 className="text-[13px] font-bold uppercase tracking-[0.5px] text-brand-dark-text mb-3">
        {heading}
      </h3>
      <div className="flex flex-col gap-3">
        {pages.map((p) => (
          <PageRow
            key={p.id}
            page={p}
            cohorts={cohorts}
            pipelines={pipelines}
            stages={stages}
            users={users}
            onEdit={onEdit}
          />
        ))}
      </div>
    </Card>
  );
}

function PageRow({
  page,
  cohorts,
  pipelines,
  stages,
  users,
  onEdit,
}: {
  page: PaymentPageRow;
  cohorts: Pick<CohortRow, "id" | "number" | "label">[];
  pipelines: Pick<PipelineRow, "id" | "name">[];
  stages: Pick<LeadStageRow, "id" | "name" | "pipeline_id" | "color">[];
  users: Pick<UserRow, "id" | "name" | "email">[];
  onEdit: (id: string) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const publicUrl = origin ? `${origin}/pay/${page.id}` : "";

  function copyUrl() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    });
  }

  function toggle() {
    startTransition(async () => {
      await togglePaymentPageActiveAction(page.id, !page.is_active);
    });
  }

  const cohort = cohorts.find((c) => c.id === page.cohort_id);
  const stage = stages.find((s) => s.id === page.stage_id);
  const pipeline = pipelines.find((pl) => pl.id === page.pipeline_id);
  const owner = users.find((u) => u.id === page.owner_id);
  const rupees = (page.amount_paise / 100).toFixed(2);

  return (
    <div className="border border-brand-border rounded-[10px] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-brand-charcoal">
              {page.internal_label}
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.5px] px-2 py-0.5 rounded-full ${page.mode === "live" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
            >
              {page.mode}
            </span>
            {!page.is_active && (
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                Inactive
              </span>
            )}
          </div>
          <div className="text-[12px] text-brand-dark-text mt-0.5">
            {page.title} · ₹{rupees} · {cohort ? `Cohort ${cohort.number}` : "Small workshop"}
          </div>
          <div className="text-[11px] text-brand-dark-text mt-1 flex gap-3 flex-wrap">
            {pipeline && <span>Pipeline: {pipeline.name}</span>}
            {stage && <span>Stage: {stage.name}</span>}
            {owner && <span>Owner: {owner.name}</span>}
            {page.tags.length > 0 && <span>Tags: {page.tags.join(", ")}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(page.id)}
            className="p-2 rounded hover:bg-brand-bg text-brand-dark-text hover:text-brand-orange"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={toggle}
            disabled={pending}
            className="p-2 rounded hover:bg-brand-bg text-brand-dark-text hover:text-brand-orange disabled:opacity-50"
            title={page.is_active ? "Deactivate on Razorpay" : "Reactivate"}
          >
            <Power size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-brand-bg rounded-[8px] px-3 py-2">
        <input
          type="text"
          readOnly
          value={publicUrl}
          placeholder="Loading URL…"
          className="flex-1 bg-transparent text-[12px] text-brand-charcoal outline-none"
        />
        <button
          type="button"
          onClick={copyUrl}
          disabled={!publicUrl}
          className="flex items-center gap-1 text-[11px] font-bold text-brand-orange hover:text-brand-orange-dark disabled:opacity-40"
        >
          <Copy size={12} />
          {copyState === "copied" ? "Copied!" : "Copy"}
        </button>
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] font-bold text-brand-charcoal hover:text-brand-orange"
          >
            <ExternalLink size={12} />
            Open
          </a>
        )}
      </div>
    </div>
  );
}

function PageForm({
  mode,
  page,
  cohorts,
  pipelines,
  stages,
  users,
  onDone,
}: {
  mode: "create" | "edit";
  page?: PaymentPageRow;
  cohorts: Pick<CohortRow, "id" | "number" | "label">[];
  pipelines: Pick<PipelineRow, "id" | "name">[];
  stages: Pick<LeadStageRow, "id" | "name" | "pipeline_id" | "color">[];
  users: Pick<UserRow, "id" | "name" | "email">[];
  onDone: () => void;
}) {
  const [pipelineId, setPipelineId] = useState<string>(page?.pipeline_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredStages = pipelineId
    ? stages.filter((s) => s.pipeline_id === pipelineId)
    : stages;

  function onSubmit(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res: PaymentPageActionResult =
        mode === "create"
          ? await createPaymentPageAction(undefined, fd)
          : await updatePaymentPageAction(page!.id, undefined, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-brand-charcoal">
          {mode === "create" ? "New payment page" : "Edit payment page"}
        </h3>
        <button
          type="button"
          onClick={onDone}
          className="p-1.5 rounded hover:bg-brand-bg text-brand-dark-text"
          title="Cancel"
        >
          <X size={14} />
        </button>
      </div>

      <form action={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="internal_label">
              Internal label
              <span className="text-brand-dark-text font-normal ml-1">
                (admin-only)
              </span>
            </FieldLabel>
            <Input
              id="internal_label"
              name="internal_label"
              required
              defaultValue={page?.internal_label ?? ""}
              placeholder="Idea Validation Workshop – Aug"
            />
          </div>
          {mode === "create" && (
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="mode">Mode</FieldLabel>
              <Select id="mode" name="mode" defaultValue="test">
                <option value="test">Test (safe to try)</option>
                <option value="live">Live (real money)</option>
              </Select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="title">Buyer-facing title</FieldLabel>
            <Input
              id="title"
              name="title"
              required
              defaultValue={page?.title ?? ""}
              placeholder="Idea Validation Workshop"
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="program_name">
              Program name
              <span className="text-brand-dark-text font-normal ml-1">
                (shown to buyer)
              </span>
            </FieldLabel>
            <Input
              id="program_name"
              name="program_name"
              defaultValue={page?.program_name ?? ""}
              placeholder="Founders Program"
            />
          </div>
        </div>

        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="description">
            Description
            <span className="text-brand-dark-text font-normal ml-1">
              (shown to buyer)
            </span>
          </FieldLabel>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={page?.description ?? ""}
            placeholder="2-hour live workshop. What you'll learn…"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="amount_rupees">Amount (₹)</FieldLabel>
            <Input
              id="amount_rupees"
              name="amount_rupees"
              type="number"
              step="0.01"
              min="1"
              required
              defaultValue={page ? (page.amount_paise / 100).toString() : ""}
              placeholder="199"
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="image_url">
              Image URL
              <span className="text-brand-dark-text font-normal ml-1">
                (optional)
              </span>
            </FieldLabel>
            <Input
              id="image_url"
              name="image_url"
              type="url"
              defaultValue={page?.image_url ?? ""}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="thank_you_url">
            Thank-you redirect URL
            <span className="text-brand-dark-text font-normal ml-1">
              (after successful payment, buyer sees a &quot;Continue&quot; button
              that opens this)
            </span>
          </FieldLabel>
          <Input
            id="thank_you_url"
            name="thank_you_url"
            type="url"
            defaultValue={page?.thank_you_url ?? ""}
            placeholder="https://your-site.com/thank-you"
          />
        </div>

        <div className="border-t border-brand-border pt-4 mt-2">
          <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-orange mb-3">
            Where does the lead go?
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="cohort_id">
                Cohort
                <span className="text-brand-dark-text font-normal ml-1">
                  (leave blank for small workshops)
                </span>
              </FieldLabel>
              <Select
                id="cohort_id"
                name="cohort_id"
                defaultValue={page?.cohort_id ?? ""}
              >
                <option value="">— None (small workshop) —</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    Cohort {c.number}
                    {c.label ? ` – ${c.label}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="pipeline_id">Pipeline</FieldLabel>
              <Select
                id="pipeline_id"
                name="pipeline_id"
                value={pipelineId}
                onChange={(e) => setPipelineId(e.target.value)}
              >
                <option value="">— Default —</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="stage_id">Landing stage</FieldLabel>
              <Select
                id="stage_id"
                name="stage_id"
                defaultValue={page?.stage_id ?? ""}
              >
                <option value="">— First open stage —</option>
                {filteredStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="owner_id">Assign to</FieldLabel>
              <Select
                id="owner_id"
                name="owner_id"
                defaultValue={page?.owner_id ?? ""}
              >
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-[7px] md:col-span-2">
              <FieldLabel htmlFor="tags">
                Tags
                <span className="text-brand-dark-text font-normal ml-1">
                  (comma-separated)
                </span>
              </FieldLabel>
              <Input
                id="tags"
                name="tags"
                defaultValue={page?.tags.join(", ") ?? ""}
                placeholder="workshop, paid"
              />
            </div>
          </div>
        </div>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex items-center justify-end gap-2 border-t border-brand-border pt-4">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "Saving…"
              : mode === "create"
                ? "Create page"
                : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
