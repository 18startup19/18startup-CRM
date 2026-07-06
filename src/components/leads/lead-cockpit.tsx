"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
  Phone,
  Mail,
  MessageSquare,
  Save,
  Clock,
  ChevronDown,
  User,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Card, FieldLabel, Input, Select, Textarea } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatRelative } from "@/lib/utils";
import {
  assignLeadAction,
  createNoteAction,
  deleteLeadAction,
  logCallOutcomeAction,
  updateLeadAction,
} from "@/app/actions/leads";
import { callAction, sendEmailAction, sendWhatsAppAction } from "@/app/actions/comms";
import { CustomFieldInput } from "@/components/leads/lead-form";
import type {
  CommunicationRow,
  CustomFieldRow,
  EmailTemplateRow,
  LeadActivityRow,
  LeadNoteRow,
  LeadRow,
  LeadStageRow,
  UserRow,
  WhatsAppTemplateRow,
} from "@/lib/database.types";
import type { Session } from "@/lib/session-types";
import { hasPermission } from "@/lib/rbac";
import { useToast } from "@/components/ui/toast";
import { TagChipInput } from "@/components/ui/tag-chip-input";
import { ActiveCallCard } from "@/components/leads/active-call-card";

const OUTCOME_OPTIONS: {
  value: string;
  label: string;
  color: "green" | "amber" | "red" | "slate" | "orange";
}[] = [
  { value: "interested", label: "Interested", color: "green" },
  { value: "callback", label: "Callback scheduled", color: "orange" },
  { value: "not_interested", label: "Not interested", color: "slate" },
  { value: "wrong_number", label: "Wrong number", color: "red" },
  { value: "busy", label: "Busy", color: "amber" },
  { value: "no_answer", label: "No answer", color: "amber" },
  { value: "dnc", label: "Do not contact", color: "red" },
];

interface Props {
  session: Session;
  permissions: Record<string, boolean>;
  lead: LeadRow;
  stages: LeadStageRow[];
  fields: CustomFieldRow[];
  users: Pick<UserRow, "id" | "name" | "email">[];
  notes: LeadNoteRow[];
  activities: LeadActivityRow[];
  communications: CommunicationRow[];
  emailTemplates: EmailTemplateRow[];
  whatsappTemplates: WhatsAppTemplateRow[];
  tagSuggestions: string[];
}

type TabKey = "timeline" | "notes" | "history";

