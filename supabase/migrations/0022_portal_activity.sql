-- 0022_portal_activity.sql
-- Lightweight table for tracking client portal logins.
-- Used exclusively by the churn-risk scoring engine (owner-only read).
-- Inserts happen server-side via the service-role key; no client-side writes.

CREATE TABLE IF NOT EXISTS portal_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  event_type  text NOT NULL DEFAULT 'login',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX portal_activity_client_idx ON portal_activity (client_id, occurred_at DESC);

ALTER TABLE portal_activity ENABLE ROW LEVEL SECURITY;

-- Owner can read all rows (for churn scoring + auditing).
-- Non-owner JWTs get zero rows from RLS — churn signals are owner-only.
-- Inserts happen via the service-role client (server components), not JWT.
CREATE POLICY portal_activity_owner_read ON portal_activity
  FOR SELECT
  TO authenticated
  USING (is_owner());
