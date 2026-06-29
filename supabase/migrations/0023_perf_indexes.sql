-- 0023_perf_indexes.sql
-- Performance pass: indexes for columns that are filtered/ordered on
-- frequently but were missing an index. Read-only change — no RLS,
-- no policy, no behaviour change. Safe to run any time.

-- Overview / churn / routing / setter screens order or filter appointments
-- by appt_date and filter by outcome.
CREATE INDEX IF NOT EXISTS appointments_appt_date_idx ON public.appointments (appt_date DESC);
CREATE INDEX IF NOT EXISTS appointments_outcome_idx ON public.appointments (outcome);

-- Owner leads screen + routing engine order leads by created_at.
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);

-- Confirmer cockpit groups confirmation_attempts by appointment and orders
-- by created_at; only appointment_id/attempted_by were indexed before.
CREATE INDEX IF NOT EXISTS confirmation_attempts_created_at_idx ON public.confirmation_attempts (created_at DESC);

-- confirmer-metrics filters appointment_events by actor_id + event_type
-- together (per-confirmer stats); composite index serves that filter.
CREATE INDEX IF NOT EXISTS appointment_events_actor_type_idx ON public.appointment_events (actor_id, event_type);
