"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Send, MessageSquare, User, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sendWhatsAppAction } from "@/app/actions/comms";
import { formatDateTime, formatRelative } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import type {
  CommunicationRow,
  LeadRow,
  WhatsAppTemplateRow,
} from "@/lib/database.types";
import type { WhatsAppConversation } from "@/app/whatsapp/page";

interface Props {
  conversations: WhatsAppConversation[];
  selectedLeadId: string | null;
  selectedLead: Pick<LeadRow, "id" | "name" | "phone" | "is_dnc" | "tags"> | null;
  thread: CommunicationRow[];
  lastInboundAt: string | null;
  templates: WhatsAppTemplateRow[];
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export function WhatsAppInbox({
  conversations,
  selectedLeadId,
  selectedLead,
  thread,
  lastInboundAt,
  templates,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const filtered = search
    ? conversations.filter(
        (c) =>
          c.leadName.toLowerCase().includes(search.toLowerCase()) ||
          (c.leadPhone ?? "").includes(search) ||
          c.lastMessage.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations;

  const insideWindow =
    lastInboundAt !== null &&
    Date.now() - new Date(lastInboundAt).getTime() < TWENTY_FOUR_HOURS;

  return (
    <div className="flex h-[calc(100vh-97px)] border-t border-brand-border">
      {/* LEFT PANE — conversation list */}
      <div className="w-[340px] shrink-0 border-r border-brand-border bg-white flex flex-col">
        <div className="p-3 border-b border-brand-border">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-dark-text"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations…"
              className="w-full pl-8 pr-3 py-2 rounded-[8px] border-[1.5px] border-brand-border bg-brand-bg text-[13px] outline-none focus:border-brand-orange"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center text-brand-dark-text text-[13px] py-16 px-6">
              {conversations.length === 0
                ? "No WhatsApp conversations yet. Send a message from a lead page to start one."
                : "No conversations match your search."}
            </div>
          ) : (
            <ul>
              {filtered.map((c) => (
                <li key={c.leadId}>
                  <Link
                    href={`/whatsapp?lead=${c.leadId}`}
                    className={
                      "block px-4 py-3 border-b border-brand-border hover:bg-brand-bg " +
                      (c.leadId === selectedLeadId ? "bg-[#FFF4EF]" : "")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-brand-charcoal text-[14px] truncate">
                        {c.leadName}
                      </div>
                      <div className="text-[11px] text-brand-dark-text shrink-0">
                        {formatRelative(c.lastMessageAt)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <div className="text-[12.5px] text-brand-dark-text truncate flex-1">
                        {c.lastDirection === "outbound" && (
                          <span className="text-brand-orange font-bold">You: </span>
                        )}
                        {c.lastMessage || "—"}
                      </div>
                      {c.unread > 0 && (
                        <span className="shrink-0 text-[10px] font-bold bg-brand-orange text-white px-1.5 py-0.5 rounded-full">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* RIGHT PANE — thread + compose */}
      <div className="flex-1 flex flex-col bg-brand-bg">
        {!selectedLead ? (
          <div className="flex-1 flex items-center justify-center text-brand-dark-text">
            <div className="text-center">
              <MessageSquare size={44} className="inline text-brand-border mb-3" />
              <div className="text-[15px] font-bold text-brand-dark-text">
                Pick a conversation
              </div>
              <div className="text-[13px] text-brand-dark-text mt-1">
                Or start a new one by sending a WhatsApp from a lead's page.
              </div>
            </div>
          </div>
        ) : (
          <ChatView
            router={router}
            lead={selectedLead}
            thread={thread}
            insideWindow={insideWindow}
            lastInboundAt={lastInboundAt}
            templates={templates}
          />
        )}
      </div>
    </div>
  );
}

function ChatView({
  router,
  lead,
  thread,
  insideWindow,
  lastInboundAt,
  templates,
}: {
  router: ReturnType<typeof useRouter>;
  lead: Pick<LeadRow, "id" | "name" | "phone" | "is_dnc" | "tags">;
  thread: CommunicationRow[];
  insideWindow: boolean;
  lastInboundAt: string | null;
  templates: WhatsAppTemplateRow[];
}) {
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"text" | "template">(
    insideWindow ? "text" : templates.length > 0 ? "template" : "text",
  );
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [thread.length]);

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lead.is_dnc) {
      toast("This lead is marked DNC. Uncheck DNC first.", "error");
      return;
    }
    const fd = new FormData();
    if (mode === "text") {
      const body = text.trim();
      if (!body) return;
      fd.set("text", body);
    } else {
      if (!templateId) {
        toast("Pick a template.", "error");
        return;
      }
      fd.set("template_id", templateId);
    }

    start(async () => {
      try {
        await sendWhatsAppAction(lead.id, fd);
        setText("");
        setTemplateId("");
        toast("Sent.");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to send.", "error");
      }
    });
  }

  return (
    <>
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-brand-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-brand-orange/10 flex items-center justify-center text-brand-orange">
            <User size={16} />
          </div>
          <div className="min-w-0">
            <Link
              href={`/leads/${lead.id}`}
              className="block font-bold text-brand-charcoal text-[14.5px] truncate hover:text-brand-orange"
            >
              {lead.name}
            </Link>
            <div className="text-[11px] text-brand-dark-text">{lead.phone ?? "no phone"}</div>
          </div>
        </div>
        <Link
          href={`/leads/${lead.id}`}
          className="text-[12px] font-bold text-brand-orange hover:text-brand-orange-dark"
        >
          Open lead →
        </Link>
      </div>

      {/* thread */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {thread.length === 0 ? (
          <div className="text-center text-brand-dark-text text-[13px] py-16">
            No messages in this thread yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {thread.map((m) => (
              <MessageBubble key={m.id} msg={m} />
            ))}
          </ul>
        )}
        <div ref={bottomRef} />
      </div>

      {/* compose */}
      <div className="bg-white border-t border-brand-border p-4">
        {!insideWindow && (
          <div className="mb-3 text-[12px] text-brand-dark-text bg-[#FFF6E3] border border-[#F5D26A] rounded-[8px] px-3 py-2">
            {lastInboundAt
              ? `Last inbound was ${formatRelative(lastInboundAt)}. Outside the 24h session window — only pre-approved templates can be sent.`
              : "This lead hasn't messaged you yet. The first message must use a pre-approved template."}
          </div>
        )}
        <div className="flex items-center gap-2 mb-3 text-[12px] font-bold uppercase tracking-[0.4px]">
          <button
            type="button"
            onClick={() => setMode("text")}
            disabled={!insideWindow}
            title={
              !insideWindow ? "Free text is only allowed inside the 24h session window." : ""
            }
            className={
              "px-2 py-1 rounded-[6px] " +
              (mode === "text"
                ? "bg-brand-orange/10 text-brand-orange"
                : "text-brand-dark-text hover:bg-brand-bg") +
              (!insideWindow ? " opacity-40 cursor-not-allowed" : "")
            }
          >
            Free text
          </button>
          <button
            type="button"
            onClick={() => setMode("template")}
            className={
              "px-2 py-1 rounded-[6px] " +
              (mode === "template"
                ? "bg-brand-orange/10 text-brand-orange"
                : "text-brand-dark-text hover:bg-brand-bg")
            }
          >
            Template
          </button>
        </div>
        <form onSubmit={handleSend} className="flex items-end gap-2">
          {mode === "text" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a message…"
              disabled={!insideWindow || pending}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }}
              className="flex-1 px-3 py-2 rounded-[10px] border-[1.5px] border-brand-border bg-brand-bg text-[14px] outline-none focus:border-brand-orange resize-none disabled:opacity-50"
            />
          ) : (
            <div className="flex-1 flex flex-col gap-1">
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={pending}
                className="px-3 py-2 rounded-[10px] border-[1.5px] border-brand-border bg-brand-bg text-[14px] outline-none focus:border-brand-orange appearance-none pr-8"
              >
                <option value="">Pick a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.language ? `(${t.language})` : ""}
                  </option>
                ))}
              </select>
              {templates.length === 0 && (
                <p className="text-[11px] text-brand-dark-text">
                  No WhatsApp templates yet. Add them under Admin → WhatsApp templates.
                </p>
              )}
              {templateId &&
                (() => {
                  const preview = templates.find((t) => t.id === templateId);
                  if (!preview) return null;
                  return (
                    <p className="text-[11.5px] text-brand-dark-text mt-1 whitespace-pre-wrap">
                      {preview.body}
                    </p>
                  );
                })()}
            </div>
          )}
          <Button type="submit" size="md" disabled={pending}>
            {pending ? "…" : (
              <>
                <Send size={14} className="inline mr-1 -mt-0.5" />
                Send
              </>
            )}
          </Button>
        </form>
      </div>
    </>
  );
}

function MessageBubble({ msg }: { msg: CommunicationRow }) {
  const outbound = msg.direction === "outbound";
  return (
    <li className={"flex " + (outbound ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[68%] px-3.5 py-2 rounded-[14px] text-[13.5px] whitespace-pre-wrap " +
          (outbound
            ? "bg-brand-orange text-white rounded-br-[4px]"
            : "bg-white border border-brand-border text-brand-charcoal rounded-bl-[4px]")
        }
      >
        <div>{msg.body || <span className="italic opacity-60">(empty)</span>}</div>
        <div
          className={
            "text-[10px] mt-1 flex items-center gap-1 justify-end " +
            (outbound ? "text-white/80" : "text-brand-dark-text")
          }
          title={formatDateTime(msg.created_at)}
        >
          {formatRelative(msg.created_at)}
          {outbound && (
            <span className="uppercase tracking-[0.3px]">· {msg.status}</span>
          )}
        </div>
      </div>
    </li>
  );
}
