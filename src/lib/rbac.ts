import type { Session } from "./session-types";

// Per-member capability keys. Admins bypass these entirely.
// Kept as string literal union so callers get autocomplete.
export const PERMISSIONS = [
  "leads:view_all",       // otherwise: only own leads
  "leads:edit",
  "leads:delete",
  "leads:import",
  "leads:export",
  "leads:assign",         // reassign leads to other members
  "comms:send_email",
  "comms:send_whatsapp",
  "comms:call",
  "notes:create",
  "templates:manage",     // edit email/WhatsApp templates
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "leads:view_all": "See all leads (not just their own)",
  "leads:edit": "Edit lead fields",
  "leads:delete": "Delete leads",
  "leads:import": "Import leads from CSV",
  "leads:export": "Export leads",
  "leads:assign": "Reassign leads to other members",
  "comms:send_email": "Send emails",
  "comms:send_whatsapp": "Send WhatsApp messages",
  "comms:call": "Place calls (click-to-call)",
  "notes:create": "Create notes on leads",
  "templates:manage": "Edit email / WhatsApp templates",
};

// Default permissions granted to a new member on creation.
export const DEFAULT_MEMBER_PERMISSIONS: Permission[] = [
  "leads:edit",
  "leads:import",
  "leads:export",
  "comms:send_email",
  "comms:send_whatsapp",
  "comms:call",
  "notes:create",
];

export function hasPermission(session: Session, perms: Record<string, boolean>, perm: Permission): boolean {
  if (session.role === "admin") return true;
  return perms[perm] === true;
}
