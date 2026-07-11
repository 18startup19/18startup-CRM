-- Admin UI preference: forms admins have chosen to hide from the Lead
-- Routing page. Purely presentational — the webhook keeps processing
-- submissions from hidden forms as normal; they just don't clutter the
-- default admin view. Restorable via the "Show hidden forms" toggle.
create table if not exists hidden_admin_forms (
  source text not null check (source in ('webflow', 'razorpay')),
  form_key text not null,
  hidden_at timestamptz not null default now(),
  hidden_by uuid references users(id) on delete set null,
  primary key (source, form_key)
);
