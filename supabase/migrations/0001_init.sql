-- 18startup CRM — initial schema
-- Access control is enforced in server routes via session cookies + the RBAC
-- helpers in src/lib/rbac.ts. Supabase RLS is not used; the app uses the
-- service-role key exclusively (see src/lib/supabase-admin.ts).

create extension if not exists "pgcrypto";

-- ── Users & RBAC ────────────────────────────────────────────────────────────

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null check (role in ('admin', 'member')),
  is_active boolean not null default true,
  -- Per-member capability grants. Ignored when role='admin' (admins have all).
  -- Keys documented in src/lib/rbac.ts: PERMISSIONS.
  permissions jsonb not null default '{}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_role_idx on users (role);

-- ── Lead pipeline stages ────────────────────────────────────────────────────

create table lead_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#F37335',
  -- 'open' = active pipeline; 'won' / 'lost' = terminal
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  position int not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index lead_stages_position_uniq on lead_stages (position) where is_archived = false;

-- ── Custom field definitions ────────────────────────────────────────────────

create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,        -- machine key, e.g. "budget_inr"
  label text not null,             -- display label
  type text not null check (type in ('text', 'longtext', 'number', 'date', 'dropdown', 'checkbox', 'phone', 'email')),
  -- For 'dropdown': ["option1", "option2", ...]. Ignored otherwise.
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  position int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index custom_fields_position_idx on custom_fields (position);

-- ── Leads ───────────────────────────────────────────────────────────────────

create table leads (
  id uuid primary key default gen_random_uuid(),
  -- Core built-in fields (present on every lead)
  name text not null,
  phone text,
  email text,
  source text,                     -- 'manual' | 'csv' | 'web_form' | 'fb_ads' | 'indiamart' | 'missed_call' | 'api'
  stage_id uuid references lead_stages (id) on delete set null,
  owner_id uuid references users (id) on delete set null,
  -- Callback datetime (baked in instead of a separate task object)
  next_callback_at timestamptz,
  -- All custom fields land here, keyed by custom_fields.key
  custom jsonb not null default '{}'::jsonb,
  -- Do-not-contact flag (blocks automated comms). Set by outcome or admin.
  is_dnc boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_stage_idx on leads (stage_id);
create index leads_owner_idx on leads (owner_id);
create index leads_created_idx on leads (created_at desc);
create index leads_next_callback_idx on leads (next_callback_at) where next_callback_at is not null;
create index leads_phone_idx on leads (phone) where phone is not null;
create index leads_email_idx on leads (email) where email is not null;

-- ── Notes ───────────────────────────────────────────────────────────────────

create table lead_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  author_id uuid references users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index lead_notes_lead_idx on lead_notes (lead_id, created_at desc);

-- ── Activity / history log ──────────────────────────────────────────────────
-- Field changes + system events. Immutable append-only.

create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  actor_id uuid references users (id) on delete set null,
  -- 'created' | 'updated' | 'stage_changed' | 'owner_changed' | 'assigned' | 'imported' | 'converted'
  kind text not null,
  -- Payload shape depends on kind. E.g. {from:"New",to:"Qualified"} for stage_changed.
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index lead_activities_lead_idx on lead_activities (lead_id, created_at desc);

-- ── Communications (call, whatsapp, email — inbound + outbound) ─────────────

create table communications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  channel text not null check (channel in ('call', 'whatsapp', 'email')),
  direction text not null check (direction in ('inbound', 'outbound')),
  -- 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'answered' | 'missed' | 'no_answer' | 'busy'
  status text not null default 'queued',
  actor_id uuid references users (id) on delete set null,   -- team member who initiated (if outbound)
  -- Free-form text body (WhatsApp text; email subject stored separately; call summary/outcome)
  subject text,
  body text,
  -- Call-specific
  duration_seconds int,
  recording_url text,
  outcome text,            -- 'interested' | 'callback' | 'not_interested' | 'wrong_number' | 'busy' | 'no_answer' | 'dnc'
  -- Provider ref (for webhook reconciliation)
  provider text,
  provider_message_id text,
  -- Optional attachments (WhatsApp media, email attachment URLs)
  attachments jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index communications_lead_idx on communications (lead_id, created_at desc);
create index communications_provider_msg_idx on communications (provider, provider_message_id)
  where provider_message_id is not null;

-- ── Email templates ─────────────────────────────────────────────────────────

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  -- Body supports {{name}}, {{email}}, {{custom.key}} interpolation.
  body_html text not null,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── WhatsApp templates (BSP-approved) ───────────────────────────────────────

create table whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- must match BSP-approved template name
  language text not null default 'en',
  category text,                         -- 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  body text not null,                    -- copy of the approved body, with {{1}} placeholders
  variables jsonb not null default '[]'::jsonb,  -- ordered mapping to lead fields, e.g. ["name","custom.budget_inr"]
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Workflow rules ──────────────────────────────────────────────────────────
-- Simple trigger→condition→action rules. Executed synchronously after the
-- triggering server action commits.

create table workflow_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  -- 'lead_created' | 'stage_changed' | 'field_changed' | 'callback_due'
  trigger_kind text not null,
  -- Free-form config per trigger. e.g. {to_stage: "<uuid>"} for stage_changed.
  trigger_config jsonb not null default '{}'::jsonb,
  -- Array of {field, op, value} clauses ANDed together.
  -- op: 'eq' | 'neq' | 'in' | 'contains' | 'is_empty' | 'is_not_empty'
  conditions jsonb not null default '[]'::jsonb,
  -- Ordered list of actions. Each: {kind, config}.
  -- kind: 'send_email' | 'send_whatsapp' | 'assign_owner' | 'update_field' | 'set_stage'
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workflow_rules_trigger_idx on workflow_rules (trigger_kind) where is_active = true;

-- ── Saved lead views (filters + sort) ───────────────────────────────────────

create table lead_views (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references users (id) on delete cascade, -- null = shared
  -- {filters: [{field, op, value}], sort: {field, dir}}
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ── Integration settings (single-row config) ────────────────────────────────

create table integration_settings (
  id int primary key default 1 check (id = 1),
  email_provider text default 'mock',
  whatsapp_provider text default 'mock',
  telephony_provider text default 'mock',
  -- Provider-specific credentials kept in env vars, not the DB. This table
  -- is for UI-configurable settings like "auto-log all calls", webhook flags.
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into integration_settings (id) values (1) on conflict (id) do nothing;

-- ── Seed default lead stages ────────────────────────────────────────────────

insert into lead_stages (name, color, kind, position) values
  ('New',          '#F37335', 'open', 1),
  ('Contacted',    '#4A90E2', 'open', 2),
  ('Qualified',    '#F5A623', 'open', 3),
  ('Proposal',     '#7B61FF', 'open', 4),
  ('Won',          '#2ECC71', 'won',  5),
  ('Lost',         '#94A3B8', 'lost', 6)
on conflict do nothing;

-- ── updated_at auto-touch ───────────────────────────────────────────────────

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger users_touch before update on users
  for each row execute function touch_updated_at();
create trigger leads_touch before update on leads
  for each row execute function touch_updated_at();
create trigger email_templates_touch before update on email_templates
  for each row execute function touch_updated_at();
create trigger workflow_rules_touch before update on workflow_rules
  for each row execute function touch_updated_at();
create trigger integration_settings_touch before update on integration_settings
  for each row execute function touch_updated_at();
