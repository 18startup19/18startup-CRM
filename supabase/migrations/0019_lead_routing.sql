-- Per-form / per-payment-page routing. Each rule maps a (source,
-- match_value) pair to a specific stage. Match values:
--   * Webflow  → the form's name (payload.name)
--   * Razorpay → the payment's description (entity.description)
-- Fallback path: intake_settings.fallback_stage_id, then the CRM's
-- leftmost open stage as a last resort.
create table if not exists lead_routing_rules (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('razorpay','webflow')),
  match_value text not null,
  stage_id uuid not null references lead_stages(id) on delete cascade,
  is_active boolean not null default true,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, match_value)
);
create index if not exists lead_routing_rules_source_idx
  on lead_routing_rules (source, is_active);

-- Single-row settings for fallback routing when no rule matches.
create table if not exists intake_settings (
  id smallint primary key default 1 check (id = 1),
  fallback_stage_id uuid references lead_stages(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into intake_settings (id) values (1) on conflict do nothing;
