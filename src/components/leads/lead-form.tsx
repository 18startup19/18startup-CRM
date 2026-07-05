"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, FieldError, FieldLabel, Input, Select, Textarea } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createLeadAction, type LeadResult } from "@/app/actions/leads";
import type { CustomFieldRow, LeadStageRow, UserRow } from "@/lib/database.types";
import { TagChipInput } from "@/components/ui/tag-chip-input";

const initial: LeadResult = {};

export function LeadForm({
  stages,
  fields,
  users,
  currentUserId,
  tagSuggestions = [],
}: {
  stages: LeadStageRow[];
  fields: CustomFieldRow[];
  users: Pick<UserRow, "id" | "name" | "email">[];
  currentUserId: string;
  tagSuggestions?: string[];
}) {
  const [state, formAction, isPending] = useActionState(createLeadAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.leadId) router.push(`/leads/${state.leadId}`);
  }, [state, router]);

  return (
    <Card className="p-8">
      <form action={formAction} className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-[7px] col-span-2">
            <FieldLabel htmlFor="name">Name *</FieldLabel>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-[7px] col-span-2">
            <FieldLabel htmlFor="tags">Tags</FieldLabel>
            <TagChipInput
              id="tags"
              name="tags"
              placeholder="Type and press Enter"
              suggestions={tagSuggestions}
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="phone">Phone</FieldLabel>
            <Input id="phone" name="phone" type="tel" />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" name="email" type="email" />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="stage_id">Stage</FieldLabel>
            <Select id="stage_id" name="stage_id" defaultValue={stages[0]?.id ?? ""}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="owner_id">Owner</FieldLabel>
            <Select id="owner_id" name="owner_id" defaultValue={currentUserId}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="source">Source</FieldLabel>
            <Select id="source" name="source" defaultValue="manual">
              <option value="manual">Manual</option>
              <option value="csv">CSV import</option>
              <option value="web_form">Web form</option>
              <option value="fb_ads">Facebook Ads</option>
              <option value="indiamart">IndiaMART</option>
              <option value="missed_call">Missed call</option>
              <option value="api">API</option>
            </Select>
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="next_callback_at">Next callback</FieldLabel>
            <Input id="next_callback_at" name="next_callback_at" type="datetime-local" />
          </div>
        </div>

        {fields.length > 0 && (
          <div className="border-t border-brand-border pt-5 mt-2">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[1px] text-brand-orange">
              Custom fields
            </div>
            <div className="grid grid-cols-2 gap-4">
              {fields.map((f) => (
                <CustomFieldInput key={f.id} field={f} />
              ))}
            </div>
          </div>
        )}

        {state.error && (
          <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
            <FieldError>{state.error}</FieldError>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button type="submit" size="md" disabled={isPending}>
            {isPending ? "Saving..." : "Create lead"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function CustomFieldInput({
  field,
  defaultValue,
}: {
  field: CustomFieldRow;
  defaultValue?: unknown;
}) {
  const dv = defaultValue == null ? "" : String(defaultValue);
  const name = `cf_${field.key}`;
  return (
    <div className={`flex flex-col gap-[7px] ${field.type === "longtext" ? "col-span-2" : ""}`}>
      <FieldLabel htmlFor={name}>
        {field.label}
        {field.is_required ? " *" : ""}
      </FieldLabel>
      {field.type === "longtext" ? (
        <Textarea id={name} name={name} defaultValue={dv} rows={3} />
      ) : field.type === "dropdown" ? (
        <Select id={name} name={name} defaultValue={dv}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : field.type === "checkbox" ? (
        <label className="flex items-center gap-2 text-[14px] text-brand-charcoal py-3">
          <input
            id={name}
            name={name}
            type="checkbox"
            defaultChecked={defaultValue === true || defaultValue === "true"}
          />
          Yes
        </label>
      ) : (
        <Input
          id={name}
          name={name}
          type={
            field.type === "number"
              ? "number"
              : field.type === "date"
                ? "date"
                : field.type === "email"
                  ? "email"
                  : field.type === "phone"
                    ? "tel"
                    : "text"
          }
          defaultValue={dv}
        />
      )}
    </div>
  );
}
