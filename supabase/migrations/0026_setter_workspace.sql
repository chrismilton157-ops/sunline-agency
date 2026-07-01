-- Sunline Phase 26: Setter Workspace
--   (A) personal "My Numbers" dashboard, (B) pause/resume time tracking,
--   (C) browsable master leads list + directly-reachable lead profile.
--
-- Builds ON the existing shared queue / leaderboard — no enum changes are
-- required (call_disposition_type already carries 'qualified_callback' from
-- migration 0025; appointment_outcome already carries 'cancelled' from 0020).
-- So this whole file is safe to paste as ONE query, in order, in the Supabase
-- SQL editor. There is NO commit-before-use enum step this time.

-- ---------- 1) Talk-time capture on call attempts ----------
-- Best-effort per-call duration in seconds, captured by the dialer client from
-- the moment "tap to dial" is pressed to when the outcome is saved. NULL for
-- historical rows and whenever the timer wasn't started (best-effort metric).
alter table public.call_dispositions
  add column if not exists talk_time_seconds integer;

comment on column public.call_dispositions.talk_time_seconds is
  'Best-effort talk-time in seconds for this attempt (dialer client timer). NULL = not captured.';

-- ---------- 2) Pause / resume (dialer) sessions ----------
-- One row per continuous active-or-paused stretch on the dialer. Duration is
-- derived (started_at → ended_at, or → last_heartbeat_at while still open).
-- Simple start/stop timestamps — see lib/setter-sessions.ts for the maths.
create table if not exists public.setter_sessions (
  id                uuid primary key default gen_random_uuid(),
  setter_id         uuid        not null references auth.users(id) on delete cascade,
  state             text        not null check (state in ('active', 'paused')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  last_heartbeat_at timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

comment on table public.setter_sessions is
  'Dialer active/paused stretches per setter. Powers "time on dialer vs paused". Agency-only.';

-- At most one open (ended_at IS NULL) session per setter.
create unique index if not exists setter_sessions_one_open_idx
  on public.setter_sessions (setter_id)
  where ended_at is null;

create index if not exists setter_sessions_setter_day_idx
  on public.setter_sessions (setter_id, started_at desc);

-- RLS: setters read only their OWN sessions; owner reads all. All writes go
-- through the service-role admin client (server actions), which bypasses RLS —
-- so no INSERT/UPDATE policy is granted to the authenticated role.
alter table public.setter_sessions enable row level security;

create policy setter_sessions_owner_all on public.setter_sessions
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy setter_sessions_read_own on public.setter_sessions
  for select to authenticated
  using (setter_id = auth.uid());

-- ---------- 3) Master leads list: pagination-safe RPC ----------
-- Returns ONE page of workable leads (never the whole table) plus a windowed
-- total_count so the UI can render pager controls. "Workable" = consented and
-- still in play (not booked / disqualified). Pipeline (P1/P2/P3) is computed
-- server-side via lead_pipeline() so callers can filter on it. Minimal columns
-- only — name · bill · captured date (+ pipeline/attempts for filtering/badge).
create or replace function public.list_workable_leads(
  p_search   text    default null,
  p_pipeline integer default null,
  p_limit    integer default 25,
  p_offset   integer default 0
)
returns table (
  id              uuid,
  name            text,
  monthly_bill    numeric,
  created_at      timestamptz,
  no_answer_count integer,
  pipeline        integer,
  total_count     bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      l.id, l.name, l.monthly_bill, l.created_at, l.no_answer_count,
      public.lead_pipeline(l.created_at, l.no_answer_count) as pipeline
    from public.leads l
    where l.consent = true
      and l.status in ('new', 'contacted', 'qualified')
      and (
        p_search is null or p_search = ''
        or l.name ilike '%' || p_search || '%'
      )
  ),
  filtered as (
    select * from base
    where p_pipeline is null or pipeline = p_pipeline
  )
  select
    f.id, f.name, f.monthly_bill, f.created_at, f.no_answer_count, f.pipeline,
    count(*) over () as total_count
  from filtered f
  order by f.created_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

-- Called only from the server-side admin (service-role) client.
revoke execute on function
  public.list_workable_leads(text, integer, integer, integer) from public;
grant execute on function
  public.list_workable_leads(text, integer, integer, integer) to service_role;

-- Partial index backing the common (no-search) list query + pagination order.
create index if not exists leads_workable_idx
  on public.leads (created_at desc)
  where consent = true and status in ('new', 'contacted', 'qualified');
