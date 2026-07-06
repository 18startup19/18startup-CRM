"use client";

import { useActionState, useState } from "react";
import { Card, FieldError, FieldLabel, Input, Textarea } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  archiveEmailTemplateAction,
  createEmailTemplateAction,
  restoreEmailTemplateAction,
  toggleEmailTemplateVisibilityAction,
  updateEmailTemplateAction,
  type TemplateResult,
} from "@/app/actions/templates";
import type { EmailTemplateRow } from "@/lib/database.types";

const initial: TemplateResult = {};

export function EmailTemplatesManager({ templates }: { templates: EmailTemplateRow[] }) {
  const [state, formAction, isPending] = useActionState(createEmailTemplateAction, initial);
  const active = templates.filter((t) => !t.is_archived);
  const archived = templates.filter((t) => t.is_archived);

  return (
    <div className="grid grid-cols-[420px_1fr] gap-6 items-start">
      <Card className="p-6">
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-4">New template</h2>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="t-name">Name</FieldLabel>
            <Input id="t-name" name="name" required />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="t-subject">Subject</FieldLabel>
            <Input id="t-subject" name="subject" required />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="t-body">Body (HTML supported)</FieldLabel>
            <Textarea id="t-body" name="body_html" rows={10} required />
          </div>
          {state.error && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
              <FieldError>{state.error}</FieldError>
            </div>
          )}
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Saving..." : "Save template"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-4">
        {active.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
        {active.length === 0 && (
          <Card className="p-8 text-center text-brand-dark-text">
            No email templates yet.
          </Card>
        )}

        {archived.length > 0 && (
          <Card className="p-5 border-dashed">
            <div className="mb-3">
              <h3 className="text-[14px] font-bold text-brand-charcoal">
                Archived templates ({archived.length})
              </h3>
              <p className="text-[12px] text-brand-dark-text mt-1">
                Restore a template to make it available again.
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
                    <div className="text-[12px] text-brand-dark-text">{t.subject}</div>
                  </div>
                  <form action={restoreEmailTemplateAction.bind(null, t.id)}>
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

function TemplateCard({ template }: { template: EmailTemplateRow }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <Card className="p-5">
        <form
          action={async (fd) => {
            await updateEmailTemplateAction(template.id, fd);
            setEditing(false);
          }}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor={`n-${template.id}`}>Name</FieldLabel>
            <Input id={`n-${template.id}`} name="name" defaultValue={template.name} required />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor={`s-${template.id}`}>Subject</FieldLabel>
            <Input
              id={`s-${template.id}`}
              name="subject"
              defaultValue={template.subject}
              required
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor={`b-${template.id}`}>Body</FieldLabel>
            <Textarea
              id={`b-${template.id}`}
              name="body_html"
              defaultValue={template.body_html}
              rows={10}
              required
            />
          </div>
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
      </Card>
    );
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="font-bold text-brand-charcoal">{template.name}</div>
          <div className="text-[12px] text-brand-dark-text">{template.subject}</div>
        </div>
        <div className="flex items-center gap-3">
          <label
            className="flex items-center gap-1.5 text-[12px] font-bold text-brand-dark-text cursor-pointer select-none"
            title="Uncheck to hide this template from team members"
          >
            <input
              type="checkbox"
              defaultChecked={template.visible_to_members}
              onChange={(e) =>
                toggleEmailTemplateVisibilityAction(template.id, e.target.checked)
              }
            />
            Visible to team
          </label>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[12px] font-bold text-brand-orange hover:text-brand-orange-dark"
          >
            Edit
          </button>
          <form action={archiveEmailTemplateAction.bind(null, template.id)}>
            <button
              type="submit"
              className="text-[12px] font-bold text-red-500 hover:text-red-600"
            >
              Archive
            </button>
          </form>
        </div>
      </div>
      <pre className="text-[12px] text-brand-dark-text bg-brand-bg border border-brand-border rounded-[8px] p-3 whitespace-pre-wrap font-sans">
        {template.body_html.slice(0, 400)}
        {template.body_html.length > 400 ? "…" : ""}
      </pre>
    </Card>
  );
}
