-- Custom label for the "Continue" button shown after a successful payment
-- on the CRM-hosted thank-you screen. Falls back to "Continue →" if unset.
-- Lets admins tailor the call to action per page ("Join the WhatsApp
-- group", "Book your slot", "Download materials", etc.).

alter table payment_pages
  add column if not exists thank_you_button_label text;
