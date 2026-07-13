-- Per-stage visibility toggle for members. Admin/manager always see every
-- stage; members only see stages with visible_to_members = true. Existing
-- stages default to visible so nothing hides on migration.

alter table lead_stages
  add column if not exists visible_to_members boolean not null default true;
