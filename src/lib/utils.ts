export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.round((now - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateTime(iso);
}

// Reduce a phone number to just its digits (drop + and any formatting) so
// two different notations of the same number match. Used to match inbound
// Twilio webhook payloads back to leads by phone.
export function normalizePhoneDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/[^\d]/g, "");
}

export function slugifyKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

// Merge lead's custom values with a template body, replacing {{name}}, {{email}},
// {{phone}}, and {{custom.<key>}} tokens. Missing values render as empty string.
export function renderTemplate(
  body: string,
  lead: { name: string; email: string | null; phone: string | null; custom: Record<string, unknown> },
): string {
  return body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr: string) => {
    const key = expr.trim();
    if (key === "name") return lead.name ?? "";
    if (key === "email") return lead.email ?? "";
    if (key === "phone") return lead.phone ?? "";
    if (key.startsWith("custom.")) {
      const k = key.slice(7);
      const v = lead.custom?.[k];
      return v == null ? "" : String(v);
    }
    return "";
  });
}
