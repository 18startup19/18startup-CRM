-- Per-form field mapping for inbound leads. The Webflow webhook looks up
-- rows here to translate raw Webflow field names into CRM lead fields.
-- Storage-first because the mapping applies on every submission and needs
-- to be readable from a low-latency serverless function.
--
-- crm_target values:
--   'name'   → LeadRow.name
--   'email'  → LeadRow.email
--   'phone'  → LeadRow.phone
--   'custom.<key>' → LeadRow.custom[<key>] (must match an existing custom_fields.key)
--   'ignore' → drop the value
create table if not exists lead_field_mappings (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('webflow', 'razorpay')),
  form_key text not null,
  external_field text not null,
  crm_target text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, form_key, external_field)
);
create index if not exists lead_field_mappings_lookup_idx
  on lead_field_mappings (source, form_key);
