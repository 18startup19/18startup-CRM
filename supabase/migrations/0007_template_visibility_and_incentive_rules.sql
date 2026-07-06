-- Template visibility toggle: admin controls which templates the team
-- members see in the lead compose surfaces.
alter table email_templates
  add column if not exists visible_to_members boolean not null default true;

alter table whatsapp_templates
  add column if not exists visible_to_members boolean not null default true;

-- Range-based incentive rules on users. Kept as JSONB so ranges are portable
-- across UI edits and any future formula tweaks (e.g. flat + percent).
-- Shape: array of { from: number, to: number|null, percent: number }.
-- The old `incentive_percent` column stays for now as a fallback when no
-- ranges are configured.
alter table users
  add column if not exists incentive_rules jsonb not null default '[]'::jsonb;
