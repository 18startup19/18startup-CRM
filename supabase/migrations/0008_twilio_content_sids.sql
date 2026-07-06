-- 18startup CRM — Twilio Content Templates + Meta approval tracking.
-- When admin creates an 'approved' WA template, the CRM POSTs to Twilio's
-- Content API which creates a Content resource (HX...) and submits it to
-- Meta for approval. We store the returned identifiers on the row so we
-- can refresh status and send messages via ContentSid later.

alter table whatsapp_templates
  add column if not exists provider_content_sid text,        -- Twilio Content SID (HX...)
  add column if not exists provider_approval_name text,      -- Approval submission name (usually same as template name)
  add column if not exists last_status_check_at timestamptz, -- Last time we polled Twilio for approval status
  add column if not exists submission_error text;            -- Last error message from Twilio, if any

create index if not exists whatsapp_templates_content_sid_idx
  on whatsapp_templates (provider_content_sid);
