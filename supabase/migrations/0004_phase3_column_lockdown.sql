-- Sunline Phase 3 follow-up: actually hide agency-only columns.
--
-- 0003 used `revoke select (col) ... from authenticated`. In Postgres,
-- column-level revoke only cancels a *column-level* grant — it does NOT
-- subtract from a table-level SELECT. Supabase grants table-level SELECT
-- to the `authenticated` role on every public table by default, so 0003's
-- column-level revoke was a no-op and the verify-rls check caught it.
--
-- Correct approach: revoke table-level SELECT, then grant SELECT only on
-- an explicit list of safe columns. Anything not in the list (currently
-- `clients.ad_spend_monthly` and `campaigns.ad_spend`) is unreadable by
-- any signed-in user. The owner-side agency app reads those via the
-- service-role client server-side (service_role is unaffected by these
-- grants).

revoke select on public.clients   from authenticated;
revoke select on public.campaigns from authenticated;

grant select
  (id, company, contact, region, retainer, per_sit_fee,
   status, joined_at, created_at, updated_at)
  on public.clients to authenticated;

grant select
  (id, client_id, name, platform, created_at, updated_at)
  on public.campaigns to authenticated;
