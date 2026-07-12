-- Payment Pages: CRM-owned records of hosted Razorpay payment pages the admin
-- creates and embeds on the website. Each row corresponds to exactly one
-- Razorpay Payment Page; the CRM is the source of truth for title/amount/etc,
-- and calls Razorpay's API to keep the hosted page in sync.

create table if not exists payment_pages (
  id uuid primary key default gen_random_uuid(),

  -- How the admin finds this page in the CRM (never shown to buyer).
  internal_label text not null,

  -- What the buyer sees on Razorpay's hosted page.
  title text not null,
  description text,
  image_url text,

  -- Amount is stored in paise (integer) so we never fight floating-point
  -- rounding at cash-money precision. UI shows/edits in rupees.
  amount_paise integer not null check (amount_paise > 0),
  currency text not null default 'INR',

  -- Test vs live mode. Test uses RAZORPAY_TEST_KEY_ID/SECRET, live uses the
  -- existing RAZORPAY_KEY_ID/SECRET. Per-page so admins can keep test pages
  -- around forever without touching live ones.
  mode text not null default 'test' check (mode in ('test', 'live')),

  -- When set, payments applied to this page count toward the cohort's
  -- total_fee, and full-payment triggers LMS onboarding automatically.
  -- Leave null for small workshops (idea-validation type events).
  cohort_id uuid references cohorts(id) on delete set null,

  -- Where the auto-created lead lands.
  pipeline_id uuid references pipelines(id) on delete set null,
  stage_id uuid references lead_stages(id) on delete set null,
  owner_id uuid references users(id) on delete set null,
  tags text[] not null default '{}',

  -- Filled in after the first successful call to Razorpay's create-page API.
  razorpay_page_id text,
  razorpay_short_url text,

  -- Off = new payments blocked at the Razorpay hosted page; existing rows
  -- stay for audit.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_pages_active_idx on payment_pages (is_active);
create index if not exists payment_pages_razorpay_page_id_idx on payment_pages (razorpay_page_id);
create index if not exists payment_pages_cohort_idx on payment_pages (cohort_id);
