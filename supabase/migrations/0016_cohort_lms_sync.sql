-- Enforce one CRM cohort row per LMS UUID so the LMS→CRM sync webhook
-- can safely upsert with onConflict: 'lms_cohort_id'.
-- Postgres treats NULLs as distinct in unique constraints, so multiple
-- CRM cohorts without an LMS mapping are still allowed.
alter table cohorts
  add constraint cohorts_lms_cohort_id_key unique (lms_cohort_id);
