import { describe, it, expect } from 'vitest';
import { computeChurnRisk, CHURN_MIN_WEEKS, CHURN_MIN_SITS } from '../lib/churn-risk';
import type { Client, Appointment } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2025-06-01T12:00:00Z');

function makeClient(overrides: Partial<Client> & { id: string }): Client {
  return {
    company: overrides.company ?? 'Test Solar',
    contact: null,
    region: null,
    retainer: 500,
    per_sit_fee: 100,
    ad_spend_monthly: 1000,
    status: 'active',
    joined_at: overrides.joined_at ?? '2024-01-01',
    weekly_promise: 10,
    priority: 100,
    management_markup_pct: 20,
    ...overrides,
  };
}

function appt(
  client_id: string,
  outcome: Appointment['outcome'],
  appt_date: string,
  quality_rating: Appointment['quality_rating'] = null,
  sale_value: number | null = outcome === 'sold' ? 8000 : null,
): Appointment {
  return {
    id: Math.random().toString(36).slice(2),
    client_id,
    lead_id: 'lead-1',
    appt_date,
    setter: null,
    setter_id: null,
    outcome,
    sale_value,
    invoiced: false,
    quality_rating,
    quality_reason: null,
    confirmed_at: null,
  };
}

function lead(client_id: string, created_at: string) {
  return { client_id, created_at };
}

// ---------------------------------------------------------------------------
// Data sufficiency — too-new client must NOT be flagged at risk
// ---------------------------------------------------------------------------

describe('data sufficiency gate', () => {
  it('returns Too new when client has been active fewer than CHURN_MIN_WEEKS weeks', () => {
    const client = makeClient({ id: 'new-1', joined_at: '2025-05-25' }); // ~1 week ago
    const result = computeChurnRisk(client, [], [], [], NOW);
    expect(result.sufficient_data).toBe(false);
    expect(result.band).toBe('Too new');
    expect(result.score).toBe(0);
    expect(result.reasons[0]).toMatch(/need at least/i);
  });

  it(`returns Too new when sits < ${CHURN_MIN_SITS} even if active long enough`, () => {
    const client = makeClient({ id: 'new-2', joined_at: '2024-01-01' }); // plenty old
    // Only 3 sits — under the minimum
    const appts = [
      appt('new-2', 'sat', '2025-05-01'),
      appt('new-2', 'sat', '2025-04-01'),
      appt('new-2', 'no_show', '2025-03-01'),
    ];
    const result = computeChurnRisk(client, appts, [], [], NOW);
    expect(result.sufficient_data).toBe(false);
    expect(result.band).toBe('Too new');
    expect(result.score).toBe(0);
  });

  it('does NOT flag as at-risk when there is exactly enough data but no problems', () => {
    const client = makeClient({ id: 'ok-1', joined_at: '2024-10-01', weekly_promise: 0 });
    // Consistent ~50% close rate across BOTH the recent (last 4wks) and prior (4-8wks) windows
    // Recent window: 2025-05-04 to 2025-06-01
    // Prior window:  2025-04-03 to 2025-05-04
    const appts = [
      // Recent window: 2 sold, 2 sat → 50%
      appt('ok-1', 'sold', '2025-05-28', null, 9000),
      appt('ok-1', 'sold', '2025-05-20', null, 9000),
      appt('ok-1', 'sat', '2025-05-15'),
      appt('ok-1', 'sat', '2025-05-08'),
      // Prior window: 2 sold, 2 sat → 50%
      appt('ok-1', 'sold', '2025-04-28', null, 9000),
      appt('ok-1', 'sold', '2025-04-18', null, 9000),
      appt('ok-1', 'sat', '2025-04-12'),
      appt('ok-1', 'sat', '2025-04-07'),
    ];
    // Recent portal login
    const logins = [{ occurred_at: '2025-05-30T10:00:00Z' }];
    const result = computeChurnRisk(client, appts, [], logins, NOW);
    expect(result.sufficient_data).toBe(true);
    expect(result.band).toBe('Healthy');
    expect(result.score).toBeLessThan(25);
  });
});

// ---------------------------------------------------------------------------
// Score reacts correctly to a deteriorating client
// ---------------------------------------------------------------------------

