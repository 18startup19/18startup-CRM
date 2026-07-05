import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Provider-neutral WhatsApp webhook. Two flows:
//  - status updates: match by provider_message_id, set delivered/read/failed
//  - inbound messages: find lead by phone, insert an inbound communications row
//    (if no lead exists, we do NOT auto-create — WhatsApp inbound is a reply,
//    not typically a new-lead source).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ ok: false }, { status: 400 });

  const sb = supabaseAdmin();
  const messages = extractMessages(body);
  const statuses = extractStatuses(body);

  for (const st of statuses) {
    await sb
      .from("communications")
      .update({ status: st.status })
      .eq("provider_message_id", st.id);
  }

  for (const msg of messages) {
    const { data: lead } = await sb
      .from("leads")
      .select("id")
      .eq("phone", msg.from)
      .maybeSingle();
    if (!lead) continue;
    await sb.from("communications").insert({
      lead_id: lead.id,
      channel: "whatsapp",
      direction: "inbound",
      status: "delivered",
      body: msg.text,
      provider_message_id: msg.id,
      provider: "webhook",
    });
  }
  return Response.json({ ok: true });
}

// Meta/BSP payloads vary. This handles the Meta Cloud API shape; adapters for
// BSP-specific shapes plug in the same way.
function extractMessages(body: Record<string, unknown>): { id: string; from: string; text: string }[] {
  const out: { id: string; from: string; text: string }[] = [];
  const entries = (body.entry as unknown[]) ?? [];
  for (const e of entries as Array<Record<string, unknown>>) {
    const changes = (e.changes as unknown[]) ?? [];
    for (const c of changes as Array<Record<string, unknown>>) {
      const value = (c.value as Record<string, unknown>) ?? {};
      const messages = (value.messages as unknown[]) ?? [];
      for (const m of messages as Array<Record<string, unknown>>) {
        const text = ((m.text as Record<string, unknown> | undefined)?.body as string) ?? "";
        out.push({
          id: String(m.id ?? ""),
          from: String(m.from ?? ""),
          text,
        });
      }
    }
  }
  return out;
}

function extractStatuses(body: Record<string, unknown>): { id: string; status: string }[] {
  const out: { id: string; status: string }[] = [];
  const entries = (body.entry as unknown[]) ?? [];
  for (const e of entries as Array<Record<string, unknown>>) {
    const changes = (e.changes as unknown[]) ?? [];
    for (const c of changes as Array<Record<string, unknown>>) {
      const value = (c.value as Record<string, unknown>) ?? {};
      const statuses = (value.statuses as unknown[]) ?? [];
      for (const s of statuses as Array<Record<string, unknown>>) {
        out.push({ id: String(s.id ?? ""), status: String(s.status ?? "sent") });
      }
    }
  }
  return out;
}
