"use client";

import { useActionState, useState } from "react";
import { Users } from "lucide-react";
import { Card, FieldError, FieldLabel, Input, Textarea } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createFaqAction,
  deleteFaqAction,
  updateFaqAction,
  type FaqResult,
} from "@/app/actions/faq";
import { useToast } from "@/components/ui/toast";
import type { FaqTemplateRow } from "@/lib/database.types";

const initial: FaqResult = {};

export function FaqManager({
  templates,
  currentUserId,
  isAdmin,
}: {
  templates: FaqTemplateRow[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [state, formAction, isPending] = useActionState(createFaqAction, initial);
  const { toast } = useToast();

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast("Copied to clipboard."),
      () => toast("Couldn't copy.", "error"),
    );
  }

  return (
    <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
      <Card className="p-6">
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-4">
          New FAQ template
        </h2>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="f-title">Title</FieldLabel>
            <Input id="f-title" name="title" required placeholder="e.g. Pricing info" />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="f-cat">Category (optional)</FieldLabel>
            <Input id="f-cat" name="category" placeholder="pricing, product, support…" />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="f-body">Message body</FieldLabel>
            <Textarea id="f-body" name="body" rows={6} required />
          </div>
          <label className="flex items-center gap-2 text-[13.5px] text-brand-charcoal">
            <input type="checkbox" name="shared" />
            Share with team (visible to everyone)
          </label>
          {state.error && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
              <FieldError>{state.error}</FieldError>
            </div>
          )}
          <Button type="submit" size="md" disabled={isPending}>
            {isPending ? "Saving…" : "Save FAQ"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        {templates.map((t) => (
          <FaqCard
            key={t.id}
            template={t}
            canEdit={t.owner_id === currentUserId || isAdmin}
            onCopy={() => copyToClipboard(t.body)}
          />
        ))}
        {templates.length === 0 && (
          <Card className="p-8 text-center text-brand-dark-text">
            No FAQ templates yet. Add one on the left.
          </Card>
        )}
      </div>
    </div>
  );
}

function FaqCard({
  template,
  canEdit,
  onCopy,
}: {
  template: FaqTemplateRow;
  canEdit: boolean;
  onCopy: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <Card className="p-5">
        <form
          action={async (fd) => {
            await updateFaqAction(template.id, fd);
            setEditing(false);
          }}
          className="flex flex-col gap-3"
        >
          <Input name="title" defaultValue={template.title} required />
          <Input name="category" defaultValue={template.category ?? ""} />
          <Textarea name="body" defaultValue={template.body} rows={5} required />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[12.5px] font-bold text-brand-dark-text"
            >
              Cancel
            </button>
            <Button size="sm" type="submit">
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
        <div className="flex items-center gap-2">
          <div className="font-bold text-brand-charcoal text-[14.5px]">
            {template.title}
          </div>
          {template.category && (
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-brand-dark-text bg-brand-bg px-1.5 py-0.5 rounded-full">
              {template.category}
            </span>
          )}
          {template.owner_id === null && (
            <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-brand-orange bg-brand-orange/10 px-1.5 py-0.5 rounded-full inline-flex items-center gap-1">
              <Users size={10} /> Shared
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCopy}
            className="text-[12.5px] font-bold text-brand-orange hover:text-brand-orange-dark"
          >
            Copy
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-[12.5px] font-bold text-brand-dark-text hover:text-brand-charcoal"
              >
                Edit
              </button>
              <form action={deleteFaqAction.bind(null, template.id)}>
                <button
                  type="submit"
                  className="text-[12.5px] font-bold text-red-500 hover:text-red-600"
                >
                  Delete
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <pre className="text-[13.5px] whitespace-pre-wrap text-brand-charcoal font-sans">
        {template.body}
      </pre>
    </Card>
  );
}
