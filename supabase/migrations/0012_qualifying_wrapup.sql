-- Sunline Phase 10: Guided Qualifying Wrap-Up
--
-- Adds structured qualifying fields to leads, captured during the setter's
-- post-call wrap-up wizard.  All new columns are agency-only: the column-level
-- SELECT grant on leads (migration 0006) lists explicit columns, so anything
-- added here is invisible to the authenticated role unless explicitly granted.
-- Clients therefore never see wrap-up data, and RLS isolation is unchanged.

-- ---------- 1) Enum types ----------

create type monthly_bill_band as enum (
  'band_0_50',
  'band_50_100',
  'band_100_150',
  'band_150_200',
  'band_200_plus'
);

create type income_status as enum (
  'employed_paye',
  'self_employed',
  'self_funded_retiree',
  'state_pension_only',
  'no_income'
);

create type solar_intention as enum (
  'replace',
  'add_on'
);

create type roof_type as enum (
  'pitched_tiles',
  'pitched_slate',
  'flat',
  'metal',
  'other',
  'not_suitable'
);

create type credit_status as enum (
  'good',
  'fair',
  'poor_declined',
  'cash_buyer',
  'not_eligible'
);

create type wrap_disqual_reason as enum (
  'not_homeowner',
  'income_ineligible',
  'decision_maker_unavailable',
  'roof_unsuitable',
  'credit_affordability'
);

-- ---------- 2) New columns on leads ----------

alter table public.leads
  add column if not exists already_has_solar             boolean,
  add column if not exists existing_system_size_kw       numeric(5,2),
  add column if not exists existing_system_age_years     integer,
  add column if not exists solar_intention               solar_intention,
  add column if not exists monthly_bill_band             monthly_bill_band,
  add column if not exists income_status                 income_status,
  add column if not exists all_decision_makers_present   boolean,
  add column if not exists co_owner_available            boolean,
  add column if not exists roof_type                     roof_type,
  add column if not exists credit_status                 credit_status,
  add column if not exists wrap_disqual_reason           wrap_disqual_reason,
  add column if not exists wrap_up_completed_at          timestamptz;

comment on column public.leads.already_has_solar is
  'Whether the homeowner already has solar panels installed.';
comment on column public.leads.existing_system_size_kw is
  'Size of existing solar system in kilowatts, if applicable.';
comment on column public.leads.existing_system_age_years is
  'Age of existing solar system in years, if applicable.';
comment on column public.leads.solar_intention is
  'For existing-solar owners: replace the system or add on more panels.';
comment on column public.leads.monthly_bill_band is
  'Monthly electricity bill band captured during wrap-up qualifying.';
comment on column public.leads.income_status is
  'Employment/income status used to assess finance eligibility.';
comment on column public.leads.all_decision_makers_present is
  'Whether all owners/decision-makers will be present at the appointment.';
comment on column public.leads.co_owner_available is
  'If not all DMs present: can the co-owner/DM attend? NULL if not applicable.';
comment on column public.leads.roof_type is
  'Basic roof type for suitability assessment.';
comment on column public.leads.credit_status is
  'Finance eligibility indicator captured during wrap-up.';
comment on column public.leads.wrap_disqual_reason is
  'Structured disqualification reason from the wrap-up wizard. NULL = not disqualified via wrap-up.';
comment on column public.leads.wrap_up_completed_at is
  'Timestamp when the setter completed the wrap-up wizard for this lead.';

-- No changes to the column-level SELECT grant on leads.
-- The authenticated role's grant from migration 0006 is unchanged;
-- these new columns remain invisible to authenticated by design.
