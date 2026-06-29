-- 0021_adaptive_routing.sql
-- Adds adaptive routing control flags to the existing agency_settings singleton.
-- Shadow mode is ON by default (adaptive_routing_enabled = false means shadow only).
-- The adaptive layer is purely additive; the live routing engine is unchanged.

alter table agency_settings
  add column if not exists adaptive_routing_enabled boolean not null default false,
  add column if not exists adaptive_min_sample      int     not null default 20;

comment on column agency_settings.adaptive_routing_enabled is
  'false = shadow mode (shows what adaptive would do, does not change live routing); true = adaptive tie-breaking is live.';
comment on column agency_settings.adaptive_min_sample is
  'Minimum number of appointments before a learned rate is treated as "sufficient". Below this, the engine blends toward the agency default and labels data as insufficient.';
