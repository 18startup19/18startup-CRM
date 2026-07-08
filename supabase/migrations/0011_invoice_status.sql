-- Invoice status matches the Finance Tracker vocabulary
-- (draft | issued | paid | cancelled). Default 'issued' — the CRM assumes
-- the invoice is being sent when it's created.

alter table invoices
  add column if not exists status text not null default 'issued'
    check (status in ('draft', 'issued', 'paid', 'cancelled'));

-- invoice_number is now assigned by the Finance Tracker on successful sync.
-- Failed syncs still need a placeholder to keep the DB unique constraint
-- happy; allow that here by dropping the not-null and keeping unique.
alter table invoices alter column invoice_number drop not null;
