-- Sunline Phase 3: client portal
--
-- Two changes, both additive:
--   1) appointments.confirmed_at  — when we phone-confirmed the homeowner.
--      Used to compute the portal's "confirmation rate" stat
--      (% of appointments confirmed within 48h before the sit).
--   2) Column-level REVOKE on the agency-only columns.
--      RLS already hides AGENCY ROWS from clients on those tables, but the
--      client portal is allowed to read its own clients/campaigns rows,
--      and we must not leak ad_spend_monthly / ad_spend even on those.
--      So we strip read access at the column level for the `authenticated`
--      role entirely; the owner-side reads switch to the service-role
--      client (server-side only, never the browser).
--
-- This migration is safe to re-run on a fresh database; it errors if
-- re-applied to an already-migrated one (expected — migrations are
-- append-only per CLAUDE.md).

-- ---------- 1) confirmed_at ----------
alter table public.appointments
  add column confirmed_at timestamptz;

comment on column public.appointments.confirmed_at is
  'When Sunline phone-confirmed the homeowner. NULL = not confirmed.';

-- ---------- 2) hide agency-only money columns from the authenticated role ----------
-- Clients (and even owners on the cookie-auth client) cannot SELECT these.
-- Owner-side reads in the agency app use the service-role client server-side.
revoke select (ad_spend_monthly) on public.clients   from authenticated;
revoke select (ad_spend)          on public.campaigns from authenticated;
