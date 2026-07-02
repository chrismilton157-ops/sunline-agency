-- Phase 28: installer self-audit funnel (/for-installers).
--
-- Extends the existing owner-only installer_enquiries table (see 0015) so the
-- public /for-installers page can attach a prospect's 3-input self-audit to the
-- enquiry: their monthly lead spend, appointment volume, close rate, and the
-- computed real cost per sale. Also tags the enquiry source so the owner can
-- tell a self-audit lead apart from a plain marketing "book a call".
--
-- Safety notes:
--   * All new columns are NULLABLE — existing marketing enquiries (source NULL)
--     keep working unchanged.
--   * `source` is a plain text column, NOT an enum — no commit-before-use dance.
--   * RLS is deliberately UNCHANGED: the owner-all policy from 0015 still
--     applies, and SELECT is still revoked from the `authenticated` role, so
--     these enquiries remain owner-only and invisible to client / setter /
--     confirmer roles. New columns inherit that table-level protection.

alter table installer_enquiries
  add column if not exists source              text,
  add column if not exists audit_monthly_spend numeric(10,2),
  add column if not exists audit_appointments  integer,
  add column if not exists audit_close_rate    numeric(5,2),
  add column if not exists audit_cost_per_sale numeric(10,2),
  add column if not exists preferred_call_time text;

-- The demo-request form makes phone and area/postcodes optional, so relax the
-- NOT NULL constraints. The existing marketing form still enforces them at the
-- application layer, so its data guarantee is unchanged.
alter table installer_enquiries alter column phone  drop not null;
alter table installer_enquiries alter column region drop not null;
