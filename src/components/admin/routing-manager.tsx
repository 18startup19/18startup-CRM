"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Card, FieldError, FieldLabel, Input } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createRoutingRuleAction,
  deleteRoutingRuleAction,
  updateFallbackStageAction,
  updateRazorpayRequireRuleAction,
  updateRoutingRuleAction,
  type RoutingResult,
} from "@/app/actions/routing";
import type { LeadRoutingRuleRow } from "@/lib/database.types";

const initial: RoutingResult = {};

export interface StageOption {
  id: string;
  name: string;
  color: string;
  pipelineName: string;
}

export interface UnmatchedKey {
  source: "razorpay" | "webflow";
  match_value: string;
  count: number;
  // Pre-formatted on the server (en-IN, IST) so we don't hit a hydration
  // mismatch when the browser's locale/timezone disagrees.
  last_seen_label: string;
}

interface RuleRow extends LeadRoutingRuleRow {
  stage_name: string;
  stage_color: string;
  pipeline_name: string;
}

interface Props {
  rules: RuleRow[];
  stages: StageOption[];
  fallbackStageId: string | null;
  razorpayRequireRule: boolean;
  unmatched: UnmatchedKey[];
}

export function RoutingManager({
  rules,
  stages,
  fallbackStageId,
  razorpayRequireRule,
  unmatched,
}: Props) {
  const [prefill, setPrefill] = useState<{
    source: "razorpay" | "webflow";
    match_value: string;
  } | null>(null);

  const razorpayRules = rules.filter((r) => r.source === "razorpay");
  const webflowRules = rules.filter((r) => r.source === "webflow");

  return (
    <div className="flex flex-col gap-6">
      <FallbackCard stages={stages} fallbackStageId={fallbackStageId} />

      <RazorpayFiltersCard initialRequireRule={razorpayRequireRule} />

      {unmatched.length > 0 && (
        <UnmatchedCard
          unmatched={unmatched}
          onCreateRule={(u) =>
            setPrefill({ source: u.source, match_value: u.match_value })
          }
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="flex flex-col gap-6 order-2 md:order-1">
          <RulesSection
            title="Razorpay rules"
            emptyLabel="No Razorpay routing rules yet. Every captured payment goes to the fallback stage."
            rules={razorpayRules}
            stages={stages}
          />
          <div className="text-[12px] text-brand-dark-text bg-brand-bg/60 border border-brand-border rounded-[10px] px-4 py-3">
            Webflow routing lives under each form in the &ldquo;Webflow forms + field mapping&rdquo; card below — pick the stage right where you map the fields.
          </div>
        </div>
        <div className="order-1 md:order-2 md:sticky md:top-6">
          <AddRuleCard stages={stages} prefill={prefill} onDone={() => setPrefill(null)} />
        </div>
      </div>
    </div>
  );
}

function FallbackCard({
  stages,
  fallbackStageId,
}: {
  stages: StageOption[];
  fallbackStageId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(fallbackStageId ?? "");
  const [flash, setFlash] = useState<null | "saved" | "error">(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateFallbackStageAction(value || null);
      if (res.error) {
        setError(res.error);
        setFlash("error");
      } else {
        setFlash("saved");
        setTimeout(() => setFlash(null), 1500);
      }
    });
  }

  const dirty = (value || null) !== (fallbackStageId ?? null);

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-bold text-brand-charcoal">
            Fallback stage
          </h2>
          <p className="text-[12.5px] text-brand-dark-text mt-1">
            Where a Razorpay payment or Webflow submit lands when no rule
            matches. Leave blank to fall back to the leftmost open stage.
          </p>
        </div>
        {flash === "saved" && (
          <span className="text-[12px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            Saved
          </span>
        )}
      </div>
      <div className="mt-4 max-w-[420px]">
        <FieldLabel htmlFor="fallback">Stage</FieldLabel>
        <StageSelect
          id="fallback"
          value={value}
          onChange={setValue}
          stages={stages}
          placeholder="— leftmost open stage —"
        />
      </div>
      {error && (
        <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3 mt-4">
          <FieldError>{error}</FieldError>
        </div>
      )}
      <div className="mt-4">
        <Button type="button" onClick={save} disabled={isPending || !dirty}>
          {isPending ? "Saving…" : dirty ? "Save fallback" : "No changes"}
        </Button>
      </div>
    </Card>
  );
}

