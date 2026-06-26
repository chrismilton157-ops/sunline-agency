-- Sunline Phase 8: Setter Calling Queue
--
-- Two additive changes:
--   1) Queue-tracking columns on public.leads — fall outside the column-level
--      SELECT grant from migration 0006, so invisible to the authenticated role.
--   2) call_dispositions table — agency-only at every layer: owner-all RLS +
--      table-level SELECT revoked from authenticated (mirrors campaign_spend / 0008).

-- ---------- 1) queue columns on leads ----------
alter table public.leads
  add column if not exists no_answer_count  integer     not null default 0,
  add column if not exists queue_claimed_by uuid        references auth.users(id) on delete set null,
  add column if not exists queue_claimed_at timestamptz;

comment on column public.leads.no_answer_count is
  'Running count of "no_answer" call attempts. Capped display at 10 in the UI.';
comment on column public.leads.queue_claimed_by is
  'Auth user id of the setter currently working this lead. NULL = available.';
comment on column public.leads.queue_claimed_at is
  'When the setter claimed. Claims older than 30 min are treated as stale/released.';

-- ---------- 2) call_disposition enum ----------
create type call_disposition_type as enum (
  'no_answer',
  'callback',
  'not_interested',
  'wrong_number',
  'disqualified',
  'booked'
);

-- ---------- 3) call_dispositions table ----------
create table public.call_dispositions (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid                   not null references public.leads(id) on delete cascade,
  disposition     call_disposition_type  not null,
  callback_at     timestamptz,
  disqual_reason  text,
  notes           text,
  created_by      uuid                   not null references auth.users(id),
  created_at      timestamptz            not null default now()
);

create index call_dispositions_lead_id_idx   on public.call_dispositions(lead_id);
create index call_dispositions_created_by_idx on public.call_dispositions(created_by);

comment on table public.call_dispositions is
  'Per-call-attempt history. Agency-only — clients must never see any row.';

-- ---------- 4) RLS: agency-only ----------
alter table public.call_dispositions enable row level security;

create policy call_dispositions_owner_all on public.call_dispositions
  for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- Belt-and-braces: strip table-level SELECT from authenticated role
-- (mirrors campaign_spend in migration 0008).
revoke select on public.call_dispositions from authenticated;
