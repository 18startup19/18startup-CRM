"use client";

import { useActionState, useState } from "react";
import { Badge, Card, FieldError, FieldLabel, Input, Select } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createWorkflowAction,
  deleteWorkflowAction,
  toggleWorkflowAction,
  type WorkflowResult,
} from "@/app/actions/workflows";
import type {
  CustomFieldRow,
  EmailTemplateRow,
  LeadStageRow,
  UserRow,
  WhatsAppTemplateRow,
  WorkflowRuleRow,
} from "@/lib/database.types";

const initial: WorkflowResult = {};

const TRIGGERS = [
  { value: "lead_created", label: "When a new lead is created" },
  { value: "stage_changed", label: "When the lead's stage changes" },
];

const ACTIONS = [
  { value: "send_email", label: "Send an email" },
  { value: "send_whatsapp", label: "Send a WhatsApp template" },
  { value: "assign_owner", label: "Assign to a team member" },
  { value: "set_stage", label: "Move to a stage" },
  { value: "update_field", label: "Update a field" },
];

const BUILTIN_UPDATABLE_FIELDS = [
  { key: "phone", label: "Phone", type: "text" as const },
  { key: "email", label: "Email", type: "text" as const },
  { key: "source", label: "Source", type: "text" as const },
  { key: "next_callback_at", label: "Next callback", type: "datetime-local" as const },
  { key: "is_dnc", label: "Do-not-contact", type: "checkbox" as const },
];

export function WorkflowsManager({
  workflows,
  stages,
  users,
  emailTemplates,
  whatsappTemplates,
  customFields,
}: {
  workflows: WorkflowRuleRow[];
  stages: LeadStageRow[];
  users: UserRow[];
  emailTemplates: EmailTemplateRow[];
  whatsappTemplates: WhatsAppTemplateRow[];
  customFields: CustomFieldRow[];
}) {
  const [state, formAction, isPending] = useActionState(createWorkflowAction, initial);
  const [actionKind, setActionKind] = useState("send_email");
  const [updateFieldKey, setUpdateFieldKey] = useState<string>(BUILTIN_UPDATABLE_FIELDS[0].key);

  const allUpdatableFields = [
    ...BUILTIN_UPDATABLE_FIELDS,
    ...customFields.map((f) => ({
      key: `custom.${f.key}`,
      label: f.label,
      type:
        f.type === "number"
          ? "number"
          : f.type === "date"
            ? "date"
            : f.type === "checkbox"
              ? "checkbox"
              : ("text" as const),
    })),
  ];
  const currentField = allUpdatableFields.find((f) => f.key === updateFieldKey);

  return (
    <div className="grid grid-cols-[440px_1fr] gap-6 items-start">
      <Card className="p-6">
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-4">Add a workflow</h2>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="w-name">Name</FieldLabel>
            <Input id="w-name" name="name" required placeholder="e.g. Welcome email for new leads" />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="w-trigger">Trigger</FieldLabel>
            <Select id="w-trigger" name="trigger_kind" defaultValue="lead_created">
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="w-cond">Only if lead is in stage (optional)</FieldLabel>
            <Select id="w-cond" name="stage_condition" defaultValue="">
              <option value="">Any stage</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="border-t border-brand-border pt-3">
            <FieldLabel>Action</FieldLabel>
            <Select
              name="action_kind"
              value={actionKind}
              onChange={(e) => setActionKind(e.target.value)}
              className="mt-1"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>

            {actionKind === "send_email" && (
              <div className="flex flex-col gap-[7px] mt-3">
                <FieldLabel htmlFor="w-email-tpl">Email template</FieldLabel>
                <Select id="w-email-tpl" name="action_template_id" defaultValue="">
                  <option value="">—</option>
                  {emailTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {actionKind === "send_whatsapp" && (
              <div className="flex flex-col gap-[7px] mt-3">
                <FieldLabel htmlFor="w-wa-tpl">WhatsApp template</FieldLabel>
                <Select id="w-wa-tpl" name="action_template_id" defaultValue="">
                  <option value="">—</option>
                  {whatsappTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {actionKind === "assign_owner" && (
              <div className="flex flex-col gap-[7px] mt-3">
                <FieldLabel htmlFor="w-owner">Assign to</FieldLabel>
                <Select id="w-owner" name="action_owner_id" defaultValue="">
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {actionKind === "set_stage" && (
              <div className="flex flex-col gap-[7px] mt-3">
                <FieldLabel htmlFor="w-stage">Move to stage</FieldLabel>
                <Select id="w-stage" name="action_stage_id" defaultValue="">
                  <option value="">—</option>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {actionKind === "update_field" && (
              <div className="flex flex-col gap-3 mt-3">
                <div className="flex flex-col gap-[7px]">
                  <FieldLabel htmlFor="w-field">Field</FieldLabel>
                  <Select
                    id="w-field"
                    name="action_field"
                    value={updateFieldKey}
                    onChange={(e) => setUpdateFieldKey(e.target.value)}
                  >
                    {allUpdatableFields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-[7px]">
                  <FieldLabel htmlFor="w-value">New value</FieldLabel>
                  {currentField?.type === "checkbox" ? (
                    <Select id="w-value" name="action_value" defaultValue="true">
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </Select>
                  ) : (
                    <Input
                      id="w-value"
                      name="action_value"
                      type={currentField?.type ?? "text"}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {state.error && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
              <FieldError>{state.error}</FieldError>
            </div>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Add workflow"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        {workflows.map((w) => (
          <Card key={w.id} className="p-5 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-brand-charcoal">{w.name}</span>
                {w.is_active ? (
                  <Badge color="green">Active</Badge>
                ) : (
                  <Badge color="slate">Paused</Badge>
                )}
              </div>
              <div className="text-[12px] text-brand-dark-text">
                Trigger: <span className="font-mono">{w.trigger_kind}</span> · Actions:{" "}
                <span className="font-mono">
                  {(w.actions ?? []).map((a) => a.kind).join(", ") || "—"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <form action={toggleWorkflowAction.bind(null, w.id, w.is_active)}>
                <Button type="submit" variant="outline" size="sm">
                  {w.is_active ? "Pause" : "Enable"}
                </Button>
              </form>
              <form action={deleteWorkflowAction.bind(null, w.id)}>
                <button
                  type="submit"
                  className="text-[12px] font-bold text-red-500 hover:text-red-600 px-2"
                >
                  Delete
                </button>
              </form>
            </div>
          </Card>
        ))}
        {workflows.length === 0 && (
          <Card className="p-8 text-center text-brand-dark-text">No workflows yet.</Card>
        )}
      </div>
    </div>
  );
}
