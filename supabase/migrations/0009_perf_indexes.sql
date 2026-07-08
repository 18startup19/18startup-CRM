-- Performance indexes for hot query paths.

-- Kanban default sort
create index if not exists leads_updated_idx on leads (updated_at desc);

-- Communications: channel-scoped queries dominate (WhatsApp inbox, dashboards).
create index if not exists communications_channel_created_idx
  on communications (channel, created_at desc);

-- Active call lookup: actor_id + channel + status filter.
create index if not exists communications_actor_channel_status_idx
  on communications (actor_id, channel, status, created_at desc)
  where actor_id is not null;

-- Inbound WhatsApp unread badge: channel + direction + status.
create index if not exists communications_channel_direction_status_idx
  on communications (channel, direction, status);

-- Amount-in-range queries used by dashboards / converted leads.
create index if not exists lead_amounts_created_idx on lead_amounts (created_at desc);

-- Notifications: unread lookup by kind (assignment popup dedupes on kind).
create index if not exists notifications_user_kind_idx
  on notifications (user_id, kind, created_at desc);
