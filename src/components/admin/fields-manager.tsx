"use client";

import { useActionState, useState } from "react";
import {
  Badge,
  Card,
  FieldError,
  FieldLabel,
  Input,
  Select,
  Textarea,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  archiveFieldAction,
  createFieldAction,
  updateFieldAction,
  type FieldResult,
} from "@/app/actions/custom-fields";
import type { CustomFieldRow, CustomFieldType } from "@/lib/database.types";

const initial: FieldResult = {};

const TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text (single line)" },
  { value: "longtext", label: "Long text (multi-line)" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox (yes/no)" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
];

export function FieldsManager({ fields }: { fields: CustomFieldRow[] }) {
  const [state, formAction, isPending] = useActionState(createFieldAction, initial);
  const [type, setType] = useState<CustomFieldType>("text");

  return (
    <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
      <Card className="p-6">
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-4">Add a field</h2>
        <form action={formAction} className="flex flex-col gap-4" key={state.ok ? "reset" : "form"}>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="f-label">Label</FieldLabel>
            <Input id="f-label" name="label" required />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="f-type">Type</FieldLabel>
            <Select
              id="f-type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          {type === "dropdown" && (
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="f-options">Options (one per line)</FieldLabel>
              <Textarea id="f-options" name="options" placeholder={"Hot\nWarm\nCold"} rows={4} />
            </div>
          )}
          <label className="flex items-center gap-2 text-[14px] text-brand-charcoal">
            <input type="checkbox" name="is_required" />
            Required on create
          </label>
          {state.error && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
              <FieldError>{state.error}</FieldError>
            </div>
          )}
          {state.ok && (
            <div className="bg-[#E7F8EE] border border-[#B7EBCB] rounded-[10px] px-4 py-3 text-[13px] font-semibold text-[#1a8f4c]">
              Field added.
            </div>
          )}
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Adding..." : "Add field"}
          </Button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-[14px]">
          <thead className="bg-brand-bg border-b border-brand-border text-left">
            <tr>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Label
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Key
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Type
              </th>
              <th className="px-6 py-3 text-[11px] font-bold uppercase tracking-[0.8px] text-brand-dark-text">
                Required
              </th>
              <th className="px-6 py-3 w-[80px]" />
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <FieldRow key={f.id} field={f} />
            ))}
            {fields.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-brand-dark-text">
                  No custom fields yet. Add fields on the left to start.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FieldRow({ field }: { field: CustomFieldRow }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <tr className="border-b border-brand-border last:border-none bg-brand-bg">
        <td colSpan={5} className="px-6 py-4">
          <form
            action={async (fd) => {
              await updateFieldAction(field.id, fd);
              setEditing(false);
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <Input
                name="label"
                defaultValue={field.label}
                required
                className="!py-2 flex-1 min-w-[200px]"
              />
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  name="is_required"
                  defaultChecked={field.is_required}
                />
                Required
              </label>
              <span className="text-[11px] text-brand-dark-text font-mono">key: {field.key}</span>
            </div>
            {field.type === "dropdown" && (
              <Textarea
                name="options"
                rows={3}
                defaultValue={field.options.join("\n")}
                placeholder="One option per line"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[13px] font-bold text-brand-dark-text hover:text-brand-charcoal"
              >
                Cancel
              </button>
              <Button type="submit" size="sm">
                Save
              </Button>
            </div>
          </form>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-brand-border last:border-none">
      <td className="px-6 py-4 font-semibold">{field.label}</td>
      <td className="px-6 py-4 text-brand-dark-text font-mono text-[12px]">{field.key}</td>
      <td className="px-6 py-4">
        <Badge color="slate">{field.type}</Badge>
      </td>
      <td className="px-6 py-4">{field.is_required ? "Yes" : "—"}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[13px] font-bold text-brand-orange hover:text-brand-orange-dark"
          >
            Edit
          </button>
          <form action={archiveFieldAction.bind(null, field.id)}>
            <button
              type="submit"
              className="text-[13px] font-bold text-red-500 hover:text-red-600"
            >
              Archive
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
