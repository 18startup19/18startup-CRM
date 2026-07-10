-- Catch-up migration for users who ran an earlier version of 0015 that did
-- not include the per-cohort template picks. Idempotent — safe to re-run.
alter table cohorts
  add column if not exists lms_whatsapp_template_id uuid
    references whatsapp_templates(id) on delete set null;
alter table cohorts
  add column if not exists lms_email_template_id uuid
    references email_templates(id) on delete set null;
