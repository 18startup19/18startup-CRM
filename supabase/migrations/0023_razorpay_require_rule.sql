-- Allowlist mode for Razorpay payments. When on, any payment whose
-- description doesn't match an active routing rule gets silently ignored
-- by the webhook (200 back so Razorpay doesn't retry, but no lead is
-- created). Off by default so nothing changes for existing setups.
alter table intake_settings
  add column if not exists razorpay_require_rule boolean not null default false;
