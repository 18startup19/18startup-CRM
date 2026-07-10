-- Expected total fee for a lead's cohort. Sales enters it with the first
-- payment; subsequent payments read it and compute pending = total - paid.
-- Nullable because leads not yet in a cohort don't have a fee, and the
-- CSV / API intakes don't know it either.
alter table leads add column if not exists total_fee numeric;
