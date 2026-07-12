-- URL-friendly slug so the public pay page URL reads like
-- /pay/idea-validation-workshop instead of /pay/<uuid>. Auto-generated
-- from internal_label on create; editable in the admin. Uniqueness
-- enforced via a unique index; the app appends -2, -3 etc. on collision.
-- Existing UUID URLs keep working — the public route accepts either.

alter table payment_pages add column if not exists slug text;

-- Backfill existing rows: slugify the internal_label + append a short UUID
-- suffix for safety so we don't fail the unique index on collisions.
-- Admins can rename in the UI later.
update payment_pages
set slug = lower(
  regexp_replace(
    regexp_replace(internal_label, '[^a-zA-Z0-9]+', '-', 'g'),
    '^-+|-+$', '', 'g'
  )
) || '-' || substring(id::text, 1, 4)
where slug is null;

create unique index if not exists payment_pages_slug_key on payment_pages (slug);