function RazorpayFiltersCard({
  initialRequireRule,
}: {
  initialRequireRule: boolean;
}) {
  const [checked, setChecked] = useState(initialRequireRule);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  function toggle(next: boolean) {
    setError(null);
    setChecked(next);
    startTransition(async () => {
      const res = await updateRazorpayRequireRuleAction(next);
      if (res.error) {
        setError(res.error);
        setChecked(!next);
        return;
      }
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    });
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-[15px] font-bold text-brand-charcoal">
            Razorpay filters
          </h2>
          <p className="text-[12.5px] text-brand-dark-text mt-1">
            Control which captured payments become CRM leads.
          </p>
        </div>
        {savedFlash && (
          <span className="text-[12px] font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            Saved
          </span>
        )}
      </div>
      <label className="mt-4 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          disabled={isPending}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-orange"
        />
        <span className="text-[13.5px] text-brand-charcoal">
          <span className="font-bold">
            Only accept payments matching a routing rule (allowlist mode).
          </span>
          <span className="block text-[12px] text-brand-dark-text mt-0.5">
            When ON: a payment whose description doesn&apos;t match any active
            Razorpay routing rule is silently ignored — no lead is created,
            Razorpay gets a 200 back so it won&apos;t retry. Use this to filter
            out test payments, refunds, and unrelated Razorpay flows.
          </span>
        </span>
      </label>
      {error && (
        <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3 mt-4">
          <FieldError>{error}</FieldError>
        </div>
      )}
    </Card>
  );
}

