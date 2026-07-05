# 18startup CRM

Dialer-first outbound sales CRM for 18startup.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS 4 with 18startup brand tokens
- Supabase (Postgres + Storage) — service-role admin client, RLS bypassed
- Session auth: JWT in httpOnly cookie via `jose`
- Passwords: `bcryptjs`

## Setup

1. `cp .env.local.example .env.local` and fill in Supabase creds + `SESSION_SECRET`.
2. Run migrations in `supabase/migrations/` (in order) against your Supabase project.
3. `npm install`
4. `npm run create-admin` — creates the first admin user (prompts for email + password).
5. `npm run dev`

## Feature scope (v1)

- Leads: CRUD, stages, filters, sorting, saved views, kanban, list
- Custom fields (text/number/date/dropdown/checkbox/phone/email) — stored as JSON
- Notes with author + timestamp
- Lead history (field changes) and communication timeline (email / WhatsApp / call)
- CSV import + export
- Email templates + automated sends (adapter interface)
- WhatsApp: outbound automation + 2-way inbox + broadcast (BSP-agnostic adapter)
- Telephony: click-to-call + screen-pop + auto-log + missed-call → lead
- Workflow rules: trigger → condition → action
- Admin: user management, role-based permissions, integrations config
- Web-to-lead public endpoint + Facebook/IndiaMART webhooks
- Browser push notifications

## Deferred to v1.1+

- Reports & dashboards
- Deals/opportunities as separate object
- Deduplication (currently: always creates new)
- Mobile app
