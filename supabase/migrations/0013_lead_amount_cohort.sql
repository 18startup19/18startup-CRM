-- Free-form cohort/batch label on each recorded payment. Used by the
-- converted-leads payment log to group who belongs to which cohort.

alter table lead_amounts add column if not exists cohort_number text;
