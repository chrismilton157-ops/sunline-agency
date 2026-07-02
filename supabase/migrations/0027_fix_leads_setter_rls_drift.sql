-- Sunline Phase 27: Fix leads RLS drift — setters must read ZERO leads directly
--
-- Bug (found by npm run verify:rls, check
--   "setter cannot read any leads rows (RLS: setter has no client_id)"):
-- the LIVE database carried an extra, permissive SELECT policy on public.leads
-- that let any authenticated SETTER read EVERY lead across EVERY tenant
-- (verified: a setter read all 10 leads, spanning BrightRoof / Northwind /
-- Demo Solar). That policy is NOT in this repo's migration history — it drifted
-- in via the dashboard. It breaks tenant isolation and exposes homeowner PII
-- (non-negotiables #1 and #2).
--
-- Setters never need direct table SELECT on leads: every legitimate setter path
-- (call queue, all-leads list, lead profile, claim/dial actions) runs through
-- the service-role admin client server-side — see app/(setter)/queue/* and
-- app/(setter)/all-leads/* — plus the SECURITY DEFINER RPCs serve_next_lead()
-- and list_workable_leads(). The service role bypasses RLS, so removing the
-- direct policy fails CLOSED without touching the queue.
--
-- This migration is idempotent and normalizes public.leads to EXACTLY the three
-- intended policies. Safe to paste as one query in the Supabase SQL editor.

-- 1) Drop any policy on public.leads that is not one of the three canonical
--    ones. This removes the drifted setter policy whatever it was named; the
--    NOTICE prints the culprit so it's visible in the SQL editor output.
do $$
declare pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'leads'
      and policyname not in (
        'leads_owner_all',
        'leads_client_read_own',
        'leads_confirmer_read'
      )
  loop
    execute format('drop policy %I on public.leads', pol.policyname);
    raise notice 'dropped drifted leads policy: %', pol.policyname;
  end loop;
end $$;

-- 2) Re-assert the three canonical policies (idempotent) so the end state is
--    deterministic even if one was edited in place. Definitions mirror
--    0002_rls.sql (owner + client) and 0020_confirmer.sql (confirmer).
drop policy if exists leads_owner_all on public.leads;
create policy leads_owner_all on public.leads
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

drop policy if exists leads_client_read_own on public.leads;
create policy leads_client_read_own on public.leads
  for select to authenticated
  using (client_id = public.auth_client_id());

drop policy if exists leads_confirmer_read on public.leads;
create policy leads_confirmer_read on public.leads
  for select to authenticated
  using (public.is_confirmer());

-- After this runs, a setter (role='setter', client_id IS NULL) matches none of
-- the three USING clauses, so `select ... from leads` returns zero rows — while
-- owner, client (own tenant), and confirmer access are unchanged.
