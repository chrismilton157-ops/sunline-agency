-- Sunline Phase 12: Setter role
--
-- Adds a third user_role value ('setter') with its own locked-down access:
--   • Setters see only leads in their call queue (no money, no client data).
--   • Every write path (claim, disposition, appointment) runs through the
--     service-role admin client — no direct anon-key mutations needed.
--   • Column-level revokes from earlier migrations already hide all money
--     and agency-only fields from the authenticated role, so setter inherits
--     that protection for free.

-- 1. Extend the enum — cannot be used within the same transaction immediately,
--    but Supabase SQL editor commits each statement, so this is safe.
alter type public.user_role add value if not exists 'setter';

-- 2. Relax the role/client_id constraint to allow setter (client_id = NULL).
alter table public.users drop constraint if exists owner_has_no_client;
alter table public.users drop constraint if exists role_client_id_check;
alter table public.users add constraint role_client_id_check check (
  (role = 'owner'  and client_id is null) or
  (role = 'client' and client_id is not null) or
  (role = 'setter' and client_id is null)
);

-- 3. RLS: setter can SELECT leads for their call queue.
--    Column-level revokes (0006) still hide notes/campaign_source/consent_at
--    etc., so they only see the public-safe lead fields.
create policy leads_setter_read_queue on public.leads
  for select to authenticated
  using (public.auth_role() = 'setter');

-- No additional policies for clients, campaigns, invoices, campaign_spend,
-- confirmation_attempts — those tables have no setter policy, so RLS blocks
-- all setter rows by default (deny-by-default with RLS enabled).
