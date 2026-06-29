-- GDPR data-subject requests and complaints log.
-- Submissions arrive via a public form; inserts use the service-role key
-- (server action) so no anon INSERT policy is needed.
-- Only the owner can read or update rows — RLS gates all access.

create table public.data_requests (
  id               uuid        primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  requester_name   text        not null,
  requester_email  text,
  requester_phone  text,
  request_type     text        not null
    check (request_type in ('access', 'erasure', 'other', 'complaint')),
  message          text,
  status           text        not null default 'new'
    check (status in ('new', 'in_progress', 'completed')),
  owner_notes      text
);

alter table public.data_requests enable row level security;

-- Owner reads and manages all requests.
-- Clients, setters, and anonymous users receive 0 rows (no matching policy).
create policy data_requests_owner_all on public.data_requests
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());
