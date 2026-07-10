-- Single-row settings table for LMS onboarding. Templates are the same
-- across every cohort (per business decision), so we lift them off the
-- per-cohort row and store one global pair here.
create table if not exists lms_settings (
  id smallint primary key default 1 check (id = 1),
  whatsapp_template_id uuid references whatsapp_templates(id) on delete set null,
  email_template_id uuid references email_templates(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into lms_settings (id) values (1) on conflict do nothing;
