-- 18startup CRM — tags on leads
-- Free-form labels stored as a text array. Nothing enforces a controlled list;
-- the import + form UIs auto-normalize whitespace / case.

alter table leads
  add column if not exists tags text[] not null default '{}';

create index if not exists leads_tags_gin on leads using gin (tags);
