"use client";

import { useActionState, useState } from "react";
import { Card, FieldError, FieldLabel, Input, Textarea } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  archiveEmailTemplateAction,
  createEmailTemplateAction,
  updateEmailTemplateAction,
  type TemplateResult,
} from "@/app/actions/templates";
import type { EmailTemplateRow } from "@/lib/database.types";

const initial: TemplateResult = {};

export function EmailTemplatesManager({ templates }: { templates: EmailTemplateRow[] }) {
  const [state, formAction, isPending] = useActionState(createEmailTemplateAction, initial);

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
        {templates.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
        {templates.length === 0 && (
          <Card className="p-8 text-center text-brand-dark-text">
            No email templates yet.
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
