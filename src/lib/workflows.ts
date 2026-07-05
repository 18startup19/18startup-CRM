import { supabaseAdmin } from "./supabase-admin";
import type { LeadRow, WorkflowRuleRow } from "./database.types";
import type { Session } from "./session";
import { sendEmail } from "./integrations/email";
import { sendWhatsAppTemplate } from "./integrations/whatsapp";

interface Ctx {
  session: Session;
  from?: string | null;
}

// Execute all active workflow rules matching a trigger against a lead.
// Runs synchronously after the action commits. Failures are logged but do not
// throw — we don't want a bad rule to break the calling action.
export async function runWorkflows(
  trigger: WorkflowRuleRow["trigger_kind"],
  lead: LeadRow,
  ctx: Ctx,
): Promise<void> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("workflow_rules")
    .select("*")
    .eq("is_active", true)
    .eq("trigger_kind", trigger);
  const rules = (data ?? []) as WorkflowRuleRow[];

  for (const rule of rules) {
    if (!conditionsMatch(rule, lead)) continue;
    for (const action of rule.actions ?? []) {
      try {
        await runAction(action, lead, ctx);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`workflow ${rule.id} action ${action.kind} failed:`, err);
      }
    }
  }
}

function conditionsMatch(rule: WorkflowRuleRow, lead: LeadRow): boolean {
  for (const cond of rule.conditions ?? []) {
    const value = readLeadValue(lead, cond.field);
    if (!compareValue(value, cond.op, cond.value)) return false;
  }
  return true;
}

function readLeadValue(lead: LeadRow, field: string): unknown {
  if (field.startsWith("custom.")) return lead.custom?.[field.slice(7)];
  return (lead as unknown as Record<string, unknown>)[field];
}

function compareValue(a: unknown, op: string, b: unknown): boolean {
  switch (op) {
    case "eq":
      return a === b;
    case "neq":
      return a !== b;
    case "in":
      return Array.isArray(b) && b.includes(a as string);
    case "contains":
      return typeof a === "string" && typeof b === "string" && a.toLowerCase().includes(b.toLowerCase());
    case "is_empty":
      return a == null || a === "";
    case "is_not_empty":
      return a != null && a !== "";
    default:
      return false;
  }
}

async function runAction(
  action: { kind: string; config: Record<string, unknown> },
  lead: LeadRow,
  ctx: Ctx,
): Promise<void> {
  const sb = supabaseAdmin();
  switch (action.kind) {
    case "send_email": {
      const templateId = action.config.template_id as string;
      if (!templateId || !lead.email) return;
      const { data: tpl } = await sb.from("email_templates").select("*").eq("id", templateId).single();
      if (!tpl) return;
      await sendEmail({
        lead,
        subject: tpl.subject,
        bodyHtml: tpl.body_html,
      });
      break;
    }
    case "send_whatsapp": {
      const templateId = action.config.template_id as string;
      if (!templateId || !lead.phone || lead.is_dnc) return;
      const { data: tpl } = await sb.from("whatsapp_templates").select("*").eq("id", templateId).single();
      if (!tpl) return;
      await sendWhatsAppTemplate({ lead, template: tpl });
      break;
    }
    case "assign_owner": {
      const ownerId = action.config.owner_id as string;
      if (!ownerId) return;
      await sb.from("leads").update({ owner_id: ownerId }).eq("id", lead.id);
      await sb.from("lead_activities").insert({
        lead_id: lead.id,
        actor_id: ctx.session.userId,
        kind: "owner_changed",
        payload: { from: lead.owner_id, to: ownerId, via: "workflow" },
      });
      break;
    }
    case "update_field": {
      const key = action.config.field as string;
      const value = action.config.value;
      if (!key) return;
      if (key.startsWith("custom.")) {
        const customKey = key.slice(7);
        const custom = { ...(lead.custom ?? {}), [customKey]: value };
        await sb.from("leads").update({ custom }).eq("id", lead.id);
      } else {
        await sb.from("leads").update({ [key]: value }).eq("id", lead.id);
      }
      break;
    }
    case "set_stage": {
      const stageId = action.config.stage_id as string;
      if (!stageId) return;
      await sb.from("leads").update({ stage_id: stageId }).eq("id", lead.id);
      await sb.from("lead_activities").insert({
        lead_id: lead.id,
        actor_id: ctx.session.userId,
        kind: "stage_changed",
        payload: { from: lead.stage_id, to: stageId, via: "workflow" },
      });
      break;
    }
  }
}
