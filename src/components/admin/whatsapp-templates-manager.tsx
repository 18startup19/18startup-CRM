"use client";

import { useActionState, useTransition } from "react";
import { Badge, Card, FieldError, FieldLabel, Input, Select, Textarea } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createWhatsAppTemplateAction,
  disableWhatsAppTemplateAction,
  refreshTemplateStatusAction,
  restoreWhatsAppTemplateAction,
  submitTemplateToMetaAction,
  syncTemplatesFromTwilioAction,
  toggleWhatsAppTemplateVisibilityAction,
  type TemplateResult,
} from "@/app/actions/templates";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import type { WhatsAppTemplateRow } from "@/lib/database.types";

const initial: TemplateResult = {};

export function WhatsAppTemplatesManager({ templates }: { templates: WhatsAppTemplateRow[] }) {
  const [state, formAction, isPending] = useActionState(createWhatsAppTemplateAction, initial);
  const { toast } = useToast();
  const router = useRouter();
  const [syncPending, startSync] = useTransition();
  const active = templates.filter((t) => t.is_active);
  const archived = templates.filter((t) => !t.is_active);

  function handleSync() {
    startSync(async () => {
      const res = await syncTemplatesFromTwilioAction();
      if (res.error) toast(`Sync failed: ${res.error}`, "error");
      else {
        const bits: string[] = [];
        if (res.imported) bits.push(`${res.imported} imported`);
        if (res.updated) bits.push(`${res.updated} refreshed`);
        toast(
          bits.length ? `Sync complete — ${bits.join(", ")}.` : "Sync complete.",
        );
        router.refresh();
      }
    });
  }

  return (
    <div className="grid grid-cols-[420px_1fr] gap-6 items-start">
      <Card className="p-6">
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-4">New template</h2>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="wa-type">Template type</FieldLabel>
            <Select id="wa-type" name="template_type" defaultValue="approved">
              <option value="approved">
                Approved (Meta-approved — usable for first outreach)
              </option>
              <option value="faq">
                FAQ (24h-window replies only, no Meta approval needed)
              </option>
            </Select>
            <p className="text-[11.5px] text-brand-dark-text">
              Approved templates go through Meta and can start conversations. FAQ
              templates are quick replies you send after the customer has
              messaged you in the last 24 hours.
            </p>
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="wa-name">Template name</FieldLabel>
            <Input id="wa-name" name="name" required placeholder="e.g. lead_welcome_v1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="wa-lang">Language</FieldLabel>
              <Input id="wa-lang" name="language" defaultValue="en" />
            </div>
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="wa-cat">Category</FieldLabel>
              <Select id="wa-cat" name="category" defaultValue="UTILITY">
                <option value="UTILITY">Utility</option>
                <option value="MARKETING">Marketing</option>
                <option value="AUTHENTICATION">Authentication</option>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="wa-body">Body</FieldLabel>
            <Textarea
              id="wa-body"
              name="body"
              rows={5}
              required
              placeholder={"Hi {{1}}, thanks for your interest in {{2}}."}
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="wa-vars">Variables (one per line, in order)</FieldLabel>
            <Textarea id="wa-vars" name="variables" rows={3} placeholder={"name\ncustom.product"} />
          </div>
          {state.error && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
              <FieldError>{state.error}</FieldError>
            </div>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save template"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between bg-brand-bg border border-brand-border rounded-[10px] px-4 py-3">
          <div>
            <div className="text-[13px] font-bold text-brand-charcoal">
              Twilio Content Templates
            </div>
            <div className="text-[11.5px] text-brand-dark-text">
              Pull templates already approved on this Twilio account into the CRM.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleSync}
            loading={syncPending}
          >
            Sync from Twilio
          </Button>
        </div>

        {active.map((t) => (
          <Card key={t.id} className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-brand-charcoal">{t.name}</span>
                <Badge color={t.template_type === "approved" ? "green" : "blue"}>
                  {t.template_type === "approved" ? "Meta approved" : "FAQ"}
                </Badge>
                {t.approval_status && t.approval_status !== "approved" && (
                  <Badge
                    color={
                      t.approval_status === "pending"
                        ? "amber"
                        : t.approval_status === "rejected"
                          ? "red"
                          : "slate"
                    }
                  >
                    {t.approval_status}
                  </Badge>
                )}
                <Badge color="slate">{t.language}</Badge>
                {t.category && <Badge color="orange">{t.category}</Badge>}
                {!t.is_active && <Badge color="red">Disabled</Badge>}
              </div>
              <div className="flex items-center gap-3">
                <label
                  className="flex items-center gap-1.5 text-[12px] font-bold text-brand-dark-text cursor-pointer select-none"
                  title="Uncheck to hide this template from team members"
                >
                  <input
                    type="checkbox"
                    defaultChecked={t.visible_to_members}
                    onChange={(e) =>
                      toggleWhatsAppTemplateVisibilityAction(t.id, e.target.checked)
                    }
                  />
                  Visible to team
                </label>
              {t.template_type === "approved" && (
                <TemplateStatusButtons template={t} />
              )}
              {t.is_active && (
                <form action={disableWhatsAppTemplateAction.bind(null, t.id)}>
                  <button
                    type="submit"
                    className="text-[12px] font-bold text-red-500 hover:text-red-600"
                  >
                    Disable
                  </button>
                </form>
              )}
              </div>
            </div>
            {t.provider_content_sid && (
              <div className="text-[11px] text-brand-dark-text font-mono mt-1">
                Twilio ContentSid: {t.provider_content_sid}
              </div>
            )}
            {t.submission_error && (
              <div className="mt-2 rounded-[8px] bg-[#FEECEC] border border-red-200 px-3 py-2 text-[12px] text-red-700">
                <span className="font-bold">Meta submission error:</span>{" "}
                {t.submission_error}
              </div>
            )}
            <pre className="text-[13px] text-brand-charcoal bg-brand-bg border border-brand-border rounded-[8px] p-3 whitespace-pre-wrap font-sans">
              {t.body}
            </pre>
            {t.variables.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {t.variables.map((v, i) => (
                  <code key={i} className="text-[11px] bg-white border border-brand-border rounded px-1.5 py-0.5 font-mono">
                    {`{{${i + 1}}}`} → {v}
                  </code>
                ))}
              </div>
            )}
          </Card>
        ))}
        {active.length === 0 && (
          <Card className="p-8 text-center text-brand-dark-text">
            No WhatsApp templates yet.
          </Card>
        )}

        {archived.length > 0 && (
          <Card className="p-5 border-dashed">
            <div className="mb-3">
              <h3 className="text-[14px] font-bold text-brand-charcoal">
                Disabled templates ({archived.length})
              </h3>
              <p className="text-[12px] text-brand-dark-text mt-1">
                Restore a template to make it available for sends again.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {archived.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-3 border border-brand-border rounded-[8px] px-3 py-2"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-brand-dark-text">{t.name}</div>
                    <div className="text-[12px] text-brand-dark-text">
                      {t.language}
                      {t.category ? ` • ${t.category}` : ""}
                    </div>
                  </div>
                  <form action={restoreWhatsAppTemplateAction.bind(null, t.id)}>
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
        )}
      </div>
    </div>
  );
}

function TemplateStatusButtons({ template }: { template: WhatsAppTemplateRow }) {
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  const showRefresh = Boolean(template.provider_content_sid);
  const showSubmit =
    !template.provider_content_sid || template.approval_status === "rejected";

  if (!showRefresh && !showSubmit) return null;

  return (
    <div className="flex items-center gap-3">
      {showRefresh && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await refreshTemplateStatusAction(template.id);
              toast("Status refreshed.");
              router.refresh();
            })
          }
          className="text-[12px] font-bold text-brand-orange hover:text-brand-orange-dark disabled:opacity-50"
        >
          {pending ? "…" : "Refresh status"}
        </button>
      )}
      {showSubmit && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await submitTemplateToMetaAction(template.id);
              toast("Submitted to Meta via Twilio.");
              router.refresh();
            })
          }
          className="text-[12px] font-bold text-brand-orange hover:text-brand-orange-dark disabled:opacity-50"
        >
          {pending
            ? "…"
            : template.provider_content_sid
              ? "Resubmit to Meta"
              : "Submit to Meta"}
        </button>
      )}
    </div>
  );
}
