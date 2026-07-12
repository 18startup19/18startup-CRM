-- Extra fields on payment_pages:
-- * program_name: shown to the buyer as a small label above the title, so
--   admins can group pages by which program they belong to (Founders,
--   Growth, etc.). Distinct from `title` which is the specific offering.
-- * thank_you_url: after a successful payment, the buyer sees a "Continue"
--   button that opens this URL in a new tab. Lets admins hand off to
--   whatever comes next — calendar booking, WhatsApp group invite, etc.

alter table payment_pages
  add column if not exists program_name text,
  add column if not exists thank_you_url text;
