-- Cohorts are the "batch numbers" admins onboard leads into. Team members
-- pick one when logging a payment; the CRM groups everything by it.

create table if not exists cohorts (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cohorts_number_idx on cohorts (number);
create index if not exists cohorts_active_idx on cohorts (is_active);
