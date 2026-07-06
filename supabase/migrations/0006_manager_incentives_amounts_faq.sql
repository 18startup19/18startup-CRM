-- 18startup CRM — manager role, incentives, converted-lead amounts,
-- FAQ templates, WhatsApp template types.

-- ── Users: expand role to include 'manager', add incentive percentage ──────
alter table users
  drop constraint if exists users_role_check;
alter table users
  add constraint users_role_check check (role in ('admin', 'manager', 'member'));

alter table users
  add column if not exists incentive_percent numeric not null default 0;

-- ── Lead amounts (converted leads) ─────────────────────────────────────────
-- Each time a team member records payment received, one row is inserted.
-- Total per lead is sum(amount); reports aggregate at owner + day level.

create table if not exists lead_amounts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  actor_id uuid references users (id) on delete set null,
  amount numeric not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists lead_amounts_lead_idx on lead_amounts (lead_id, created_at desc);
create index if not exists lead_amounts_actor_idx on lead_amounts (actor_id, created_at desc);

-- ── WhatsApp templates: split into approved (Meta-blessed) vs faq ──────────
-- 'approved' templates require Meta pre-approval and can be sent to a lead who
-- hasn't messaged us in the last 24h (first-touch). 'faq' templates are quick
-- pre-canned replies for use inside the 24h session window — no Meta involved.

alter table whatsapp_templates
  add column if not exists template_type text not null default 'approved'
    check (template_type in ('approved', 'faq')),
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('draft', 'pending', 'approved', 'rejected'));

-- ── FAQ templates for team members (reusable snippets) ────────────────────
-- Distinct from whatsapp_templates: these are personal, cross-channel
-- (WhatsApp free-text + Email) shortcuts a team member composes once and
-- pastes into any lead conversation.

create table if not exists faq_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references users (id) on delete cascade, -- null = shared across team
  title text not null,
  body text not null,
  category text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faq_templates_owner_idx on faq_templates (owner_id);

create trigger faq_templates_touch before update on faq_templates
  for each row execute function touch_updated_at();
