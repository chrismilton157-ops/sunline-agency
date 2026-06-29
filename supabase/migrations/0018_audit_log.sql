-- Phase 18: System-wide immutable audit log.
--
-- Append-only at the DB level via a BEFORE UPDATE/DELETE trigger that raises
-- an exception for every row — even the service role cannot modify or remove
-- entries once written. Reads are owner-only via RLS.

create table audit_log (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  actor_id    uuid,           -- null = system or public (unauthenticated) actor
  actor_role  text        not null
                check (actor_role in ('owner','setter','client','system','public')),
  action_type text        not null,  -- e.g. 'lead.created', 'invoice.issued'
  entity_type text        not null,  -- 'lead' | 'appointment' | 'client' | 'invoice' | 'settings' | ...
  entity_id   text,                  -- uuid as text; null for bulk / multi-entity ops
  description text        not null,  -- human-readable one-liner
  metadata    jsonb                  -- optional before/after or extra context
);

-- Prevent any modification or deletion of existing rows (append-only).
-- Triggers fire even for the service role, so this is truly immutable.
create or replace function audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only — rows cannot be modified or deleted';
end;
$$;

create trigger audit_log_no_update
  before update on audit_log
  for each row execute function audit_log_immutable();

create trigger audit_log_no_delete
  before delete on audit_log
  for each row execute function audit_log_immutable();

-- RLS: only owners may read audit entries; no row-level write policy is
-- needed because the service-role client (used in server actions) bypasses
-- RLS entirely, and no authenticated user is granted INSERT permission.
alter table audit_log enable row level security;

create policy "owner reads audit_log"
  on audit_log for select
  using (is_owner());

-- Performance indexes.
create index audit_log_created_at_idx  on audit_log (created_at desc);
create index audit_log_entity_idx      on audit_log (entity_type, entity_id);
create index audit_log_actor_idx       on audit_log (actor_id);
create index audit_log_action_type_idx on audit_log (action_type);
