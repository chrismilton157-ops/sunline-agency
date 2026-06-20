-- Sunline Phase 1: Row Level Security
-- Owner sees everything; client sees only rows where client_id matches their own.
-- Enforced at the database level, not just the UI.

-- ---------- helpers ----------
-- security definer so they bypass RLS when reading public.users (no recursion).
create or replace function public.auth_role()
returns user_role
language sql stable security definer set search_path = public
as $$ select role from public.users where id = auth.uid() $$;

create or replace function public.auth_client_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select client_id from public.users where id = auth.uid() $$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'owner' from public.users where id = auth.uid()), false) $$;

revoke all on function public.auth_role(), public.auth_client_id(), public.is_owner() from public;
grant execute on function public.auth_role(), public.auth_client_id(), public.is_owner() to authenticated;

-- ---------- enable RLS ----------
alter table public.clients      enable row level security;
alter table public.campaigns    enable row level security;
alter table public.leads        enable row level security;
alter table public.appointments enable row level security;
alter table public.invoices     enable row level security;
alter table public.users        enable row level security;

-- ---------- clients ----------
create policy clients_owner_all on public.clients
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- A client may read their OWN clients row, but only via a view in the app
-- layer that strips ad_spend / ad_spend_monthly. The portal must never query
-- those columns. Keeping the row readable here so the app can show company etc.
create policy clients_client_read_own on public.clients
  for select to authenticated
  using (id = public.auth_client_id());

-- ---------- campaigns ----------
create policy campaigns_owner_all on public.campaigns
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Clients never see campaign ad_spend; portal must select only safe columns.
create policy campaigns_client_read_own on public.campaigns
  for select to authenticated
  using (client_id = public.auth_client_id());

-- ---------- leads ----------
create policy leads_owner_all on public.leads
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy leads_client_read_own on public.leads
  for select to authenticated
  using (client_id = public.auth_client_id());

-- ---------- appointments ----------
create policy appointments_owner_all on public.appointments
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy appointments_client_read_own on public.appointments
  for select to authenticated
  using (client_id = public.auth_client_id());

-- Clients mark outcome + quality on their OWN appointments (one-tap actions
-- in the portal). They cannot move a row to another client_id.
create policy appointments_client_update_own on public.appointments
  for update to authenticated
  using (client_id = public.auth_client_id())
  with check (client_id = public.auth_client_id());

-- ---------- invoices ----------
create policy invoices_owner_all on public.invoices
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy invoices_client_read_own on public.invoices
  for select to authenticated
  using (client_id = public.auth_client_id());

-- ---------- users ----------
create policy users_owner_all on public.users
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- A user may read their OWN row (to bootstrap role/client_id in the app).
create policy users_read_self on public.users
  for select to authenticated
  using (id = auth.uid());
