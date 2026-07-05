-- 18startup CRM — pipelines + kanban card configuration
-- Adds multi-pipeline support and stores the shared Kanban card field list
-- inside integration_settings.config.

-- ── Pipelines ──────────────────────────────────────────────────────────────

create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position int not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists pipelines_position_uniq
  on pipelines (position) where is_archived = false;

-- Seed one default pipeline so existing stages/leads have a home.
insert into pipelines (name, position)
select 'Default', 1
where not exists (select 1 from pipelines);

-- ── Stage → pipeline link ──────────────────────────────────────────────────

alter table lead_stages
  add column if not exists pipeline_id uuid references pipelines (id) on delete cascade;

update lead_stages
  set pipeline_id = (select id from pipelines order by position asc limit 1)
  where pipeline_id is null;

alter table lead_stages
  alter column pipeline_id set not null;

create index if not exists lead_stages_pipeline_idx on lead_stages (pipeline_id);

-- The old (position) uniqueness was global; now it should be per-pipeline.
drop index if exists lead_stages_position_uniq;
create unique index if not exists lead_stages_pipeline_position_uniq
  on lead_stages (pipeline_id, position) where is_archived = false;

-- ── Kanban card configuration ──────────────────────────────────────────────
-- Stored as an array of field keys in integration_settings.config.kanban_card_fields.
-- Built-in keys: 'phone', 'email', 'source', 'owner', 'next_callback_at', 'updated_at'.
-- Custom field keys: 'cf:<custom_fields.key>'.

update integration_settings
  set config = coalesce(config, '{}'::jsonb)
             || jsonb_build_object('kanban_card_fields', '["phone","next_callback_at"]'::jsonb)
  where id = 1
    and not (config ? 'kanban_card_fields');
