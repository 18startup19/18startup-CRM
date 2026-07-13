-- Events: CRM-hosted event landing pages + registrations + attendance.
-- Each event has a public landing page (pay.<domain>/e/<slug>) where
-- people register, and an organizer-only checkin page with a QR code
-- that attendees scan at the venue to mark themselves attended.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),

  -- Public URL slug and admin-facing label.
  slug text not null unique,
  internal_label text not null,

  -- Buyer-facing content.
  title text not null,
  description text,
  image_url text,

  -- When + where.
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Asia/Kolkata',
  location_text text,
  location_map_url text,

  -- Fine print.
  terms_and_conditions text,
  guidelines text,

  -- Capacity: null = unlimited, otherwise cap on registrations.
  capacity integer check (capacity is null or capacity > 0),

  -- Free = amount_paise = 0; paid = > 0. Currency for Razorpay routing.
  amount_paise integer not null default 0 check (amount_paise >= 0),
  currency text not null default 'INR',
  mode text not null default 'test' check (mode in ('test', 'live')),

  -- The QR code encodes /e/<slug>/checkin/<checkin_token>. Random-ish so
  -- the URL can't be guessed without seeing the QR at the venue. Regen
  -- via the admin if the QR ever leaks.
  checkin_token text not null,

  -- Extra questions on the registration form beyond name/phone/email.
  -- Array of {key, label, type: text|longtext|dropdown, options?, required}.
  extra_fields jsonb not null default '[]'::jsonb,

  -- Where the new lead lands on registration vs. after attendance.
  registered_stage_id uuid references lead_stages(id) on delete set null,
  attended_stage_id uuid references lead_stages(id) on delete set null,

  -- Pipeline / owner / tags applied to every lead this event creates.
  pipeline_id uuid references pipelines(id) on delete set null,
  owner_id uuid references users(id) on delete set null,
  tags text[] not null default '{}',

  -- Draft while admin sets it up, published = public URL live.
  is_published boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_published_idx on events (is_published);
create index if not exists events_starts_at_idx on events (starts_at);

-- One row per person who registered. Links the event → lead created for them.
-- attended_at = null means "registered but hasn't shown up yet".
create table if not exists event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,

  registered_at timestamptz not null default now(),
  attended_at timestamptz,
  -- self_scan = they scanned the venue QR themselves; organizer_marked =
  -- admin manually checked them in from the checkin page; walkin = new
  -- person who registered via the QR (no prior registration).
  checkin_source text check (checkin_source in ('self_scan', 'organizer_marked', 'walkin')),

  -- Answers to the event's extra_fields questions. Keys mirror extra_fields[].key.
  custom_answers jsonb not null default '{}'::jsonb,

  -- Razorpay identifiers for paid events. Null for free events.
  razorpay_order_id text,
  razorpay_payment_id text,
  amount_paise integer,
  paid_at timestamptz
);

create index if not exists event_registrations_event_idx on event_registrations (event_id);
create index if not exists event_registrations_lead_idx on event_registrations (lead_id);
create index if not exists event_registrations_attended_idx on event_registrations (event_id, attended_at);
