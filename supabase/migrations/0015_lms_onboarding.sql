-- Cohorts map to LMS cohorts by cohort_id (whatever the LMS calls its
-- cohort/course/group identifier). Nullable so admins can still create
-- CRM cohorts before the LMS side is set up.
alter table cohorts add column if not exists lms_cohort_id text;

-- Per-cohort template picks — chosen from the existing Templates and
-- WhatsApp templates modules. Nullable: if either is missing, that channel
-- is skipped on onboarding (the LMS enrollment still fires either way).
alter table cohorts add column if not exists lms_whatsapp_template_id uuid
  references whatsapp_templates(id) on delete set null;
alter table cohorts add column if not exists lms_email_template_id uuid
  references email_templates(id) on delete set null;

-- One row per (lead, cohort) marks whether that lead has been onboarded to
-- the LMS for that cohort. Sales clicks a button; this row tracks the state
-- so we can show "Onboarded 3d ago · Resend" instead of re-firing blindly.
create table if not exists lead_lms_onboardings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  cohort_id uuid not null references cohorts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  lms_user_id text,
  actor_id uuid references users(id) on delete set null,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, cohort_id)
);

create index if not exists lms_onboardings_lead_idx
  on lead_lms_onboardings (lead_id);
create index if not exists lms_onboardings_cohort_idx
  on lead_lms_onboardings (cohort_id);
