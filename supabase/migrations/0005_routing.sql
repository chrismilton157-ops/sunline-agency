-- Sunline Phase 4: routing engine schema
--
-- Three additions, all additive — no risk to existing RLS / portal:
--   1) clients.weekly_promise + clients.priority  (agency-only fields)
--   2) client_postcodes(client_id, postcode_prefix)  — many-to-many
--      (one client covers many prefixes; a prefix may be shared)
--   3) postcode_volume(postcode_prefix, typical_weekly_leads)
--      — reference data so the over-promise warning can compare
--        total promises across covering clients vs realistic supply
--
-- Both new tables are owner-only at the RLS level. The new columns on
-- clients are NOT added to the explicit-column SELECT grant set up in
-- 0004, so the `authenticated` role cannot read them at all — owner
-- reads them via the service-role client (same pattern as ad_spend).

-- ---------- 1) new columns on clients ----------
alter table public.clients
  add column weekly_promise integer not null default 0
    check (weekly_promise >= 0),
  add column priority integer not null default 100;

comment on column public.clients.weekly_promise is
  'Leads we have promised this client per week. Agency-only.';
comment on column public.clients.priority is
  'Lower = higher priority. Agency-only. Used as a future-phase tie-break;'
  ' Phase 4 routing currently uses promise-fill % + join date + last-lead time.';

-- ---------- 2) client_postcodes (many-to-many) ----------
create table public.client_postcodes (
  client_id        uuid not null references public.clients(id) on delete cascade,
  postcode_prefix  text not null,
  primary key (client_id, postcode_prefix)
);
create index client_postcodes_prefix_idx
  on public.client_postcodes(postcode_prefix);

alter table public.client_postcodes enable row level security;
create policy client_postcodes_owner_all on public.client_postcodes
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------- 3) postcode_volume (reference) ----------
create table public.postcode_volume (
  postcode_prefix       text primary key,
  typical_weekly_leads  integer not null check (typical_weekly_leads >= 0)
);

alter table public.postcode_volume enable row level security;
create policy postcode_volume_owner_all on public.postcode_volume
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
