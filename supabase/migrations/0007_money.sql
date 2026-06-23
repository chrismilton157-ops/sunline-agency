-- Sunline Phase 6: money — invoicing + ad-spend → revenue attribution.
--
-- Additive only. Reconciles with the column-level lockdown set up in
-- 0003 / 0004 / 0006: agency-only money fields stay invisible to the
-- `authenticated` role and are read by the owner side via the
-- service-role client.

-- ---------- 1) clients ----------
-- Per-client managed-ads markup. Default 20%, capped at 100%. Stored
-- on the client so different clients can have different rates.
-- NOT added to the safe-column SELECT grant set up in 0004 — so even
-- the cookie-auth owner client can't read it; the agency app reads it
-- via the service-role admin client like ad_spend_monthly.
alter table public.clients
  add column management_markup_pct numeric(5,2) not null default 20.00
    check (management_markup_pct >= 0 and management_markup_pct <= 100);

comment on column public.clients.management_markup_pct is
  'Markup % applied to ad spend for the bundled "Advertising management" '
  'line on the invoice. Agency-only — never shown to clients.';

-- ---------- 2) invoices ----------
-- Status enum: draft (just generated, owner reviews), issued (sent to
-- client), paid (settled). Old paid boolean is kept in sync.
alter table public.invoices
  add column status text not null default 'draft'
    check (status in ('draft', 'issued', 'paid')),
  add column advertising_management numeric(10,2) not null default 0,
  add column appointment_count integer not null default 0,
  add column appointment_fees numeric(10,2) not null default 0,
  add column total numeric(10,2) not null default 0,
  add column issued_at timestamptz,
  add column paid_at timestamptz,
  -- Snapshot fields preserve at-time-of-generation values so historical
  -- invoices remain stable when the current per_sit_fee / markup change.
  add column per_sit_fee_snapshot numeric(10,2) not null default 0,
  -- Agency-only — DO NOT add to the column SELECT grant below.
  add column ad_spend_raw numeric(10,2) not null default 0,
  add column management_markup_pct_snapshot numeric(5,2) not null default 0;

comment on column public.invoices.advertising_management is
  'Combined client-visible figure: ad spend + management markup. '
  'The only ads-related number a client may see.';
comment on column public.invoices.ad_spend_raw is
  'Raw ad spend for the period. Agency-only — never shown to clients.';
comment on column public.invoices.management_markup_pct_snapshot is
  'Markup % at time of generation. Agency-only — never shown to clients.';

create index invoices_status_idx on public.invoices(status);

-- ---------- 3) column-level lockdown on invoices ----------
-- Same pattern as 0004 (clients) and 0006 (leads). The two agency-only
-- columns above (ad_spend_raw, management_markup_pct_snapshot) are
-- NOT in the explicit grant, so the authenticated role cannot SELECT
-- them. Clients see only the bundled advertising_management line.
revoke select on public.invoices from authenticated;
grant select
  (id, client_id, period, advertising_management, appointment_count,
   appointment_fees, total, status, issued_at, paid_at,
   amount, paid, per_sit_fee_snapshot, created_at, updated_at)
  on public.invoices to authenticated;
