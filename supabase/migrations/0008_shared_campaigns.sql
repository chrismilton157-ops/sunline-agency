-- Sunline Phase 7: shared (regional) campaigns + cost allocation.
--
-- Why: we run ONE ad campaign per shared region (e.g. Bristol) so our own
-- ads do not bid against each other. That single campaign's monthly spend
-- must then be split across the clients who actually received leads from
-- it, in proportion to the leads each received. The allocated share is
-- then bundled into the existing "Advertising management" invoice line.
--
-- Additive only. Existing RLS stays intact:
--   * authenticated role's column-level SELECT grants are unchanged
--   * new table is OWNER-ONLY at every layer
--   * campaigns.client_id becomes nullable so a campaign can be REGIONAL
--     (shared); existing per-client campaigns are unaffected. The
--     `campaigns_client_read_own` policy uses `client_id = auth_client_id()`
--     which never matches NULL — so shared-region campaigns stay invisible
--     to client logins (good — only the agency sees the regional picture).

-- ---------- 1) regional campaigns ----------
-- A regional campaign has client_id IS NULL and serves multiple clients
-- via the leads it generates (each lead is still routed to ONE client via
-- the Phase 4 routing engine — see lib/routing.ts).
alter table public.campaigns
  alter column client_id drop not null;

comment on column public.campaigns.client_id is
  'NULL = REGIONAL campaign shared across all clients whose covered_postcodes '
  'overlap with the campaign''s region. Cost is allocated to each client by '
  'their share of routed leads in the period (see lib/allocation.ts).';

-- ---------- 2) campaign_spend (agency-only) ----------
-- Owner records the real per-campaign monthly ad spend they read from Meta.
-- One row per (campaign, period). Unique so re-entry overwrites cleanly.
create table public.campaign_spend (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid          not null references public.campaigns(id) on delete cascade,
  period       text          not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  amount       numeric(10,2) not null default 0 check (amount >= 0),
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  unique (campaign_id, period)
);
create index campaign_spend_period_idx on public.campaign_spend(period);
create trigger trg_campaign_spend_updated
  before update on public.campaign_spend
  for each row execute function public.set_updated_at();

comment on table public.campaign_spend is
  'Real per-month ad spend per campaign. Agency-only — never shown to clients. '
  'Allocated across receiving clients by their lead share, then rolled into '
  'each client''s combined "Advertising management" invoice line.';

-- ---------- 3) lockdown ----------
-- Owner-only RLS. We do NOT grant SELECT to the authenticated role at the
-- column level either — this entire table is invisible to clients.
alter table public.campaign_spend enable row level security;
create policy campaign_spend_owner_all on public.campaign_spend
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Belt-and-braces: strip the default table-level SELECT Supabase grants.
revoke select on public.campaign_spend from authenticated;
