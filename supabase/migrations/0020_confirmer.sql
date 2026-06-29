-- Phase 20: Confirmer role + Appointment Management Cockpit
--
-- IMPORTANT: Run this migration in THREE separate SQL pastes in Supabase.
-- (Enum ADD VALUE cannot be used in the same transaction where the value is
-- first referenced — each paste is auto-committed by the Supabase SQL editor.)
--
-- PASTE A  →  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'confirmer';
-- PASTE B  →  ALTER TYPE appointment_outcome ADD VALUE IF NOT EXISTS 'cancelled';
-- PASTE C  →  (the rest of this file, from "-- == PASTE C ==" onwards)
--
-- Give the user the three pastes exactly as labelled.

-- == PASTE A ==
-- alter type public.user_role add value if not exists 'confirmer';

-- == PASTE B ==
-- alter type public.appointment_outcome add value if not exists 'cancelled';

-- == PASTE C (run after A and B have committed) ==

-- ---------- helper: is_confirmer() ----------

create or replace function public.is_confirmer()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'confirmer' from public.users where id = auth.uid()),
    false
  )
$$;

revoke all on function public.is_confirmer() from public;
grant execute on function public.is_confirmer() to authenticated;

-- ---------- enums ----------

create type public.appointment_event_type as enum (
  'confirmed',
  'attempt',
  'rescheduled',
  'cancelled',
  'inbound_call'
);

create type public.cancellation_reason as enum (
  'changed_mind',
  'went_with_another',
  'cant_afford',
  'circumstances_changed',
  'decision_makers_unavailable',
  'unresponsive',
  'other'
);

create type public.reschedule_source as enum (
  'inbound',
  'outbound'
);

-- ---------- appointment_events ----------

create table public.appointment_events (
  id                   uuid                            primary key default gen_random_uuid(),
  appointment_id       uuid                            not null references public.appointments(id) on delete cascade,
  event_type           public.appointment_event_type   not null,
  actor_id             uuid                            references auth.users(id) on delete set null,
  -- attempt
  attempt_method       text,
  -- reschedule
  old_appt_date        timestamptz,
  new_appt_date        timestamptz,
  reschedule_source    public.reschedule_source,
  -- cancellation
  cancellation_reason  public.cancellation_reason,
  cancellation_note    text,
  -- inbound call
  inbound_outcome      text,   -- 'rescheduled' | 'cancelled' | 'no_change'
  -- general
  notes                text,
  created_at           timestamptz                     not null default now()
);

create index appointment_events_appointment_idx on public.appointment_events(appointment_id);
create index appointment_events_actor_idx       on public.appointment_events(actor_id);
create index appointment_events_created_at_idx  on public.appointment_events(created_at desc);

comment on table public.appointment_events is
  'Structured log of all post-booking events: confirmations, attempts, reschedules, cancellations, inbound calls. Agency-only — clients and setters must never see any row.';

-- ---------- RLS on appointment_events ----------

alter table public.appointment_events enable row level security;

create policy "appt_events_owner_all" on public.appointment_events
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

create policy "appt_events_confirmer_select" on public.appointment_events
  for select to authenticated
  using (public.is_confirmer());

create policy "appt_events_confirmer_insert" on public.appointment_events
  for insert to authenticated
  with check (public.is_confirmer() and actor_id = auth.uid());

-- Belt-and-braces: strip table-level SELECT from authenticated — same pattern
-- as confirmation_attempts (0010) and call_dispositions (0009).
-- Service-role (admin) client bypasses this, so server actions still work.
revoke select on public.appointment_events from authenticated;

-- ---------- appointments: confirmer read/update ----------

create policy "appointments_confirmer_read" on public.appointments
  for select to authenticated
  using (public.is_confirmer());

create policy "appointments_confirmer_update" on public.appointments
  for update to authenticated
  using (public.is_confirmer())
  with check (public.is_confirmer());

-- ---------- leads: confirmer may read safe columns (for homeowner contact) ----------
-- Confirmers need name/phone/address to do their job. All agency-only columns
-- (notes, campaign_source, consent fields, queue fields) remain hidden via
-- the column-level SELECT grant set up in migration 0006.

create policy "leads_confirmer_read" on public.leads
  for select to authenticated
  using (public.is_confirmer());

-- ---------- audit_log: extend actor_role check to include 'confirmer' ----------

alter table public.audit_log
  drop constraint if exists audit_log_actor_role_check;

alter table public.audit_log
  add constraint audit_log_actor_role_check
  check (actor_role in ('owner', 'setter', 'client', 'system', 'public', 'confirmer'));

-- ---------- users table: extend the owner_has_no_client constraint ----------
-- Confirmers (like setters) have client_id IS NULL.

alter table public.users
  drop constraint if exists owner_has_no_client;

alter table public.users
  add constraint staff_has_no_client check (
    (role in ('owner', 'setter', 'confirmer') and client_id is null)
    or
    (role = 'client' and client_id is not null)
  );
