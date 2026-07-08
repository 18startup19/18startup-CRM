-- Store the Finance Tracker's fully-qualified PDF URL as it comes back on
-- the create response. Avoids reconstructing paths on our side — FT owns
-- the endpoint format.

alter table invoices add column if not exists pdf_url text;
