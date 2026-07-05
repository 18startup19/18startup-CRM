-- 18startup CRM — per-user pipeline access + in-app notifications

-- ── Pipeline access on users ───────────────────────────────────────────────
-- Empty array or NULL = no restriction (admin default). Non-empty limits the
-- member to the listed pipelines everywhere in the UI.

alter table users
  add column if not exists pipeline_ids uuid[] not null default '{}';

-- ── Notifications ──────────────────────────────────────────────────────────
-- Simple queue: server actions insert; layout server component reads unread
-- rows for the current user and renders a toast. "kind" is a free-form string;
-- payload holds the details the UI needs to render.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,                                     -- 'lead_assigned' | ...
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on notifications (user_id, created_at desc) where read_at is null;
