-- Zoom integration for events. Admin pastes a Zoom Meeting ID on the
-- event; on registration we call Zoom's API to add the registrant and
-- store the personal join URL + Zoom's registrant_id (used for post-
-- meeting attendance matching regardless of what email the attendee
-- actually signed into Zoom with).

alter table events
  add column if not exists zoom_meeting_id text;

alter table event_registrations
  add column if not exists zoom_registrant_id text,
  add column if not exists zoom_join_url text,
  add column if not exists zoom_registration_error text;

-- Look up a registration by its Zoom registrant_id during the post-meeting
-- attendance sync.
create index if not exists event_registrations_zoom_registrant_idx
  on event_registrations (zoom_registrant_id);