describe('deteriorating client scoring', () => {
  it('flags At risk when close rate falls sharply in recent 4 weeks', () => {
    const client = makeClient({ id: 'bad-1', joined_at: '2024-01-01', weekly_promise: 0 });
    const appts = [
      // Prior 4 weeks: 4 sits, 3 sold → 75% close rate
      appt('bad-1', 'sold', '2025-04-20', null, 8000),
      appt('bad-1', 'sold', '2025-04-15', null, 8000),
      appt('bad-1', 'sold', '2025-04-10', null, 8000),
      appt('bad-1', 'sat', '2025-04-05'),
      // Recent 4 weeks: 6 sits, 0 sold → 0% close rate (big drop)
      appt('bad-1', 'sat', '2025-05-25'),
      appt('bad-1', 'sat', '2025-05-20'),
      appt('bad-1', 'sat', '2025-05-15'),
      appt('bad-1', 'sat', '2025-05-10'),
      appt('bad-1', 'sat', '2025-05-05'),
      appt('bad-1', 'sat', '2025-05-01'),
    ];
    const logins = [{ occurred_at: '2025-05-29T10:00:00Z' }];
    const result = computeChurnRisk(client, appts, [], logins, NOW);
    expect(result.sufficient_data).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.reasons.some((r) => /close rate fell/i.test(r))).toBe(true);
  });

  it('flags high no-show rate in recent window', () => {
    const client = makeClient({ id: 'bad-2', joined_at: '2024-01-01', weekly_promise: 0 });
    const appts = [
      // 8 historical sits (sufficiency)
      appt('bad-2', 'sold', '2024-12-01', null, 8000),
      appt('bad-2', 'sold', '2024-12-10', null, 8000),
      appt('bad-2', 'sold', '2024-12-20', null, 8000),
      appt('bad-2', 'sold', '2025-01-05', null, 8000),
      appt('bad-2', 'sold', '2025-01-15', null, 8000),
      // Recent: 3 no-shows out of 5 appointments → 60% no-show rate
      appt('bad-2', 'no_show', '2025-05-25'),
      appt('bad-2', 'no_show', '2025-05-20'),
      appt('bad-2', 'no_show', '2025-05-15'),
      appt('bad-2', 'sat', '2025-05-10'),
      appt('bad-2', 'sat', '2025-05-05'),
    ];
    const logins = [{ occurred_at: '2025-05-29T10:00:00Z' }];
    const result = computeChurnRisk(client, appts, [], logins, NOW);
    expect(result.reasons.some((r) => /no-show rate/i.test(r))).toBe(true);
  });

  it('flags delivery shortfall when under 70% of promise', () => {
    const client = makeClient({ id: 'bad-3', joined_at: '2024-01-01', weekly_promise: 10 });
    const appts = [
      appt('bad-3', 'sold', '2024-12-01', null, 8000),
      appt('bad-3', 'sold', '2024-12-10', null, 8000),
      appt('bad-3', 'sold', '2024-12-20', null, 8000),
      appt('bad-3', 'sold', '2025-01-05', null, 8000),
      appt('bad-3', 'sold', '2025-01-15', null, 8000),
    ];
    // Only 5 leads in last 4 weeks vs 40 promised (12.5%)
    const leads = [
      lead('bad-3', '2025-05-25T10:00:00Z'),
      lead('bad-3', '2025-05-20T10:00:00Z'),
      lead('bad-3', '2025-05-15T10:00:00Z'),
      lead('bad-3', '2025-05-10T10:00:00Z'),
      lead('bad-3', '2025-05-05T10:00:00Z'),
    ];
    const logins = [{ occurred_at: '2025-05-29T10:00:00Z' }];
    const result = computeChurnRisk(client, appts, leads, logins, NOW);
    expect(result.reasons.some((r) => /delivered.*promised/i.test(r))).toBe(true);
  });

  it('flags stale portal login after 30+ days', () => {
    const client = makeClient({ id: 'bad-4', joined_at: '2024-01-01', weekly_promise: 0 });
    const appts = [
      appt('bad-4', 'sold', '2024-12-01', null, 8000),
      appt('bad-4', 'sold', '2024-12-10', null, 8000),
      appt('bad-4', 'sold', '2024-12-20', null, 8000),
      appt('bad-4', 'sold', '2025-01-05', null, 8000),
      appt('bad-4', 'sold', '2025-01-15', null, 8000),
    ];
    // Last login was 45 days ago
    const logins = [{ occurred_at: '2025-04-17T10:00:00Z' }];
    const result = computeChurnRisk(client, appts, [], logins, NOW);
    expect(result.reasons.some((r) => /no portal login/i.test(r))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(15);
  });
});

