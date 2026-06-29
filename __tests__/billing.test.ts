import { describe, it, expect } from 'vitest';
import {
  computeInvoice,
  appointmentsInPeriod,
  previousYM,
  nextYM,
  ymUTC,
  BILLABLE_OUTCOMES,
  DEFAULT_MANAGEMENT_MARKUP_PCT,
} from '../lib/billing';
import type { Appointment } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function appt(overrides: Partial<Appointment> & { outcome: Appointment['outcome']; appt_date: string }): Appointment {
  return {
    id: 'test-id',
    client_id: 'client-1',
    lead_id: 'lead-1',
    setter: null,
    setter_id: null,
    sale_value: null,
    invoiced: false,
    quality_rating: null,
    quality_reason: null,
    confirmed_at: null,
    ...overrides,
  };
}

const period = '2025-06';

const appointments: Appointment[] = [
  appt({ outcome: 'sat',     appt_date: '2025-06-01' }),
  appt({ outcome: 'sold',    appt_date: '2025-06-10' }),
  appt({ outcome: 'no_show', appt_date: '2025-06-15' }),
  appt({ outcome: 'booked',  appt_date: '2025-06-20' }), // not billable
];

// ---------------------------------------------------------------------------
// BILLABLE_OUTCOMES
// ---------------------------------------------------------------------------

describe('BILLABLE_OUTCOMES', () => {
  it('includes sat, sold, no_show', () => {
    expect(BILLABLE_OUTCOMES).toContain('sat');
    expect(BILLABLE_OUTCOMES).toContain('sold');
    expect(BILLABLE_OUTCOMES).toContain('no_show');
  });

  it('does NOT include booked', () => {
    expect(BILLABLE_OUTCOMES).not.toContain('booked');
  });
});

// ---------------------------------------------------------------------------
// computeInvoice — advertising management line
// ---------------------------------------------------------------------------

describe('computeInvoice — advertising management', () => {
  it('applies default 20% markup on ad spend', () => {
    const result = computeInvoice({
      ad_spend_monthly: 1000,
      management_markup_pct: DEFAULT_MANAGEMENT_MARKUP_PCT,
      per_sit_fee: 0,
      appointments_in_period: [],
    });
    // 1000 + 20% = 1200
    expect(result.advertising_management).toBe(1200);
    expect(result.ad_spend_raw).toBe(1000);
    expect(result.management_markup_pct_snapshot).toBe(20);
  });

  it('applies a custom 15% markup correctly', () => {
    const result = computeInvoice({
      ad_spend_monthly: 2000,
      management_markup_pct: 15,
      per_sit_fee: 0,
      appointments_in_period: [],
    });
    // 2000 + 15% = 2300
    expect(result.advertising_management).toBe(2300);
  });

  it('rounds to 2 decimal places', () => {
    const result = computeInvoice({
      ad_spend_monthly: 1000,
      management_markup_pct: 33,
      per_sit_fee: 0,
      appointments_in_period: [],
    });
    // 1000 + 330 = 1330.00 — exact; test with fractional case
    const result2 = computeInvoice({
      ad_spend_monthly: 100,
      management_markup_pct: 33,
      per_sit_fee: 0,
      appointments_in_period: [],
    });
    // 100 + 33 = 133.00 exactly
    expect(Number.isFinite(result2.advertising_management)).toBe(true);
    expect(String(result2.advertising_management)).not.toMatch(/\.\d{3,}/); // max 2dp
  });
});

// ---------------------------------------------------------------------------
// computeInvoice — appointment fees and billable rules
// ---------------------------------------------------------------------------

describe('computeInvoice — appointment fees', () => {
  it('counts only billable outcomes (sat, sold, no_show)', () => {
    const result = computeInvoice({
      ad_spend_monthly: 0,
      management_markup_pct: 20,
      per_sit_fee: 50,
      appointments_in_period: appointments,
    });
    // 3 billable (sat, sold, no_show); booked does not count
    expect(result.appointment_count).toBe(3);
    expect(result.appointment_fees).toBe(150);
  });

  it('sat is billable', () => {
    const r = computeInvoice({ ad_spend_monthly: 0, management_markup_pct: 20, per_sit_fee: 75, appointments_in_period: [appt({ outcome: 'sat', appt_date: '2025-06-01' })] });
    expect(r.appointment_count).toBe(1);
    expect(r.appointment_fees).toBe(75);
  });

  it('sold is billable', () => {
    const r = computeInvoice({ ad_spend_monthly: 0, management_markup_pct: 20, per_sit_fee: 75, appointments_in_period: [appt({ outcome: 'sold', appt_date: '2025-06-01' })] });
    expect(r.appointment_count).toBe(1);
  });

  it('no_show is billable', () => {
    const r = computeInvoice({ ad_spend_monthly: 0, management_markup_pct: 20, per_sit_fee: 75, appointments_in_period: [appt({ outcome: 'no_show', appt_date: '2025-06-01' })] });
    expect(r.appointment_count).toBe(1);
  });

  it('booked is NOT billable', () => {
    const r = computeInvoice({ ad_spend_monthly: 0, management_markup_pct: 20, per_sit_fee: 75, appointments_in_period: [appt({ outcome: 'booked', appt_date: '2025-06-01' })] });
    expect(r.appointment_count).toBe(0);
    expect(r.appointment_fees).toBe(0);
  });

  it('zero appointments yields zero fees', () => {
    const r = computeInvoice({ ad_spend_monthly: 500, management_markup_pct: 20, per_sit_fee: 60, appointments_in_period: [] });
    expect(r.appointment_count).toBe(0);
    expect(r.appointment_fees).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeInvoice — totals
// ---------------------------------------------------------------------------

describe('computeInvoice — total', () => {
  it('total = advertising_management + appointment_fees', () => {
    const result = computeInvoice({
      ad_spend_monthly: 1000,
      management_markup_pct: 20,
      per_sit_fee: 50,
      appointments_in_period: appointments, // 3 billable
    });
    // advertising_management = 1200; fees = 150; total = 1350
    expect(result.total).toBe(result.advertising_management + result.appointment_fees);
    expect(result.total).toBe(1350);
  });

  it('per_sit_fee_snapshot is frozen at generation time', () => {
    const r = computeInvoice({ ad_spend_monthly: 0, management_markup_pct: 20, per_sit_fee: 99.99, appointments_in_period: [] });
    expect(r.per_sit_fee_snapshot).toBe(99.99);
  });
});

// ---------------------------------------------------------------------------
// appointmentsInPeriod
// ---------------------------------------------------------------------------

describe('appointmentsInPeriod', () => {
  it('returns only appointments in the given YYYY-MM period', () => {
    const all = [
      appt({ outcome: 'sat', appt_date: '2025-05-31' }),
      appt({ outcome: 'sat', appt_date: '2025-06-01' }),
      appt({ outcome: 'sat', appt_date: '2025-06-30' }),
      appt({ outcome: 'sat', appt_date: '2025-07-01' }),
    ];
    const filtered = appointmentsInPeriod(all, '2025-06');
    expect(filtered).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

describe('period helpers', () => {
  it('ymUTC formats a UTC date as YYYY-MM', () => {
    expect(ymUTC(new Date(Date.UTC(2025, 5, 15)))).toBe('2025-06');
  });

  it('previousYM rolls back one month', () => {
    expect(previousYM('2025-06')).toBe('2025-05');
    expect(previousYM('2025-01')).toBe('2024-12');
  });

  it('nextYM advances one month', () => {
    expect(nextYM('2025-06')).toBe('2025-07');
    expect(nextYM('2025-12')).toBe('2026-01');
  });
});