function UnmatchedCard({
  unmatched,
  onCreateRule,
}: {
  unmatched: UnmatchedKey[];
  onCreateRule: (u: UnmatchedKey) => void;
}) {
  return (
    <Card className="p-6 border-brand-orange/40 bg-brand-orange/5">
      <h2 className="text-[15px] font-bold text-brand-charcoal">
        Recently seen · no rule yet ({unmatched.length})
      </h2>
      <p className="text-[12.5px] text-brand-dark-text mt-1 mb-3">
        These form names / payment descriptions came in but had no matching
        rule, so they landed in the fallback stage. Click &ldquo;Add rule&rdquo;
        to route them somewhere specific.
      </p>
      <ul className="divide-y divide-brand-border">
        {unmatched.map((u) => (
          <li
            key={`${u.source}-${u.match_value}`}
            className="flex items-center justify-between gap-4 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Badge color={u.source === "razorpay" ? "orange" : "slate"}>
                  {u.source}
                </Badge>
                <span className="font-mono text-[13px] text-brand-charcoal truncate">
                  {u.match_value}
                </span>
              </div>
              <div className="text-[11.5px] text-brand-dark-text mt-1">
                {u.count} lead{u.count === 1 ? "" : "s"} · last{" "}
                {u.last_seen_label}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onCreateRule(u)}
              className="inline-flex items-center gap-1 text-[12px] font-bold text-brand-orange hover:text-brand-orange-dark shrink-0"
            >
              <Plus size={12} />
              Add rule
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RulesSection({
  title,
  emptyLabel,
  rules,
  stages,
}: {
  title: string;
  emptyLabel: string;
  rules: RuleRow[];
  stages: StageOption[];
}) {
  return (
    <div>
      <h2 className="text-[15px] font-bold text-brand-charcoal mb-3">
        {title} ({rules.length})
      </h2>
      {rules.length === 0 ? (
        <Card className="p-6 text-center text-brand-dark-text text-[13px]">
          {emptyLabel}
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul>
            {rules.map((r) => (
              <RuleRowItem key={r.id} rule={r} stages={stages} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RuleRowItem({ rule, stages }: { rule: RuleRow; stages: StageOption[] }) {
  const [isPending, startTransition] = useTransition();
  const [stageId, setStageId] = useState(rule.stage_id);

  function changeStage(next: string) {
    setStageId(next);
    startTransition(async () => {
      await updateRoutingRuleAction(rule.id, { stage_id: next });
    });
  }

  function toggleActive() {
    startTransition(async () => {
      await updateRoutingRuleAction(rule.id, { is_active: !rule.is_active });
    });
  }

  function del() {
    if (!confirm(`Delete routing rule for "${rule.match_value}"?`)) return;
    startTransition(async () => {
      await deleteRoutingRuleAction(rule.id);
    });
  }

  return (
    <li className="border-b border-brand-border last:border-none px-5 py-3 flex items-center gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] font-bold text-brand-charcoal truncate">
            {rule.match_value}
          </span>
          {!rule.is_active && <Badge color="slate">Paused</Badge>}
        </div>
        {rule.label && (
          <div className="text-[11.5px] text-brand-dark-text mt-0.5">
            {rule.label}
          </div>
        )}
      </div>
      <div className="min-w-[220px]">
        <StageSelect
          value={stageId}
          onChange={changeStage}
          stages={stages}
          placeholder="Pick a stage"
        />
      </div>
      <button
        type="button"
        onClick={toggleActive}
        disabled={isPending}
        className="text-[11.5px] font-bold text-brand-dark-text hover:text-brand-charcoal"
      >
        {rule.is_active ? "Pause" : "Resume"}
      </button>
      <button
        type="button"
        onClick={del}
        disabled={isPending}
        className="text-brand-dark-text hover:text-red-500"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function AddRuleCard({
  stages,
  prefill,
  onDone,
}: {
  stages: StageOption[];
  prefill: { source: "razorpay" | "webflow"; match_value: string } | null;
  onDone: () => void;
}) {
  const [state, formAction, isPending] = useActionState(
    createRoutingRuleAction,
    initial,
  );

  // Use `key` to force a form re-mount when prefill changes so defaultValue
  // takes effect and the successful last-submit state resets.
  const formKey = `${prefill?.source ?? ""}-${prefill?.match_value ?? ""}-${
    state.ok ? "ok" : ""
  }`;

  return (
    <Card className="p-6">
      <h2 className="text-[15px] font-bold text-brand-charcoal mb-4">
        Add a routing rule
      </h2>
      <form
        key={formKey}
        action={(fd) => {
          formAction(fd);
          onDone();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="r-source">Source</FieldLabel>
          <select
            id="r-source"
            name="source"
            defaultValue={prefill?.source ?? "razorpay"}
            required
            className="h-[38px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal focus:outline-none focus:border-brand-orange"
          >
            <option value="razorpay">Razorpay (match payment description)</option>
          </select>
          <p className="text-[11.5px] text-brand-dark-text">
            Webflow rules are managed per-form in the Webflow forms card below.
          </p>
        </div>
        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="r-match">Match value</FieldLabel>
          <Input
            id="r-match"
            name="match_value"
            required
            defaultValue={prefill?.match_value ?? ""}
            placeholder="Exact form name / payment description"
          />
          <p className="text-[11.5px] text-brand-dark-text">
            Must match exactly — copy from the &ldquo;Recently seen&rdquo; list above if unsure.
          </p>
        </div>
        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="r-stage">Target stage</FieldLabel>
          <select
            id="r-stage"
            name="stage_id"
            required
            className="h-[38px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal focus:outline-none focus:border-brand-orange"
          >
            <option value="">Pick a stage</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.pipelineName} · {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-[7px]">
          <FieldLabel htmlFor="r-label">Label (optional)</FieldLabel>
          <Input
            id="r-label"
            name="label"
            placeholder="Nickname for this rule"
          />
        </div>
        {state.error && (
          <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
            <FieldError>{state.error}</FieldError>
          </div>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Adding…" : "Add rule"}
        </Button>
      </form>
    </Card>
  );
}

function StageSelect({
  id,
  value,
  onChange,
  stages,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  stages: StageOption[];
  placeholder: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[38px] rounded-[10px] border border-brand-border bg-white px-3 text-[13.5px] text-brand-charcoal focus:outline-none focus:border-brand-orange w-full"
    >
      <option value="">{placeholder}</option>
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.pipelineName} · {s.name}
        </option>
      ))}
    </select>
  );
}
