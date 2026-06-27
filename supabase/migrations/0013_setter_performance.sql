-- Sunline Phase 11: Setter Performance Tracking
--
-- Additive changes only:
--   1) appointments.setter_id — UUID FK linking each booked appointment to
--      the setter (auth.users row) who created it.  NULL for legacy rows
--      seeded before Phase 11.  Not added to any authenticated-role column
--      grant — setters see 0 appointment rows via RLS anyway (no matching
--      policy for role='setter'), so this column is automatically hidden.
--   2) Index on setter_id for the performance queries used server-side.
--
-- No new tables, no new RLS policies, no column grants needed.
-- Stats are computed server-side via the service-role admin client and
-- served to the appropriate audience (setter vs owner) at the Next.js layer.

alter table public.appointments
  add column if not exists setter_id uuid references auth.users(id) on delete set null;

comment on column public.appointments.setter_id is
  'UUID of the setter (auth.users) who booked this appointment via the calling queue.
   NULL for appointments created before Phase 11 or entered manually.
   Agency-only — not in any authenticated-role column grant.';

create index if not exists appointments_setter_id_idx
  on public.appointments(setter_id)
  where setter_id is not null;
