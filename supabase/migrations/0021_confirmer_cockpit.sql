-- =============================================================================
-- 0021_confirmer_cockpit.sql — Confirmer cockpit expansion
-- =============================================================================
-- IMPORTANT: Run these two pastes in sequence in the Supabase SQL editor.
-- ALTER TYPE … ADD VALUE cannot be used in the same transaction as code that
-- references the new values. Commit PASTE A first, then run PASTE B.
-- =============================================================================

-- ===========================================================================
-- PASTE A — Extend appointment_event_type with new values
--           Run this first and commit before running PASTE B.
-- ===========================================================================

ALTER TYPE public.appointment_event_type ADD VALUE IF NOT EXISTS 'note';
ALTER TYPE public.appointment_event_type ADD VALUE IF NOT EXISTS 'callback_set';
ALTER TYPE public.appointment_event_type ADD VALUE IF NOT EXISTS 'snoozed';
ALTER TYPE public.appointment_event_type ADD VALUE IF NOT EXISTS 'text_sent';
ALTER TYPE public.appointment_event_type ADD VALUE IF NOT EXISTS 'flagged';
ALTER TYPE public.appointment_event_type ADD VALUE IF NOT EXISTS 'outcome_logged';

-- ===========================================================================
-- PASTE B — New enums, columns, table, policies, indexes
--           Run AFTER PASTE A has been committed.
-- ===========================================================================

-- New enums
CREATE TYPE public.confirmation_strength AS ENUM (
  'confirmed',
  'soft_confirmed',
  'unreachable'
);

CREATE TYPE public.reschedule_reason AS ENUM (
  'homeowner_busy',
  'decision_maker_unavailable',
  'weather_illness',
  'installer_requested',
  'wants_more_time',
  'other'
);

-- New columns on appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS callback_at         timestamptz,
  ADD COLUMN IF NOT EXISTS callback_set_by     uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS snooze_until        timestamptz,
  ADD COLUMN IF NOT EXISTS notes               text,
  ADD COLUMN IF NOT EXISTS decision_makers_present boolean,
  ADD COLUMN IF NOT EXISTS confirmation_strength public.confirmation_strength,
  ADD COLUMN IF NOT EXISTS flagged             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_reason      text,
  ADD COLUMN IF NOT EXISTS flagged_by          uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS flagged_at          timestamptz;

-- New columns on appointment_events
ALTER TABLE public.appointment_events
  ADD COLUMN IF NOT EXISTS callback_at       timestamptz,
  ADD COLUMN IF NOT EXISTS snooze_until      timestamptz,
  ADD COLUMN IF NOT EXISTS sms_template_name text,
  ADD COLUMN IF NOT EXISTS flag_reason       text,
  ADD COLUMN IF NOT EXISTS reschedule_reason public.reschedule_reason;

-- SMS templates table
CREATE TABLE IF NOT EXISTS public.sms_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

-- Owner can do everything; confirmer can only read
CREATE POLICY "sms_templates_owner_all" ON public.sms_templates
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "sms_templates_confirmer_read" ON public.sms_templates
  FOR SELECT TO authenticated
  USING (public.is_confirmer());

-- Seed default templates
INSERT INTO public.sms_templates (name, body) VALUES
  (
    'Confirmation',
    'Hi {name}, just confirming your free solar survey with us on {date} at {time}. If anything changes, reply or call us. See you then!'
  ),
  (
    'Reminder',
    'Hi {name}, a quick reminder — your solar survey is tomorrow at {time}. Our team is looking forward to it!'
  ),
  (
    'Missed call',
    'Hi {name}, we tried to reach you today about your upcoming solar survey. Please give us a call back or reply here.'
  )
ON CONFLICT DO NOTHING;

-- Indexes for callback/snooze/flag lookups
CREATE INDEX IF NOT EXISTS appointments_callback_at_idx
  ON public.appointments(callback_at) WHERE callback_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_snooze_until_idx
  ON public.appointments(snooze_until) WHERE snooze_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_flagged_idx
  ON public.appointments(flagged) WHERE flagged = true;
