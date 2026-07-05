"use client";

import { useActionState } from "react";
import { Card, FieldError, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { importCsvAction, type ImportResult } from "@/app/actions/import";
import type { CustomFieldRow } from "@/lib/database.types";

const initial: ImportResult = {};

const BUILTIN_COLS = [
  "name",
  "phone",
  "email",
  "pipeline",
  "stage",
  "owner_email",
  "tags",
];

export function ImportForm({ fields }: { fields: CustomFieldRow[] }) {
  const [state, formAction, isPending] = useActionState(importCsvAction, initial);

  const sampleCols = [...BUILTIN_COLS, ...fields.map((f) => f.key)];
  const templateHref = buildTemplateHref(sampleCols);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[1px] text-brand-orange mb-1">
              CSV columns
            </div>
            <p className="text-[13px] text-brand-dark-text">
              Only <code className="font-mono">name</code> is required. Everything else is optional.
            </p>
          </div>
          <a href={templateHref} download="leads-template.csv">
            <Button variant="outline" size="sm" type="button">
              Download template
            </Button>
          </a>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {sampleCols.map((c) => (
            <code
              key={c}
              className="text-[12px] bg-brand-bg border border-brand-border rounded px-2 py-1 font-mono"
            >
              {c}
            </code>
          ))}
        </div>
        <ul className="text-[12px] text-brand-dark-text mt-4 space-y-1 list-disc pl-5">
          <li>
            <code>pipeline</code> and <code>stage</code> are looked up by name. Missing ones are
            created automatically.
          </li>
          <li>
            <code>owner_email</code> must match an existing user; unknown emails fall back to the
            importer.
          </li>
          <li>
            <code>tags</code> can be separated by <code>,</code>, <code>;</code>, or <code>|</code>.
          </li>
        </ul>
      </Card>

      <Card className="p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="file">CSV file</FieldLabel>
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,text/csv"
              required
              className="block w-full text-[14px] text-brand-dark-text file:mr-4 file:py-3 file:px-4 file:rounded-[10px] file:border-0 file:font-bold file:text-white file:bg-brand-orange file:cursor-pointer hover:file:bg-brand-orange-dark"
            />
          </div>

          {state.error && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
              <FieldError>{state.error}</FieldError>
            </div>
          )}
          {state.ok && (
            <div className="bg-[#E7F8EE] border border-[#B7EBCB] rounded-[10px] px-4 py-3 text-[13px] font-semibold text-[#1a8f4c]">
              Imported {state.inserted}
              {state.skipped ? ` (${state.skipped} rows skipped)` : ""}.
              {state.created?.pipelines?.length ? (
                <div className="mt-1 font-normal text-[12px] text-[#1a8f4c]/80">
                  Auto-created pipelines: {state.created.pipelines.join(", ")}
                </div>
              ) : null}
              {state.created?.stages?.length ? (
                <div className="mt-1 font-normal text-[12px] text-[#1a8f4c]/80">
                  Auto-created stages: {state.created.stages.join(", ")}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="md" disabled={isPending}>
              {isPending ? "Importing..." : "Import CSV"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function buildTemplateHref(cols: string[]): string {
  const header = cols.join(",");
  const sample = cols
    .map((c) => {
      switch (c) {
        case "name":
          return "Priya Sharma";
        case "phone":
          return "+919000000001";
        case "email":
          return "priya@example.com";
        case "pipeline":
          return "Default";
        case "stage":
          return "New";
        case "owner_email":
          return "";
        case "tags":
          return "hot|referral";
        default:
          return "";
      }
    })
    .join(",");
  const csv = `${header}\n${sample}\n`;
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}
