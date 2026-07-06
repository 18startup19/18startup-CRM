"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail, X, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, Select, Textarea } from "@/components/ui/card";
import { sendEmailAction } from "@/app/actions/comms";
import { useToast } from "@/components/ui/toast";
import type { EmailTemplateRow, LeadRow } from "@/lib/database.types";

interface Props {
  lead: Pick<LeadRow, "id" | "name" | "email" | "phone" | "custom">;
  templates: EmailTemplateRow[];
  onClose: () => void;
}

// Two-step email compose: pick source (template or custom) → preview & edit
// in a full modal → confirm send. Templates get their placeholders resolved
// against the lead on the client for preview only; the real substitution
// happens server-side via sendEmail's renderTemplate.

export function EmailCompose({ lead, templates, onClose }: Props) {
  const [source, setSource] = useState<"template" | "custom">(
    templates.length > 0 ? "template" : "custom",
  );
  const [templateId, setTemplateId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const { toast } = useToast();

  // Load selected template into editable fields
  useEffect(() => {
    if (source !== "template" || !templateId) return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setSubject(renderClientSide(tpl.subject, lead));
    setBody(renderClientSide(tpl.body_html, lead));
  }, [templateId, source, templates, lead]);

  function send() {
    if (!lead.email) {
      toast("Add an email to the lead first.", "error");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast("Subject and body are required.", "error");
      return;
    }
    const fd = new FormData();
    if (source === "template" && templateId) fd.set("template_id", templateId);
    fd.set("subject", subject);
    fd.set("body_html", body);
    start(async () => {
      try {
        await sendEmailAction(lead.id, fd);
        toast("Email sent.");
        onClose();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to send.", "error");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-[14px] shadow-2xl max-w-[720px] w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-brand-border flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Mail size={16} className="text-brand-charcoal" />
            <h3 className="text-[15px] font-bold text-brand-charcoal truncate">
              Send email to {lead.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] hover:bg-brand-bg text-brand-dark-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSource("template")}
            className={
              "flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12.5px] font-bold uppercase tracking-[0.4px] transition-colors " +
              (source === "template"
                ? "bg-brand-orange/10 text-brand-orange"
                : "text-brand-dark-text hover:bg-brand-bg")
            }
          >
            <FileText size={13} /> Use template
          </button>
          <button
            type="button"
            onClick={() => setSource("custom")}
            className={
              "flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12.5px] font-bold uppercase tracking-[0.4px] transition-colors " +
              (source === "custom"
                ? "bg-brand-orange/10 text-brand-orange"
                : "text-brand-dark-text hover:bg-brand-bg")
            }
          >
            <Pencil size={13} /> Custom
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-4">
          {source === "template" && (
            <div className="flex flex-col gap-[7px]">
              <FieldLabel htmlFor="ec-tpl">Template</FieldLabel>
              <Select
                id="ec-tpl"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                <option value="">Pick a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              {templates.length === 0 && (
                <p className="text-[12px] text-brand-dark-text">
                  No templates yet. Add them under Admin → Templates.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="ec-to">To</FieldLabel>
            <Input id="ec-to" value={lead.email ?? ""} readOnly disabled />
          </div>

          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="ec-subj">Subject</FieldLabel>
            <Input
              id="ec-subj"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's the email about?"
            />
          </div>

          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="ec-body">Body (HTML supported)</FieldLabel>
            <Textarea
              id="ec-body"
              rows={10}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message. Templates support {{name}} / {{email}} / {{phone}}."
            />
          </div>

          {body && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-dark-text mb-1.5">
                Preview
              </div>
              <div
                className="rounded-[10px] border border-brand-border p-4 text-[13.5px] bg-brand-bg overflow-auto max-h-[240px]"
                dangerouslySetInnerHTML={{ __html: body }}
              />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-brand-border flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={send}
            loading={pending}
            disabled={!lead.email || !subject.trim() || !body.trim()}
          >
            Confirm and send
          </Button>
        </div>
      </div>
    </div>
  );
}

// Client-side placeholder substitution mirroring lib/utils.renderTemplate.
// Purely for preview — server also renders for real.
function renderClientSide(
  body: string,
  lead: Pick<LeadRow, "name" | "email" | "phone" | "custom">,
): string {
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
    const key = expr.trim();
    if (key === "name") return lead.name ?? "";
    if (key === "email") return lead.email ?? "";
    if (key === "phone") return lead.phone ?? "";
    if (key.startsWith("custom.")) {
      const v = (lead.custom as Record<string, unknown> | null)?.[key.slice(7)];
      return v == null ? "" : String(v);
    }
    return "";
  });
}
