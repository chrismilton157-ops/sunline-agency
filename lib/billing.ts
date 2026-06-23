// Sunline Phase 6: billing model.
//
// All money knobs that aren't already on the client row live here. Today
// they're code constants (per-client values override via the client row
// where the schema allows); a later phase is intended to move them to
// owner-editable settings — keep them centralised so that migration is a
// single-file edit.

import type { Appointment } from './types';

// Default management markup on ad spend. Clients can override via
// `clients.management_markup_pct` (added in migration 0007). The default
// applies only if a client's row hasn't been set.
export const DEFAULT_MANAGEMENT_MARKUP_PCT = 20;

// Billable outcomes — appointment occurred and we charge for it.
// Cancellations before the day stay 'booked' and are NOT billed.
// Confirmation status (confirmed_at) does NOT gate billing — see the
// agency policy notes. We charge for confirmed and unconfirmed alike.
export const BILLABLE_OUTCOMES: Appointment['outcome'][] = [
  'sat',
  'sold',
  'no_show',
];

export type InvoiceStatus = 'draft' | 'issued' | 'paid';

// Snapshot of the bill that's safe to store on the invoice row.
// `*_raw` and `markup_pct` are agency-only and locked down at the DB
// level — they never leave the server.
export type InvoiceBreakdown = {
  // client-visible figures
  advertising_management: number; // ad spend + markup, ONE combined number
  appointment_count: number;      // billable appts in the period
  appointment_fees: number;       // appointment_count * per_sit_fee
  total: number;                  // advertising_management + appointment_fees

  // snapshot — fixed at generation time so historical invoices don't move
  per_sit_fee_snapshot: number;

  // AGENCY-ONLY — NEVER returned in client-visible queries
  ad_spend_raw: number;
  management_markup_pct_snapshot: number;
};

// Pure function — no I/O. Given the per-client billing inputs and the
// period's appointments, returns the invoice breakdown.
export function computeInvoice(input: {
  ad_spend_monthly: number;
  management_markup_pct: number;
  per_sit_fee: number;
  appointments_in_period: Appointment[];
}): InvoiceBreakdown {
  const billable = input.appointments_in_period.filter((a) =>
    BILLABLE_OUTCOMES.includes(a.outcome),
  );

  const ad_spend_raw = round2(input.ad_spend_monthly);
  const markup_pct = input.management_markup_pct;
  const markup_amount = round2(ad_spend_raw * (markup_pct / 100));
  const advertising_management = round2(ad_spend_raw + markup_amount);

  const appointment_count = billable.length;
  const appointment_fees = round2(appointment_count * input.per_sit_fee);
  const total = round2(advertising_management + appointment_fees);

  return {
    advertising_management,
    appointment_count,
    appointment_fees,
    total,
    per_sit_fee_snapshot: round2(input.per_sit_fee),
    ad_spend_raw,
    management_markup_pct_snapshot: markup_pct,
  };
}

// Bucket appointments by YYYY-MM for batch invoice generation.
export function appointmentsInPeriod(
  appointments: Appointment[],
  period: string,
): Appointment[] {
  return appointments.filter((a) => a.appt_date.startsWith(period));
}

// Period helpers — YYYY-MM strings. Periods are UTC-based to match how
// we store appt_date strings throughout the app.
export function ymUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function previousYM(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return ymUTC(d);
}

export function nextYM(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return ymUTC(d);
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
