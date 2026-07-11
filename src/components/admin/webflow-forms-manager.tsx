"use client";

import { useState, useTransition } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { Badge, Card, FieldError } from "@/components/ui/card";
import {
  upsertFieldMappingAction,
  deleteFieldMappingAction,
} from "@/app/actions/field-mapping";

export interface FormFieldRow {
  displayName: string;
  slug: string;
  type: string;
  // Value from the current mapping (may be undefined → falls back to legacy
  // heuristic, or "" if the admin picked "unset" explicitly).
  current: string | null;
  // Existing DB row id, if any — needed to delete on "unset".
  mappingId: string | null;
}

export interface WebflowFormEntry {
  id: string;
  displayName: string;
  seen: boolean; // true if the CRM has already received a submission for this form
  fields: FormFieldRow[];
}

export interface CustomFieldOption {
  key: string;
  label: string;
}

interface Props {
  forms: WebflowFormEntry[];
  customFields: CustomFieldOption[];
  apiError: string | null;
}

const CORE_TARGETS: { value: string; label: string }[] = [
  { value: "name", label: "Lead name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "ignore", label: "Ignore this field" },
];

export function WebflowFormsManager({
  forms,
  customFields,
  apiError,
}: Props) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <h2 className="text-[15px] font-bold text-brand-charcoal">
            Webflow forms + field mapping
          </h2>
          <p className="text-[12.5px] text-brand-dark-text mt-1">
            Every form on your Webflow site (fetched via API). Click a form to
            map its fields to CRM lead fields (name / email / phone / custom).
            Mappings apply on the very next submission.
          </p>
        </div>
        <Badge color={apiError ? "slate" : "green"}>
          {apiError ? "API not connected" : `${forms.length} forms`}
        </Badge>
      </div>

      {apiError && (
        <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
          <FieldError>{apiError}</FieldError>
          <p className="text-[12px] text-brand-dark-text mt-1">
            Add <code className="font-mono">WEBFLOW_API_TOKEN</code> and{" "}
            <code className="font-mono">WEBFLOW_SITE_ID</code> to Vercel env
            vars to enable auto-discovery. Field mapping still works from
            observed submissions in the meantime.
          </p>
        </div>
      )}

      {forms.length === 0 && !apiError && (
        <div className="rounded-[10px] border border-brand-border p-6 text-center text-[13px] text-brand-dark-text">
          No forms found on your Webflow site.
        </div>
      )}

      <div className="flex flex-col gap-3 mt-2">
        {forms.map((f) => (
          <FormRow
            key={f.id + f.displayName}
            form={f}
            customFields={customFields}
          />
        ))}
      </div>
    </Card>
  );
}

function FormRow({
  form,
  customFields,
}: {
  form: WebflowFormEntry;
  customFields: CustomFieldOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-brand-border rounded-[10px] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-brand-bg"
      >
        <ChevronRight
          size={14}
          className={`text-brand-dark-text transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        <span className="font-mono text-[13.5px] font-bold text-brand-charcoal flex-1 truncate">
          {form.displayName}
        </span>
        {form.seen && (
          <Badge color="green">
            Received submissions
          </Badge>
        )}
        <span className="text-[11.5px] text-brand-dark-text">
          {form.fields.length} field{form.fields.length === 1 ? "" : "s"}
        </span>
      </button>
      {open && (
        <div className="border-t border-brand-border bg-brand-bg/40 px-4 py-3">
          {form.fields.length === 0 ? (
            <p className="text-[12.5px] text-brand-dark-text">
              No field schema yet — submit one test entry from this form to
              populate its fields.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {form.fields.map((field) => (
                <FieldMappingRow
                  key={form.displayName + field.displayName + field.slug}
                  formKey={form.displayName}
                  field={field}
                  customFields={customFields}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldMappingRow({
  formKey,
  field,
  customFields,
}: {
  formKey: string;
  field: FormFieldRow;
  customFields: CustomFieldOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(field.current ?? "");
  const [error, setError] = useState<string | null>(null);

  function save(next: string) {
    setError(null);
    setCurrent(next);
    startTransition(async () => {
      if (!next) {
        // Unset → delete the mapping row so we fall back to the heuristic
        // for this field.
        if (field.mappingId) {
          await deleteFieldMappingAction(field.mappingId);
        }
        return;
      }
      const res = await upsertFieldMappingAction(
        "webflow",
        formKey,
        field.displayName,
        next,
      );
      if (res.error) {
        setError(res.error);
        setCurrent(field.current ?? "");
      }
    });
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-brand-charcoal truncate">
          {field.displayName}
        </div>
        <div className="text-[11px] text-brand-dark-text font-mono">
          slug: {field.slug} · type: {field.type}
        </div>
      </div>
      <select
        value={current}
        onChange={(e) => save(e.target.value)}
        disabled={isPending}
        className="h-[32px] rounded-[8px] border border-brand-border bg-white px-2 text-[12.5px] text-brand-charcoal focus:outline-none focus:border-brand-orange min-w-[220px]"
      >
        <option value="">— fall back to heuristic —</option>
        <optgroup label="Core lead fields">
          {CORE_TARGETS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </optgroup>
        {customFields.length > 0 && (
          <optgroup label="Custom fields">
            {customFields.map((c) => (
              <option key={c.key} value={`custom.${c.key}`}>
                {c.label} ({c.key})
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {isPending && (
        <Loader2 size={12} className="animate-spin text-brand-dark-text" />
      )}
      {error && (
        <div className="w-full">
          <FieldError>{error}</FieldError>
        </div>
      )}
    </div>
  );
}