export function LeadCockpit({
  session,
  permissions,
  lead,
  stages,
  fields,
  users,
  notes,
  activities,
  communications,
  emailTemplates,
  whatsappTemplates,
  tagSuggestions,
}: Props) {
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<TabKey>("notes");
  const [viewingComm, setViewingComm] = useState<CommunicationRow | null>(null);
  const [activeCall, setActiveCall] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const stage = stages.find((s) => s.id === lead.stage_id);
  const owner = users.find((u) => u.id === lead.owner_id);
  const canCall = hasPermission(session, permissions, "comms:call");
  const canEmail = hasPermission(session, permissions, "comms:send_email");
  const canWA = hasPermission(session, permissions, "comms:send_whatsapp");
  const canAssign = hasPermission(session, permissions, "leads:assign");
  const canDelete = hasPermission(session, permissions, "leads:delete");

  const userNameById = new Map(users.map((u) => [u.id, u.name] as const));
  const stageNameById = new Map(stages.map((s) => [s.id, s.name] as const));

  return (
    <div className="min-h-full">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-brand-border">
        <div className="px-8 py-4 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Link
                href="/leads/kanban"
                className="text-[13px] font-bold text-brand-dark-text hover:text-brand-orange"
              >
                ← Kanban
              </Link>
              {lead.is_dnc && <Badge color="red">DNC</Badge>}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <h1 className="text-[22px] font-black text-brand-charcoal">{lead.name}</h1>
              {stage && (
                <span
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-[0.4px]"
                  style={{ background: `${stage.color}20`, color: stage.color }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: stage.color }}
                  />
                  {stage.name}
                </span>
              )}
              {lead.tags?.map((t) => (
                <Badge key={t} color="slate">
                  {t}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEmail && lead.email && !lead.is_dnc && (
              <ComposePopover
                label="Email"
                icon={<Mail size={16} className="inline mr-1.5 -mt-0.5" />}
                templates={emailTemplates.map((t) => ({ id: t.id, name: t.name }))}
                allowFreeText={false}
                onSubmit={async (fd) => {
                  await sendEmailAction(lead.id, fd);
                }}
              />
            )}
            {canWA && lead.phone && !lead.is_dnc && (
              <ComposePopover
                label="WhatsApp"
                icon={<MessageSquare size={16} className="inline mr-1.5 -mt-0.5" />}
                templates={whatsappTemplates.map((t) => ({ id: t.id, name: t.name }))}
                allowFreeText
                freeTextHint="Free-form text works within the 24h session window."
                onSubmit={async (fd) => {
                  await sendWhatsAppAction(lead.id, fd);
                }}
              />
            )}
            {canCall && lead.phone && !lead.is_dnc && (
              <form
                action={async (fd) => {
                  const res = await callAction(lead.id, fd);
                  if (res?.error) toast(res.error, "error");
                  else setActiveCall(true);
                }}
              >
                <input type="hidden" name="agent_phone" value="" />
                <Button size="lg" className="!px-6" type="submit">
                  <Phone size={18} className="inline mr-2 -mt-0.5" />
                  Call
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-6 p-8 items-start">
        {/* LEFT: single card with all tabs at the top */}
        <Card className="p-0 overflow-hidden">
          <div className="flex border-b border-brand-border overflow-x-auto">
            <TabButton active={tab === "timeline"} onClick={() => setTab("timeline")}>
              Communications
            </TabButton>
            <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>
              Notes ({notes.length})
            </TabButton>
            <TabButton active={tab === "history"} onClick={() => setTab("history")}>
              History
            </TabButton>
          </div>

          {tab === "timeline" && (
            <div className="p-6">
              <ul className="flex flex-col gap-3">
                {communications.map((c) => (
                  <CommsItem
                    key={c.id}
                    comm={c}
                    onOpen={() => setViewingComm(c)}
                  />
                ))}
                {communications.length === 0 && (
                  <li className="text-center text-brand-dark-text py-8 text-[13px]">
                    No calls, emails, or WhatsApp messages yet. Use the buttons above to send.
                  </li>
                )}
              </ul>
              {viewingComm && (
                <CommDetailModal
                  comm={viewingComm}
                  actorName={
                    viewingComm.actor_id
                      ? userNameById.get(viewingComm.actor_id) ?? null
                      : null
                  }
                  onClose={() => setViewingComm(null)}
                />
              )}
            </div>
          )}

          {tab === "notes" && (
            <div className="p-6 flex flex-col gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                    Log a call
                  </h3>
                  <span className="text-[11px] text-brand-dark-text">
                    Capture outcome after a call.
                  </span>
                </div>
                <form
                  action={async (fd) => {
                    await logCallOutcomeAction(lead.id, fd);
                  }}
                  className="flex flex-col gap-3"
                >
                  <div className="flex flex-col gap-[7px]">
                    <FieldLabel>Outcome</FieldLabel>
                    <div className="grid grid-cols-4 gap-2">
                      {OUTCOME_OPTIONS.map((o) => (
                        <label
                          key={o.value}
                          className="flex items-center gap-2 px-3 py-2 rounded-[10px] border border-brand-border bg-brand-bg cursor-pointer hover:border-brand-orange transition-colors has-[:checked]:border-brand-orange has-[:checked]:bg-[#FFF4EF]"
                        >
                          <input type="radio" name="outcome" value={o.value} required />
                          <span className="text-[12.5px] font-semibold text-brand-charcoal">
                            {o.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-[7px]">
                    <FieldLabel htmlFor="lc-callback">Callback at (optional)</FieldLabel>
                    <Input id="lc-callback" name="next_callback_at" type="datetime-local" />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit" size="sm">
                      <Save size={14} className="inline mr-1.5 -mt-0.5" /> Save outcome
                    </Button>
                  </div>
                </form>
              </div>

              <div className="border-t border-brand-border pt-5">
                <h3 className="text-[13px] font-bold uppercase tracking-[0.5px] text-brand-dark-text mb-3">
                  Add a note
                </h3>
                <form
                  action={async (fd) => {
                    await createNoteAction(lead.id, fd);
                  }}
                  className="flex flex-col gap-3"
                >
                  <Textarea name="body" placeholder="Type a note…" rows={3} required />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm">
                      Add note
                    </Button>
                  </div>
                </form>
              </div>

              <div className="border-t border-brand-border pt-5">
                <h3 className="text-[13px] font-bold uppercase tracking-[0.5px] text-brand-dark-text mb-3">
                  Notes ({notes.length})
                </h3>
                <ul className="flex flex-col gap-3">
                  {notes.map((n) => (
                    <li key={n.id} className="border-l-2 border-brand-orange pl-4 py-1">
                      <p className="text-[14px] text-brand-charcoal whitespace-pre-wrap">{n.body}</p>
                      <p className="text-[11px] text-brand-dark-text mt-1">
                        {formatDateTime(n.created_at)}
                      </p>
                    </li>
                  ))}
                  {notes.length === 0 && (
                    <li className="text-center text-brand-dark-text py-6 text-[13px]">
                      No notes yet.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div className="p-6">
              <ul className="flex flex-col gap-3">
                {activities.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 text-[13px]">
                    <span className="text-brand-orange mt-1">•</span>
                    <div className="flex-1 text-brand-charcoal">
                      {humanizeActivity(a, userNameById, stageNameById)}
                    </div>
                    <span className="text-brand-dark-text text-[12px] whitespace-nowrap">
                      {formatRelative(a.created_at)}
                    </span>
                  </li>
                ))}
                {activities.length === 0 && (
                  <li className="text-center text-brand-dark-text py-6 text-[13px]">
                    No history yet.
                  </li>
                )}
              </ul>
            </div>
          )}

        </Card>

        {/* RIGHT: owner on top, then details */}
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-dark-text mb-2">
              Owner
            </div>
            {canAssign ? (
              <form
                action={async (fd) => {
                  const ownerId = String(fd.get("owner_id") ?? "");
                  if (ownerId) start(() => assignLeadAction(lead.id, ownerId));
                }}
                className="flex gap-2"
              >
                <Select name="owner_id" defaultValue={lead.owner_id ?? ""}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                  Assign
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2 text-[14px] text-brand-charcoal">
                <User size={14} />
                {owner?.name ?? "—"}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <form
              action={async (fd) => {
                const res = await updateLeadAction(lead.id, fd);
                if (res && "ok" in res) toast("Changes saved.");
              }}
              onChange={(e) => {
                const form = e.currentTarget;
                if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
                autoSaveTimer.current = setTimeout(() => {
                  form.requestSubmit();
                }, 900);
              }}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[15px] font-bold text-brand-charcoal">Details</h2>
                <div className="flex items-center gap-2">
                  <AutoSaveIndicator />
                  <span className="text-[11px] text-brand-dark-text">
                    Created {formatRelative(lead.created_at)}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-[7px]">
                <FieldLabel htmlFor="d-name">Name</FieldLabel>
                <Input id="d-name" name="name" defaultValue={lead.name} required />
              </div>
              <div className="flex flex-col gap-[7px]">
                <FieldLabel htmlFor="d-tags">Tags</FieldLabel>
                <TagChipInput
                  id="d-tags"
                  name="tags"
                  placeholder="Type and press Enter"
                  defaultValue={lead.tags ?? []}
                  suggestions={tagSuggestions}
                />
              </div>
              <div className="flex flex-col gap-[7px]">
                <FieldLabel htmlFor="d-phone">Phone</FieldLabel>
                <Input id="d-phone" name="phone" type="tel" defaultValue={lead.phone ?? ""} />
              </div>
              <div className="flex flex-col gap-[7px]">
                <FieldLabel htmlFor="d-email">Email</FieldLabel>
                <Input id="d-email" name="email" type="email" defaultValue={lead.email ?? ""} />
              </div>
              <div className="flex flex-col gap-[7px]">
                <FieldLabel>Stage</FieldLabel>
                <StageDropdown
                  stages={stages}
                  value={lead.stage_id ?? ""}
                  name="stage_id"
                />
              </div>
              <div className="flex flex-col gap-[7px]">
                <FieldLabel htmlFor="d-cb">Next callback</FieldLabel>
                <Input
                  id="d-cb"
                  name="next_callback_at"
                  type="datetime-local"
                  defaultValue={
                    lead.next_callback_at
                      ? new Date(lead.next_callback_at).toISOString().slice(0, 16)
                      : ""
                  }
                />
              </div>

              {fields.length > 0 && (
                <div className="border-t border-brand-border pt-4 mt-2 grid grid-cols-1 gap-4">
                  {fields.map((f) => (
                    <CustomFieldInput
                      key={f.id}
                      field={f}
                      defaultValue={(lead.custom as Record<string, unknown>)?.[f.key]}
                    />
                  ))}
                </div>
              )}

              <Button type="submit" size="md" className="mt-2">
                Save
              </Button>
            </form>
          </Card>

          {canDelete && (
            <Card className="p-6 border-red-200">
              <form
                action={async () => {
                  await deleteLeadAction(lead.id);
                }}
              >
                <div className="text-[11px] font-bold uppercase tracking-[1px] text-red-600 mb-2">
                  Danger zone
                </div>
                <Button type="submit" variant="danger" size="sm" className="w-full">
                  <Trash2 size={14} className="inline mr-2 -mt-0.5" /> Delete lead
                </Button>
              </form>
            </Card>
          )}
        </div>
      </div>

      {activeCall && (
        <ActiveCallCard
          lead={{
            id: lead.id,
            name: lead.name,
            phone: lead.phone,
            email: lead.email,
          }}
          onClose={() => setActiveCall(false)}
        />
      )}
    </div>
  );
}

function StageDropdown({
  stages,
  value,
  name,
}: {
  stages: LeadStageRow[];
  value: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(value);
  const current = stages.find((s) => s.id === selected);
  return (
    <div className="relative">
      <input type="hidden" name={name} value={selected} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-[14px] py-[12px] rounded-[10px] border-[1.5px] border-brand-border bg-brand-bg text-brand-charcoal text-[14px] outline-none flex items-center justify-between hover:border-brand-orange transition-colors"
      >
        <span className="flex items-center gap-2">
          {current ? (
            <>
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: current.color }}
              />
              <span>{current.name}</span>
            </>
          ) : (
            <span className="text-brand-dark-text">—</span>
          )}
        </span>
        <ChevronDown size={14} className="text-brand-dark-text" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-full bg-white border border-brand-border rounded-[10px] shadow-lg py-1 max-h-64 overflow-y-auto">
          {stages.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setSelected(s.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13.5px] hover:bg-brand-bg text-left"
              style={{ color: s.color }}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: s.color }}
              />
              <span className="font-semibold">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function humanizeActivity(
  a: LeadActivityRow,
  userNameById: Map<string, string>,
  stageNameById: Map<string, string>,
): string {
  const actor = a.actor_id ? userNameById.get(a.actor_id) ?? "Someone" : "System";
  const p = a.payload ?? {};
  const stageName = (id: unknown) =>
    typeof id === "string" ? stageNameById.get(id) ?? "an unset stage" : "an unset stage";
  const userName = (id: unknown) =>
    typeof id === "string" ? userNameById.get(id) ?? "another user" : "no one";

  switch (a.kind) {
    case "created":
      return `${actor} created this lead${
        typeof p.source === "string" ? ` from ${p.source}` : ""
      }.`;
    case "stage_changed":
      return `${actor} moved the stage from ${stageName(p.from)} to ${stageName(p.to)}${
        p.bulk ? " (bulk)" : ""
      }.`;
    case "owner_changed":
    case "assigned":
      return `${actor} reassigned the lead to ${userName(p.to)}.`;
    case "imported":
      return `${actor} imported this lead from CSV.`;
    case "converted":
      return `${actor} converted this lead.`;
    case "updated": {
      const changes = (p.changes ?? {}) as Record<string, { from: unknown; to: unknown }>;
      const parts: string[] = [];
      for (const [key, change] of Object.entries(changes)) {
        if (key === "stage_id") {
          parts.push(`stage → ${stageName(change.to)}`);
        } else if (key === "tags") {
          const from = Array.isArray(change.from) ? change.from.join(", ") : "";
          const to = Array.isArray(change.to) ? change.to.join(", ") : "";
          parts.push(`tags "${from || "—"}" → "${to || "—"}"`);
        } else {
          parts.push(`${key} → ${formatValue(change.to)}`);
        }
      }
      if (!parts.length) return `${actor} edited this lead.`;
      return `${actor} updated ${parts.join(", ")}.`;
    }
    default:
      return `${actor} ${a.kind.replace(/_/g, " ")}.`;
  }
}

function formatValue(v: unknown): string {
  if (v == null || v === "") return "empty";
  if (typeof v === "string") return `"${v}"`;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function CommDetailModal({
  comm,
  actorName,
  onClose,
}: {
  comm: CommunicationRow;
  actorName: string | null;
  onClose: () => void;
}) {
  const channelLabel =
    comm.channel === "email" ? "Email" : comm.channel === "whatsapp" ? "WhatsApp" : "Call";
  const Icon =
    comm.channel === "email" ? Mail : comm.channel === "whatsapp" ? MessageSquare : Phone;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[14px] shadow-2xl max-w-[560px] w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-border">
          <div className="flex items-center gap-2">
            <Icon size={16} className="text-brand-charcoal" />
            <h3 className="text-[15px] font-bold text-brand-charcoal">
              {channelLabel} · {comm.direction}
            </h3>
            <Badge
              color={
                comm.status === "sent" ||
                comm.status === "delivered" ||
                comm.status === "answered"
                  ? "green"
                  : comm.status === "failed"
                    ? "red"
                    : "slate"
              }
            >
              {comm.status}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] text-brand-dark-text hover:bg-brand-bg"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          <DetailRow label="Sent at" value={formatDateTime(comm.created_at)} />
          {actorName && <DetailRow label="By" value={actorName} />}
          {comm.provider && <DetailRow label="Provider" value={comm.provider} />}
          {comm.provider_message_id && (
            <DetailRow label="Provider ID" value={comm.provider_message_id} />
          )}
          {comm.channel === "call" && (
            <>
              {comm.outcome && <DetailRow label="Outcome" value={comm.outcome} />}
              {comm.duration_seconds != null && (
                <DetailRow label="Duration" value={`${comm.duration_seconds}s`} />
              )}
              {comm.recording_url && (
                <DetailRow
                  label="Recording"
                  value={
                    <a
                      href={comm.recording_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-orange font-bold underline"
                    >
                      Open recording
                    </a>
                  }
                />
              )}
            </>
          )}
          {comm.subject && <DetailRow label="Subject" value={comm.subject} />}
          {comm.body && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text">
                {comm.channel === "email" ? "Body" : "Message"}
              </div>
              {comm.channel === "email" ? (
                <div
                  className="rounded-[10px] border border-brand-border p-4 text-[13.5px] bg-brand-bg overflow-auto max-h-[300px]"
                  dangerouslySetInnerHTML={{ __html: comm.body }}
                />
              ) : (
                <div className="rounded-[10px] border border-brand-border p-4 text-[13.5px] bg-brand-bg whitespace-pre-wrap">
                  {comm.body}
                </div>
              )}
            </div>
          )}
          {comm.error && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
              <span className="font-bold">Error:</span> {comm.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 text-[13px]">
      <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text w-24 shrink-0">
        {label}
      </span>
      <span className="text-brand-charcoal">{value}</span>
    </div>
  );
}

function AutoSaveIndicator() {
  // Renders "Saving…" while the parent form's server action is pending.
  // Rendered inside the Details form so useFormStatus() picks up the state.
  let pending = false;
  try {
    pending = useFormStatus().pending;
  } catch {
    /* not in a form */
  }
  if (!pending) return null;
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-orange animate-pulse">
      Saving…
    </span>
  );
}

function ComposePopover({
  label,
  icon,
  templates,
  allowFreeText,
  freeTextHint,
  onSubmit,
}: {
  label: string;
  icon: React.ReactNode;
  templates: { id: string; name: string }[];
  allowFreeText: boolean;
  freeTextHint?: string;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"template" | "text">(
    templates.length > 0 ? "template" : "text",
  );

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="md"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {label}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] z-30 bg-white border border-brand-border rounded-[12px] shadow-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold text-brand-charcoal">Send {label}</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-brand-dark-text hover:text-brand-charcoal"
            >
              <X size={14} />
            </button>
          </div>
          {allowFreeText && (
            <div className="flex gap-2 mb-3 text-[12px] font-bold uppercase tracking-[0.4px]">
              <button
                type="button"
                onClick={() => setMode("template")}
                className={
                  "px-2 py-1 rounded-[6px] " +
                  (mode === "template" ? "bg-brand-orange/10 text-brand-orange" : "text-brand-dark-text")
                }
              >
                Template
              </button>
              <button
                type="button"
                onClick={() => setMode("text")}
                className={
                  "px-2 py-1 rounded-[6px] " +
                  (mode === "text" ? "bg-brand-orange/10 text-brand-orange" : "text-brand-dark-text")
                }
              >
                Free text
              </button>
            </div>
          )}
          <form
            action={async (fd) => {
              start(async () => {
                await onSubmit(fd);
                setOpen(false);
              });
            }}
            className="flex flex-col gap-3"
          >
            {mode === "template" ? (
              <Select name="template_id" defaultValue="" required>
                <option value="">Pick a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            ) : (
              <>
                <Textarea name="text" rows={4} required placeholder="Type your message…" />
                {freeTextHint && (
                  <p className="text-[11px] text-brand-dark-text">{freeTextHint}</p>
                )}
              </>
            )}
            {templates.length === 0 && mode === "template" && (
              <p className="text-[12px] text-brand-dark-text">
                No templates yet. Add one from Admin → {label === "Email" ? "Templates" : "WhatsApp templates"}.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending || (mode === "template" && templates.length === 0)}
              >
                {pending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-6 py-3 text-[13px] font-bold border-b-2 transition-colors whitespace-nowrap " +
        (active
          ? "border-brand-orange text-brand-orange"
          : "border-transparent text-brand-dark-text hover:text-brand-charcoal")
      }
    >
      {children}
    </button>
  );
}

function CommsItem({ comm, onOpen }: { comm: CommunicationRow; onOpen: () => void }) {
  const icon =
    comm.channel === "email" ? (
      <Mail size={14} />
    ) : comm.channel === "whatsapp" ? (
      <MessageSquare size={14} />
    ) : (
      <Phone size={14} />
    );
  return (
    <li
      onClick={onOpen}
      className="flex items-start gap-3 border border-brand-border rounded-[10px] p-3 cursor-pointer hover:border-brand-orange transition-colors"
    >
      <span className="mt-1 text-brand-dark-text">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-bold text-brand-charcoal uppercase tracking-[0.5px]">
            {comm.channel} · {comm.direction}
          </span>
          <Badge
            color={
              comm.status === "sent" || comm.status === "delivered" || comm.status === "answered"
                ? "green"
                : comm.status === "failed"
                  ? "red"
                  : "slate"
            }
          >
            {comm.status}
          </Badge>
          {comm.outcome && <Badge color="orange">{comm.outcome}</Badge>}
        </div>
        {comm.subject && (
          <div className="text-[13px] font-semibold mt-1 text-brand-charcoal">{comm.subject}</div>
        )}
        {comm.body && (
          <p className="text-[13px] text-brand-dark-text mt-1 whitespace-pre-wrap line-clamp-3">
            {comm.body}
          </p>
        )}
        {comm.duration_seconds != null && (
          <div className="text-[11px] text-brand-dark-text mt-1">
            <Clock size={10} className="inline mr-1" /> {comm.duration_seconds}s
            {comm.recording_url && (
              <a
                href={comm.recording_url}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-brand-orange font-bold"
              >
                recording
              </a>
            )}
          </div>
        )}
      </div>
      <span className="text-[11px] text-brand-dark-text whitespace-nowrap">
        {formatRelative(comm.created_at)}
      </span>
    </li>
  );
}
