-- Sunline Phase 5: lead capture + GDPR fields
--
-- Three additive changes:
--   1) leads.client_id becomes nullable so a lead with no postcode
--      coverage can still be stored (flagged for owner triage).
--   2) New capture / consent / routing metadata columns on leads.
--   3) Column-level lockdown: agency-only fields are unreadable by the
--      `authenticated` role (same belt-and-braces approach as Phases 3-4).
--      Owner reads these via the service-role client server-side.
--
-- Existing RLS policies on leads are kept as-is — owner sees all rows;
-- client sees rows where client_id = auth_client_id(). NULL = NULL is
-- NULL, so unassigned leads are invisible to clients automatically.

-- ---------- 1) allow unassigned leads ----------
alter table public.leads
  alter column client_id drop not null;

-- ---------- 2) new columns ----------
alter table public.leads
  add column postcode               text,
  add column notes                  text,
  add column campaign_source        text,
  add column consent_at             timestamptz,
  add column consent_source         text,
  add column routing_rule_fired     text,
  add column data_retention_until   timestamptz;

comment on column public.leads.postcode is
  'UK postcode used for routing. Stored separately from address for clean lookups.';
comment on column public.leads.consent_at is
  'When the homeowner ticked the consent box. NEVER send messages if NULL.';
comment on column public.leads.consent_source is
  'How consent was captured, e.g. ''public_form_v1''. Audit trail for ICO.';
comment on column public.leads.routing_rule_fired is
  'Which lib/routing.ts rule placed this lead: starvation / most_behind / newest_client / round_robin / no_candidates.';
comment on column public.leads.data_retention_until is
  'After this timestamp the lead is eligible for automatic deletion.';

-- Index for owner triage of unassigned leads.
create index leads_unassigned_idx
  on public.leads(created_at desc)
  where client_id is null;

-- Index to enforce: phone messaging code MUST filter by consent = true.
create index leads_consented_idx
  on public.leads(id)
  where consent = true and consent_at is not null;

-- ---------- 3) column-level lockdown on leads ----------
-- Strip table-level SELECT and re-grant only the columns clients should
-- ever see. The agency-only metadata (notes, campaign_source, consent_at,
-- consent_source, routing_rule_fired, data_retention_until) is therefore
-- physically unreadable by the `authenticated` role.
--
-- These fields are still readable from the owner-side agency app because
-- it pulls them via the service-role admin client (server-side only).

revoke select on public.leads from authenticated;
grant select
  (id, client_id, campaign_id, name, phone, email, address, postcode,
   monthly_bill, is_homeowner, bill_payer, roof_suitable, finance_interest,
   consent, status, response_mins, created_at, updated_at)
  on public.leads to authenticated;
