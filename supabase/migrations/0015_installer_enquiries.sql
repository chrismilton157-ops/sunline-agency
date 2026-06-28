-- Phase 15: installer_enquiries — captures "book a call" submissions from the
-- public marketing landing page. Owner-only; never visible to clients or setters.

create table installer_enquiries (
  id                  uuid        primary key default gen_random_uuid(),
  name                text        not null,
  company             text        not null,
  email               text        not null,
  phone               text        not null,
  region              text        not null,
  current_lead_spend  text,
  created_at          timestamptz not null default now()
);

alter table installer_enquiries enable row level security;

-- Owner sees and manages all enquiries.
create policy "enquiries_owner_all"
  on installer_enquiries
  for all
  to authenticated
  using  (public.is_owner())
  with check (public.is_owner());

-- No authenticated SELECT grant needed — owner uses service-role in the app.
-- Anon role has no policies, so unauthenticated direct DB access is blocked.
-- Inserts come exclusively from the server-side action (service-role key).
revoke select on installer_enquiries from authenticated;
