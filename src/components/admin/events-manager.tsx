"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import {
  Calendar,
  Copy,
  ExternalLink,
  Plus,
  QrCode,
  X,
} from "lucide-react";
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
  createEventAction,
  updateEventAction,
  type EventActionResult,
} from "@/app/actions/events";
import { isoToLocalInput, localInputToIso } from "@/lib/utils";
import type {
  EventExtraField,
  EventRow,
  LeadStageRow,
  PipelineRow,
  UserRow,
} from "@/lib/database.types";

interface EventDecorated extends EventRow {
  stats: { registered: number; attended: number };
}

interface Props {
  events: EventDecorated[];
  pipelines: Pick<PipelineRow, "id" | "name">[];
  stages: Pick<LeadStageRow, "id" | "name" | "pipeline_id" | "color">[];
  users: Pick<UserRow, "id" | "name" | "email">[];
}

export function EventsManager({ events, pipelines, stages, users }: Props) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? events.find((e) => e.id === editingId) : null;

  return (
    <div className="flex flex-col gap-6">
      {!creating && !editingId && (
        <div className="flex justify-end">
          <Button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2"
          >
            <Plus size={14} /> New event
          </Button>
        </div>
      )}

      {creating && (
        <EventForm
          mode="create"
          pipelines={pipelines}
          stages={stages}
          users={users}
          onDone={() => setCreating(false)}
        />
      )}

      {editing && (
        <EventForm
          mode="edit"
          event={editing}
          pipelines={pipelines}
          stages={stages}
          users={users}
          onDone={() => setEditingId(null)}
        />
      )}

      {!creating && !editingId && (
        <div className="flex flex-col gap-3">
          {events.length === 0 && (
            <div className="text-center py-10 text-[13px] text-brand-dark-text">
              No events yet.
            </div>
          )}
          {events.map((e) => (
            <EventCard key={e.id} event={e} onEdit={setEditingId} />
          ))}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  onEdit,
}: {
  event: EventDecorated;
  onEdit: (id: string) => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [publicUrl, setPublicUrl] = useState<string>("");

  useEffect(() => {
    const payDomain = process.env.NEXT_PUBLIC_PAY_DOMAIN?.trim();
    const base = payDomain ? `https://${payDomain}` : window.location.origin;
    setPublicUrl(`${base}/e/${event.slug}`);
  }, [event.slug]);

  function copyUrl() {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    });
  }

  const startDate = new Date(event.starts_at);
  const startLabel = startDate.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const rupees = (event.amount_paise / 100).toFixed(2);
  const capacityLabel = event.capacity
    ? `${event.stats.registered} / ${event.capacity}`
    : `${event.stats.registered}`;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-bold text-brand-charcoal truncate">
              {event.internal_label}
            </h3>
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.5px] px-2 py-0.5 rounded-full ${event.mode === "live" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
            >
              {event.mode}
            </span>
            {event.is_published ? (
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] px-2 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange">
                Published
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                Draft
              </span>
            )}
            {event.amount_paise > 0 ? (
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                Paid · ₹{rupees}
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-[0.5px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Free
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-brand-dark-text mt-1 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {startLabel}
            </span>
            {event.location_text && <span>{event.location_text}</span>}
            <span>
              Registered: <strong>{capacityLabel}</strong>
            </span>
            <span>
              Attended: <strong>{event.stats.attended}</strong>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onEdit(event.id)}
            className="text-[12px] font-bold text-brand-dark-text hover:text-brand-orange px-2 py-1"
          >
            Edit
          </button>
          <Link
            href={`/admin/events/${event.id}/checkin`}
            className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-charcoal hover:text-brand-orange px-2 py-1"
          >
            <QrCode size={12} />
            Check-in
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-2 bg-brand-bg rounded-[8px] px-3 py-2 mt-3">
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
    </Card>
  );
}

