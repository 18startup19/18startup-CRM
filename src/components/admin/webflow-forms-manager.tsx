"use client";

import { useState, useTransition } from "react";
import { ChevronRight, EyeOff, Loader2, RotateCcw } from "lucide-react";
import { Badge, Card, FieldError } from "@/components/ui/card";
import {
  upsertFieldMappingAction,
  deleteFieldMappingAction,
} from "@/app/actions/field-mapping";
import {
  hideAdminFormAction,
  restoreAdminFormAction,
} from "@/app/actions/hidden-forms";

export interface FormFieldRow {
  displayName: string;
  slug: string;
  type: string;
  current: string | null;
  mappingId: string | null;
}

export interface WebflowFormEntry {
  id: string;
  displayName: string;
  seen: boolean;
  fields: FormFieldRow[];
}

export interface CustomFieldOption {
  key: string;
  label: string;
}

interface Props {
  forms: WebflowFormEntry[];
  hiddenForms: WebflowFormEntry[];
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
  hiddenForms,
  customFields,
  apiError,
}: Props) {
  const [showHidden, setShowHidden] = useState(false);

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
        <div className="flex items-center gap-2">
          <Badge color={apiError ? "slate" : "green"}>
            {apiError ? "API not connected" : `${forms.length} visible`}
          </Badge>
          {hiddenForms.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className={`inline-flex items-center gap-1 text-[12px] font-bold rounded-[8px] px-3 py-1.5 border transition-colors ${
                showHidden
                  ? "bg-brand-orange text-white border-brand-orange"
                  : "bg-white text-brand-dark-text border-brand-border hover:border-brand-orange hover:text-brand-orange"
              }`}
            >
              <EyeOff size={12} />
              {showHidden ? "Hide" : "Show"} hidden ({hiddenForms.length})
            </button>
          )}
        </div>
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
          {hiddenForms.length > 0
            ? "All forms are currently hidden. Toggle “Show hidden” above to restore any."
            : "No forms found on your Webflow site."}
        </div>
      )}

      <div className="flex flex-col gap-3 mt-2">
        {forms.map((f) => (
          <FormRow
            key={f.id + f.displayName}
            form={f}
            customFields={customFields}
            hidden={false}
          />
        ))}
      </div>

      {showHidden && hiddenForms.length > 0 && (
        <div className="mt-6 border-t border-brand-border pt-4">
          <div className="flex items-center gap-2 mb-3">
            <EyeOff size={14} className="text-brand-dark-text" />
            <h3 className="text-[13px] font-bold text-brand-charcoal">
              Hidden forms ({hiddenForms.length})
            </h3>
            <span className="text-[11.5px] text-brand-dark-text">
              — still receive webhooks, just tucked away in the admin UI.
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {hiddenForms.map((f) => (
              <FormRow
                key={"hidden-" + f.id + f.displayName}
                form={f}
                customFields={customFields}
                hidden
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function FormRow({
  form,
  customFields,
  hidden,
}: {
  form: WebflowFormEntry;
  customFields: CustomFieldOption[];
  hidden: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggleHidden() {
    startTransition(async () => {
      if (hidden) {
        await restoreAdminFormAction("webflow", form.displayName);
      } else {
        await hideAdminFormAction("webflow", form.displayName);
      }
    });
  }

  return (
    <div
      className={`border rounded-[10px] overflow-hidden ${
        hidden ? "border-dashed border-brand-border bg-brand-bg/40" : "border-brand-border"
      }`}
    >
      <div className="w-full flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
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
          {form.seen && !hidden && (
            <Badge color="green">Received submissions</Badge>
          )}
          <span className="text-[11.5px] text-brand-dark-text whitespace-nowrap">
            {form.fields.length} field{form.fields.length === 1 ? "" : "s"}
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleHidden();
          }}
          disabled={isPending}
          className={`inline-flex items-center gap-1 text-[11.5px] font-bold rounded-[6px] px-2 py-1 border transition-colors ${
            hidden
              ? "border-brand-border text-brand-orange hover:bg-brand-orange/10"
              : "border-transparent text-brand-dark-text hover:bg-brand-bg hover:text-red-500"
          }`}
          title={hidden ? "Restore form to the visible list" : "Hide this form from the admin UI"}
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : hidden ? (
            <>
              <RotateCcw size={12} />
              Restore
            </>
          ) : (
            <>
              <EyeOff size={12} />
              Hide
            </>
          )}
        </button>
      </div>
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
          slug: {field.slug || "—"} · type: {field.type}
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