// ---------------------------------------------------------------------------
// Steady healthy client stays Healthy
// ---------------------------------------------------------------------------

describe('steady healthy client', () => {
  it('returns Healthy for a client with good metrics and recent login', () => {
    const client = makeClient({ id: 'steady-1', joined_at: '2024-01-01', weekly_promise: 10 });
    // Consistent 50% close rate across both windows — no deterioration
    const appts = [
      // Recent window (after 2025-05-04): 2 sold, 2 sat → 50%
      appt('steady-1', 'sold', '2025-05-28', null, 9000),
      appt('steady-1', 'sold', '2025-05-20', null, 9000),
      appt('steady-1', 'sat', '2025-05-14'),
      appt('steady-1', 'sat', '2025-05-08'),
      // Prior window (2025-04-03 to 2025-05-04): 2 sold, 2 sat → 50%
      appt('steady-1', 'sold', '2025-04-25', null, 9000),
      appt('steady-1', 'sold', '2025-04-18', null, 9000),
      appt('steady-1', 'sat', '2025-04-12'),
      appt('steady-1', 'sat', '2025-04-07'),
    ];
    // Delivering close to promise (36/40 = 90%)
    const leads: { client_id: string; created_at: string }[] = [];
    for (let i = 0; i < 36; i++) {
      leads.push(lead('steady-1', `2025-05-${String(i % 28 + 1).padStart(2, '0')}T10:00:00Z`));
    }
    const logins = [{ occurred_at: '2025-05-30T10:00:00Z' }];
    const result = computeChurnRisk(client, appts, leads, logins, NOW);
    expect(result.sufficient_data).toBe(true);
    expect(result.band).toBe('Healthy');
    expect(result.score).toBeLessThan(25);
    expect(result.reasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Score is deterministic and inputs are exposed
// ---------------------------------------------------------------------------

describe('transparency', () => {
  it('exposes all raw inputs on the result', () => {
    const client = makeClient({ id: 'tr-1', joined_at: '2024-01-01', weekly_promise: 0 });
    const appts = [
      appt('tr-1', 'sold', '2024-12-01', null, 8000),
      appt('tr-1', 'sold', '2024-12-10', null, 8000),
      appt('tr-1', 'sold', '2024-12-20', null, 8000),
      appt('tr-1', 'sold', '2025-01-05', null, 8000),
      appt('tr-1', 'sold', '2025-01-15', null, 8000),
    ];
    const logins = [{ occurred_at: '2025-05-31T10:00:00Z' }];
    const result = computeChurnRisk(client, appts, [], logins, NOW);
    expect(result.inputs).toHaveProperty('weeks_active');
    expect(result.inputs).toHaveProperty('total_sits');
    expect(result.inputs).toHaveProperty('close_rate_recent');
    expect(result.inputs).toHaveProperty('close_rate_prior');
    expect(result.inputs).toHaveProperty('no_show_rate_recent');
    expect(result.inputs).toHaveProperty('delivery_pct_recent');
    expect(result.inputs).toHaveProperty('days_since_portal_login');
    expect(result.inputs).toHaveProperty('flagged_recent');
    expect(result.inputs).toHaveProperty('occurred_recent');
    expect(result.inputs).toHaveProperty('roi_overall');
    expect(typeof result.inputs.weeks_active).toBe('number');
  });

  it('is deterministic — same inputs yield same score', () => {
    const client = makeClient({ id: 'tr-2', joined_at: '2024-01-01', weekly_promise: 0 });
    const appts = [
      appt('tr-2', 'sat', '2025-05-01'),
      appt('tr-2', 'sold', '2025-04-01', null, 8000),
      appt('tr-2', 'sold', '2025-03-01', null, 8000),
      appt('tr-2', 'sold', '2025-02-01', null, 8000),
      appt('tr-2', 'sold', '2025-01-01', null, 8000),
      appt('tr-2', 'sold', '2024-12-01', null, 8000),
    ];
    const logins = [{ occurred_at: '2025-05-20T10:00:00Z' }];
    const r1 = computeChurnRisk(client, appts, [], logins, NOW);
    const r2 = computeChurnRisk(client, appts, [], logins, NOW);
    expect(r1.score).toBe(r2.score);
    expect(r1.band).toBe(r2.band);
  });
});
