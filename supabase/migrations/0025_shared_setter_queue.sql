-- Sunline Phase 25: Shared Auto-Served Setter Queue with Three Pipelines
--
-- IMPORTANT: Run QUERY 1 (enum addition) first in its own transaction, commit
-- before running QUERY 2. Postgres requires enum values be committed before
-- they can be referenced in the same session.
--
-- QUERY 1 ─ run alone first:
--   alter type call_disposition_type add value if not exists 'qualified_callback';
--
-- QUERY 2 ─ run after QUERY 1 is committed (everything below this line):

-- ---------- 1) Cadence tracking columns on leads ----------
-- These columns fall outside the column-level SELECT grant from migration 0006,
-- so they are automatically invisible to the authenticated role (clients/confirmers).

alter table public.leads
  add column if not exists last_attempt_at     timestamptz,
  add column if not exists next_available_at   timestamptz,
  add column if not exists daily_attempts      integer not null default 0,
  add column if not exists daily_attempts_date date,
  add column if not exists callback_at         timestamptz,
  add column if not exists callback_setter_id  uuid references auth.users(id) on delete set null;

comment on column public.leads.last_attempt_at is
  'Timestamp of the most recent dial attempt. NULL = never dialled.';
comment on column public.leads.next_available_at is
  'When this lead next enters the shared pool. NULL = available now.';
comment on column public.leads.daily_attempts is
  'No-answer dials today (UK calendar). Resets each day. Cap = 4.';
comment on column public.leads.daily_attempts_date is
  'UK calendar date (YYYY-MM-DD) that daily_attempts counts for.';
comment on column public.leads.callback_at is
  'Scheduled time for a qualified callback. NULL if not a callback lead.';
comment on column public.leads.callback_setter_id is
  'Setter who owns a qualified callback. NULL = shared pool.
   Enforced by serve_next_lead: only callback_setter_id receives this lead.';

-- ---------- 2) Pipeline preference on users ----------
alter table public.users
  add column if not exists queue_pipeline_pref integer;

comment on column public.users.queue_pipeline_pref is
  'Preferred pipeline (1/2/3) for this setter. Owner can direct. NULL = auto (P1→P2→P3).';

-- ---------- 3) Pipeline helper function ----------
create or replace function public.lead_pipeline(
  p_created_at     timestamptz,
  p_no_answer_count integer
)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when extract(epoch from (now() - p_created_at)) / 86400 >= 30 then 3
    when extract(epoch from (now() - p_created_at)) / 86400 >= 7
      or p_no_answer_count >= 10 then 2
    else 1
  end;
$$;

grant execute on function public.lead_pipeline(timestamptz, integer)
  to authenticated, service_role;

-- ---------- 4) Atomic serve_next_lead function ----------
-- Called exclusively from server-side admin client (service_role).
-- SECURITY DEFINER so it can bypass RLS when claiming the lead.
-- p_pipeline NULL  = auto: P1 → P2 → P3 (auto-drop built in via ORDER BY)
-- p_pipeline 1/2/3 = filter to that pipeline; returns NULL if none available

create or replace function public.serve_next_lead(
  p_setter_id uuid,
  p_pipeline  integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_today   date;
begin
  v_today := (now() at time zone 'Europe/London')::date;

  -- Auto-release stale claims (> 30 min) before serving
  update public.leads
  set queue_claimed_by = null,
      queue_claimed_at = null
  where queue_claimed_by is not null
    and queue_claimed_at < now() - interval '30 minutes';

  -- Atomically find and claim the best eligible lead
  with candidate as (
    select id
    from public.leads
    where
      -- Consent gate (non-negotiable per CLAUDE.md)
      consent = true
      -- Only callable statuses
      and status not in ('booked', 'disqualified')
      -- Not locked to someone else (allow own re-claim or stale)
      and (
        queue_claimed_by is null
        or queue_claimed_by = p_setter_id
        or queue_claimed_at < now() - interval '30 minutes'
      )
      -- Cadence gate: not waiting its resurface window
      and (next_available_at is null or next_available_at <= now())
      -- Daily no-answer cap: fewer than 4 today
      and (
        daily_attempts_date is null
        or daily_attempts_date < v_today
        or daily_attempts < 4
      )
      -- Qualified callback gate: only serve to the designated setter when due
      and (
        callback_setter_id is null
        or (
          callback_setter_id = p_setter_id
          and (callback_at is null or callback_at <= now())
        )
      )
      -- Pipeline filter: null = any pipeline (auto-drop via ORDER BY)
      and (
        p_pipeline is null
        or lead_pipeline(created_at, no_answer_count) = p_pipeline
      )
    order by
      -- 1. Personal due callbacks always surface first for this setter
      case
        when callback_setter_id = p_setter_id
         and (callback_at is null or callback_at <= now())
        then 0 else 1
      end,
      -- 2. Pipeline priority: P1 (1) beats P2 beats P3 — auto-drop built in
      lead_pipeline(created_at, no_answer_count) asc,
      -- 3. Within pipeline: newest lead first (speed-to-lead for P1)
      created_at desc
    limit 1
    for update skip locked
  )
  update public.leads l
  set queue_claimed_by = p_setter_id,
      queue_claimed_at = now()
  from candidate
  where l.id = candidate.id
  returning l.id into v_lead_id;

  return v_lead_id;
end;
$$;

-- Only service_role (admin client) may call this function
revoke execute on function public.serve_next_lead(uuid, integer) from public;
grant  execute on function public.serve_next_lead(uuid, integer) to service_role;

-- ---------- 5) Performance index for queue serving ----------
create index if not exists leads_queue_cadence_idx
  on public.leads (consent, status, next_available_at, created_at desc)
  where consent = true and status not in ('booked', 'disqualified');

create index if not exists leads_callback_setter_idx
  on public.leads (callback_setter_id, callback_at)
  where callback_setter_id is not null;