function EventForm({
  mode,
  event,
  pipelines,
  stages,
  users,
  onDone,
}: {
  mode: "create" | "edit";
  event?: EventRow;
  pipelines: Pick<PipelineRow, "id" | "name">[];
  stages: Pick<LeadStageRow, "id" | "name" | "pipeline_id" | "color">[];
  users: Pick<UserRow, "id" | "name" | "email">[];
  onDone: () => void;
}) {
  const [pipelineId, setPipelineId] = useState<string>(event?.pipeline_id ?? "");
  const [extraFields, setExtraFields] = useState<EventExtraField[]>(
    event?.extra_fields ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filteredStages = pipelineId
    ? stages.filter((s) => s.pipeline_id === pipelineId)
    : stages;

  function addExtraField() {
    setExtraFields((prev) => [
      ...prev,
      { key: `field_${prev.length + 1}`, label: "", type: "text", required: false },
    ]);
  }

  function updateExtraField(idx: number, patch: Partial<EventExtraField>) {
    setExtraFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    );
  }

  function removeExtraField(idx: number) {
    setExtraFields((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(fd: FormData) {
    setError(null);
    fd.set("extra_fields_json", JSON.stringify(extraFields));
    startTransition(async () => {
      const res: EventActionResult =
        mode === "create"
          ? await createEventAction(undefined, fd)
          : await updateEventAction(event!.id, undefined, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-bold text-brand-charcoal">
          {mode === "create" ? "New event" : "Edit event"}
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
          <Field label="Internal label (admin-only)" name="internal_label" required defaultValue={event?.internal_label} placeholder="Founders Meetup — Oct 2026" />
          <Field label="URL slug" name="slug" defaultValue={event?.slug} placeholder="founders-meetup-oct-2026" hint={event ? "(changing this breaks any existing links)" : "(auto-filled from label)"} />
        </div>
        <Field label="Buyer-facing title" name="title" required defaultValue={event?.title} placeholder="Founders Meetup" />
        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea id="description" name="description" rows={4} defaultValue={event?.description ?? ""} placeholder="What happens at this event, who it's for…" />
        </div>
        <Field label="Hero image URL" name="image_url" type="url" defaultValue={event?.image_url} placeholder="https://…" />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="starts_at">Starts at</FieldLabel>
            <Input
              id="starts_at"
              name="starts_at"
              type="datetime-local"
              required
              defaultValue={isoToLocalInput(event?.starts_at)}
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="ends_at">Ends at (optional)</FieldLabel>
            <Input
              id="ends_at"
              name="ends_at"
              type="datetime-local"
              defaultValue={isoToLocalInput(event?.ends_at)}
            />
          </div>
          <Field label="Capacity (optional)" name="capacity" type="number" defaultValue={event?.capacity != null ? String(event.capacity) : ""} placeholder="Leave blank for unlimited" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Location text" name="location_text" defaultValue={event?.location_text} placeholder="18startup Space, Bengaluru" />
          <Field label="Location map URL" name="location_map_url" type="url" defaultValue={event?.location_map_url} placeholder="https://maps.google.com/…" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="terms_and_conditions">Terms &amp; conditions</FieldLabel>
            <Textarea id="terms_and_conditions" name="terms_and_conditions" rows={3} defaultValue={event?.terms_and_conditions ?? ""} />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="guidelines">Guidelines</FieldLabel>
            <Textarea id="guidelines" name="guidelines" rows={3} defaultValue={event?.guidelines ?? ""} />
          </div>
        </div>

        <div className="border-t border-brand-border pt-4">
          <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-orange mb-3">
            Payment
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Amount (₹) — leave 0 for free" name="amount_rupees" type="number" step="0.01" min="0" defaultValue={event ? (event.amount_paise / 100).toString() : "0"} placeholder="0" />
            {(mode === "create" || event?.mode) && (
              <div className="flex flex-col gap-[7px]">
                <FieldLabel htmlFor="mode">Razorpay mode</FieldLabel>
                <Select id="mode" name="mode" defaultValue={event?.mode ?? "test"}>
                  <option value="test">Test (safe to try)</option>
                  <option value="live">Live (real money)</option>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-brand-border pt-4">
          <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-orange mb-3">
            Where does the lead go?
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <FieldLabel htmlFor="registered_stage_id">Registered → stage</FieldLabel>
              <Select id="registered_stage_id" name="registered_stage_id" defaultValue={event?.registered_stage_id ?? ""}>
                <option value="">— First open stage —</option>
                {filteredStages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="attended_stage_id">Attended → stage</FieldLabel>
              <Select id="attended_stage_id" name="attended_stage_id" defaultValue={event?.attended_stage_id ?? ""}>
                <option value="">— No auto-move —</option>
                {filteredStages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="owner_id">Assign to</FieldLabel>
              <Select id="owner_id" name="owner_id" defaultValue={event?.owner_id ?? ""}>
                <option value="">— Unassigned —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
            <Field label="Tags (comma-separated)" name="tags" defaultValue={event?.tags?.join(", ")} placeholder="event, meetup" />
          </div>
        </div>

        <div className="border-t border-brand-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-orange">
              Extra questions on the registration form
            </div>
            <button
              type="button"
              onClick={addExtraField}
              className="text-[12px] font-bold text-brand-orange hover:text-brand-orange-dark inline-flex items-center gap-1"
            >
              <Plus size={12} /> Add question
            </button>
          </div>
          {extraFields.length === 0 && (
            <div className="text-[12px] text-brand-dark-text">
              No extra questions. Name / phone / email are collected automatically.
            </div>
          )}
          <div className="flex flex-col gap-2">
            {extraFields.map((f, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 md:grid-cols-[2fr_1.5fr_1fr_80px_36px] gap-2 items-center bg-brand-bg/60 rounded-[10px] p-2"
              >
                <Input
                  placeholder="Label (What company do you work for?)"
                  value={f.label}
                  onChange={(e) => updateExtraField(idx, { label: e.target.value })}
                />
                <Input
                  placeholder="Field key (company_name)"
                  value={f.key}
                  onChange={(e) => updateExtraField(idx, { key: e.target.value })}
                />
                <Select
                  value={f.type}
                  onChange={(e) => updateExtraField(idx, { type: e.target.value as EventExtraField["type"] })}
                >
                  <option value="text">Short text</option>
                  <option value="longtext">Long text</option>
                  <option value="dropdown">Dropdown</option>
                </Select>
                <label className="flex items-center gap-1.5 text-[12px]">
                  <input
                    type="checkbox"
                    checked={!!f.required}
                    onChange={(e) => updateExtraField(idx, { required: e.target.checked })}
                    className="h-4 w-4 accent-brand-orange"
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => removeExtraField(idx)}
                  className="p-2 rounded hover:bg-brand-bg text-brand-dark-text hover:text-red-500"
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-brand-border pt-4">
          <label className="flex items-center gap-2 text-[13.5px]">
            <input
              type="checkbox"
              name="is_published"
              value="true"
              defaultChecked={event?.is_published ?? false}
              className="h-4 w-4 accent-brand-orange"
            />
            <span className="font-bold">Publish (make the event URL live)</span>
          </label>
        </div>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex items-center justify-end gap-2 border-t border-brand-border pt-4">
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create event" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// Small reusable single-line field to keep the form body compact.
function Field({
  label,
  name,
  type = "text",
  defaultValue = "",
  placeholder,
  required,
  hint,
  step,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  step?: string;
  min?: string;
}) {
  return (
    <div className="flex flex-col gap-[7px]">
      <FieldLabel htmlFor={name}>
        {label}
        {hint && (
          <span className="text-brand-dark-text font-normal ml-1">{hint}</span>
        )}
      </FieldLabel>
      <Input
        id={name}
        name={name}
        type={type}
        step={step}
        min={min}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
      />
    </div>
  );
}
