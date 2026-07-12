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

// GST rate applied to converted amounts before incentive is computed. Payments
// are recorded gross (customer-paid amount including GST), but incentives pay
// on the net revenue.
export const INCENTIVE_GST_RATE = 0.18;

// Choose the incentive % for a given payment amount. Iterates through the
// user's tiers and returns the matching one; if nothing matches, falls back
// to the base incentive_percent. `amount` should be the net (post-GST) figure.
export function incentivePercentForAmount(
  amount: number,
  rules: { from: number; to: number | null; percent: number }[] | null | undefined,
  fallback: number,
): number {
  if (!rules || rules.length === 0) return fallback;
  for (const r of rules) {
    const min = Number(r.from ?? 0);
    const max = r.to == null ? Infinity : Number(r.to);
    if (amount >= min && amount <= max) return Number(r.percent);
  }
  return fallback;
}

// Strips the 18% GST from a gross payment amount so the incentive tier lookup
// and payout math run on net revenue.
export function netAfterGst(gross: number): number {
  return gross / (1 + INCENTIVE_GST_RATE);
}

// Convert a UTC ISO from the DB into a "YYYY-MM-DDTHH:MM" wall-clock string
// suitable for <input type="datetime-local">. Uses the browser's local
// timezone so what the user typed comes back looking identical.
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Convert a wall-clock string from <input type="datetime-local"> to a proper
// UTC ISO for the DB. Sending the naked wall-clock string lets Postgres pin
// the wrong timezone, which was corrupting callback times by ±5h30m.
export function localInputToIso(local: string | null | undefined): string {
  if (!local) return "";
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
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
