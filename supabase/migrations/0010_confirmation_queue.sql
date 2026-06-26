-- Sunline Phase 9: Confirmation Queue
--
-- Adds a confirmation_attempts table to track outreach attempts before a
-- homeowner confirms an upcoming appointment. Agency-only at every layer:
-- owner-all RLS + table-level SELECT revoked from authenticated (same
-- pattern as call_dispositions / 0009 and campaign_spend / 0008).

create table public.confirmation_attempts (
  id              uuid        primary key default gen_random_uuid(),
  appointment_id  uuid        not null references public.appointments(id) on delete cascade,
  method          text        not null,   -- e.g. 'called – no answer', 'left voicemail', 'texted'
  notes           text,
  attempted_by    uuid        not null references auth.users(id),
  created_at      timestamptz not null default now()
);

create index confirmation_attempts_appointment_idx on public.confirmation_attempts(appointment_id);
create index confirmation_attempts_attempted_by_idx on public.confirmation_attempts(attempted_by);

comment on table public.confirmation_attempts is
  'Per-attempt history for pre-appointment confirmation calls/texts. Agency-only — clients must never see any row.';

comment on column public.confirmation_attempts.method is
  'Free-text or preset label: "called – no answer", "left voicemail", "texted", "spoke – confirmed", etc.';

-- ---------- RLS: agency-only ----------

alter table public.confirmation_attempts enable row level security;

create policy confirmation_attempts_owner_all on public.confirmation_attempts
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Belt-and-braces: strip table-level SELECT from authenticated role.
-- Admin client (service role) bypasses RLS, so server actions still work.
revoke select on public.confirmation_attempts from authenticated;
