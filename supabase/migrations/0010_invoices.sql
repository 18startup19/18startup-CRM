-- Invoices: created inside the CRM, mirrored to the Finance Tracker via the
-- FINANCE_TRACKER_API_URL webhook. Kept intentionally simple — no line items,
-- no tax rows, no accounting posting. Just enough to hand off to Finance.

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  customer_name text not null,
  company_name text not null,
  company_address text not null,
  gst_number text not null,
  pan_number text,
  product_name text not null,
  total_amount numeric(14, 2) not null,
  invoice_date date not null,
  created_by uuid references users(id) on delete set null,
  finance_tracker_id text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'failed')),
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_created_idx on invoices (created_at desc);
create index if not exists invoices_created_by_idx on invoices (created_by);
create index if not exists invoices_sync_status_idx on invoices (sync_status)
  where sync_status <> 'synced';

-- Auto-generate INV-YYYY-#### style numbers using a per-year sequence.
create sequence if not exists invoice_number_seq;

create or replace function next_invoice_number()
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  n := nextval('invoice_number_seq');
  return 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
end;
$$;
