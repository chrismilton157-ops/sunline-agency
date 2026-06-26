-- 0011_agency_settings.sql
-- Owner-only table of agency-wide configurable defaults.
-- Enforced as a single row (id must equal 1). Seeded immediately with the
-- values that were previously hardcoded in lib/billing.ts, lib/qualifying.ts,
-- and lib/allocation.ts — so nothing changes on day one.

create table agency_settings (
  id                             int          primary key default 1,
  constraint singleton           check (id = 1),

  -- Billing defaults
  default_management_markup_pct  numeric(5,2)  not null default 20,
  default_per_sit_fee            numeric(10,2) not null default 75,

  -- Lead-qualifying thresholds
  min_monthly_bill_gbp           numeric(10,2) not null default 80,
  bill_band_80_120_rep           numeric(10,2) not null default 100,
  bill_band_120_200_rep          numeric(10,2) not null default 160,
  bill_band_200_plus_rep         numeric(10,2) not null default 250,

  -- Budget-calculator inputs
  est_cost_per_lead              numeric(10,2) not null default 40,
  lead_to_appt_rate              numeric(5,4)  not null default 0.3000,

  updated_at timestamptz not null default now()
);

-- Seed the single row with current code defaults.
insert into agency_settings (id) values (1);

-- Owner-only RLS: clients and anonymous users can never read or write.
alter table agency_settings enable row level security;

create policy "owner_all"
  on agency_settings
  for all
  to authenticated
  using  (is_owner())
  with check (is_owner());
