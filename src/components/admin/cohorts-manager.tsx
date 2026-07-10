"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge, Card, FieldError, FieldLabel, Input } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  archiveCohortAction,
  restoreCohortAction,
  updateCohortOnboardingAction,
} from "@/app/actions/cohorts";
import { updateLmsSettingsAction } from "@/app/actions/lms-settings";
import type { CohortRow } from "@/lib/database.types";

interface CohortDecorated extends CohortRow {
  stats: { count: number; amount: number };
}

export interface TemplateOption {
  id: string;
  name: string;
}

interface Props {
  cohorts: CohortDecorated[];
  waTemplates: TemplateOption[];
  emailTemplates: TemplateOption[];
  settings: {
    whatsapp_template_id: string | null;
    email_template_id: string | null;
  };
}

export function CohortsManager({
  cohorts,
  waTemplates,
  emailTemplates,
  settings,
}: Props) {
  const active = cohorts.filter((c) => c.is_active);
  const archived = cohorts.filter((c) => !c.is_active);

  return (
    <div className="flex flex-col gap-6">
      <GlobalTemplatesCard
        waTemplates={waTemplates}
        emailTemplates={emailTemplates}
        settings={settings}
      />

      <h2 className="text-[15px] font-bold text-brand-charcoal">
        Active cohorts ({active.length})
      </h2>
      {active.length === 0 ? (
        <Card className="p-8 text-center text-brand-dark-text">
          No cohorts yet. New cohorts sync automatically from the LMS.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {active.map((c) => (
            <ActiveCohortCard key={c.id} cohort={c} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <>
          <h2 className="text-[15px] font-bold text-brand-charcoal mt-4">
            Archived cohorts ({archived.length})
          </h2>
          <Card className="p-0 overflow-hidden border-dashed">
            <ul>
              {archived.map((c) => (
                <li
                  key={c.id}
                  className="border-b border-brand-border last:border-none px-6 py-3 flex items-center gap-4"
                >
                  <span className="font-mono font-bold text-brand-dark-text">
                    Cohort {c.number}
                  </span>
                  {c.label && (
                    <span className="text-[12px] text-brand-dark-text flex-1 truncate">
                      {c.label}
                    </span>
                  )}
                  <form action={restoreCohortAction.bind(null, c.id)}>
                    <button
                      type="submit"
                      className="text-[13px] font-bold text-brand-orange hover:text-brand-orange-dark"
                    >
                      Restore
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function GlobalTemplatesCard({
  waTemplates,
  emailTemplates,
  settings,
}: {
  waTemplates: TemplateOption[];
  emailTemplates: TemplateOption[];
  settings: Props["settings"];
}) {
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [waId, setWaId] = useState(settings.whatsapp_template_id ?? "");
  const [emailId, setEmailId] = useState(settings.email_template_id ?? "");

  function save() {
    setSaveError(null);
    startTransition(async () => {
      const res = await updateLmsSettingsAction({
        whatsapp_template_id: waId || null,
        email_template_id: emailId || null,
      });
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    });
  }

  const dirty =
    (waId || null) !== (settings.whatsapp_template_id ?? null) ||
    (emailId || null) !== (settings.email_template_id ?? null);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-bold text-brand-charcoal">
            Onboarding templates
          </h2>
          <p className="text-[12.5px] text-brand-dark-text mt-1">
            Picked once here — the same WhatsApp + email template is sent when
            Sales clicks &ldquo;Onboard to LMS&rdquo; on any cohort&apos;s
            converted lead.
          </p>
        </div>
        {savedFlash && (
          <span className="text-[12px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            Saved
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="g-wa">WhatsApp template</FieldLabel>
          <TemplateSelect
            id="g-wa"
            value={waId}
            onChange={setWaId}
            options={waTemplates}
            placeholder="— none, skip WA on onboard —"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="g-email">Email template</FieldLabel>
          <TemplateSelect
            id="g-email"
            value={emailId}
            onChange={setEmailId}
            options={emailTemplates}
            placeholder="— none, skip email on onboard —"
          />
        </div>
      </div>
      {saveError && (
        <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3 mt-4">
          <FieldError>{saveError}</FieldError>
        </div>
      )}
      <div className="mt-4">
        <Button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
        >
          {isPending ? "Saving…" : dirty ? "Save templates" : "No changes"}
        </Button>
      </div>
    </Card>
  );
}

function ActiveCohortCard({ cohort }: { cohort: CohortDecorated }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lmsCohortId, setLmsCohortId] = useState(cohort.lms_cohort_id ?? "");

  function save() {
    setSaveError(null);
    startTransition(async () => {
      const res = await updateCohortOnboardingAction(cohort.id, {
        lms_cohort_id: lmsCohortId.trim() || null,
      });
      if (res.error) {
        setSaveError(res.error);
        return;
      }
      setEditing(false);
    });
  }

  if (editing) {
    return (
      <Card
        className="p-5"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <div className="font-mono text-[16px] font-black text-brand-charcoal mb-3">
          Cohort {cohort.number}
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
              LMS cohort_id
            </span>
            <Input
              value={lmsCohortId}
              onChange={(e) => setLmsCohortId(e.target.value)}
              placeholder="the LMS's cohort id"
            />
            <span className="text-[11.5px] text-brand-dark-text">
              Usually filled automatically by the LMS sync webhook — only edit if the mapping is missing.
            </span>
          </label>
          {saveError && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-3 py-2">
              <FieldError>{saveError}</FieldError>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Button type="button" onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setSaveError(null);
                setEditing(false);
              }}
              className="text-[12.5px] font-bold text-brand-dark-text hover:text-brand-charcoal"
            >
              Cancel
            </button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 hover:border-brand-orange transition-colors">
      <Link href={`/admin/cohorts/${cohort.id}`} className="block">
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[18px] font-black text-brand-charcoal">
            Cohort {cohort.number}
          </div>
          <Badge color="green">Active</Badge>
        </div>
        {cohort.label && (
          <div className="text-[12.5px] text-brand-dark-text mb-2">
            {cohort.label}
          </div>
        )}
      </Link>
      {!cohort.lms_cohort_id && (
        <div
          className="text-[11.5px] font-bold text-red-500 mb-2"
          title="Open Edit to backfill the LMS UUID."
        >
          LMS mapping missing — onboarding blocked
        </div>
      )}
      <div className="flex items-baseline gap-4 mt-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
            Leads
          </div>
          <div className="text-[18px] font-black text-brand-charcoal">
            {cohort.stats.count}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text">
            Amount
          </div>
          <div className="text-[18px] font-black text-brand-charcoal">
            ₹{cohort.stats.amount.toLocaleString("en-IN")}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          href={`/admin/cohorts/${cohort.id}`}
          className="text-[11.5px] font-bold text-brand-orange hover:text-brand-orange-dark"
        >
          View converted leads →
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] font-bold text-brand-dark-text hover:text-brand-charcoal"
          >
            Edit
          </button>
          <form action={archiveCohortAction.bind(null, cohort.id)}>
            <button
              type="submit"
              className="text-[11px] font-bold text-red-500 hover:text-red-600"
            >
              Archive
            </button>
          </form>
        </div>
      </div>
    </Card>
  );
}

function TemplateSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: TemplateOption[];
  placeholder: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[38px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal focus:outline-none focus:border-brand-orange"
    >
      <option value="">{placeholder}</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
