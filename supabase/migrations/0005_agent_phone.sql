-- 18startup CRM — agent phone number on users
-- Needed for click-to-call: the telephony provider (e.g. CallerDesk) calls the
-- agent's phone first, then bridges to the customer.

alter table users
  add column if not exists phone text;
