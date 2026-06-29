-- Sunline Phase demo: add is_demo flag to clients.
--
-- Demo clients are isolated exactly like real clients (same RLS policies,
-- same column grants) — the flag exists only so owner-side aggregates and
-- alerts can exclude the demo account with WHERE is_demo = false.
--
-- No RLS or column-grant changes are needed: the demo client is just another
-- client row that happens to carry realistic dummy data for sales calls.

alter table public.clients
  add column if not exists is_demo boolean not null default false;

comment on column public.clients.is_demo is
  'True for demo clients (e.g. Demo Solar Co) used on sales calls. '
  'Exclude from real agency aggregates/alerts with WHERE is_demo = false.';
