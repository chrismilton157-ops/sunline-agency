import { describe, it, expect } from 'vitest';
import {
  routeLead,
  fillPercent,
  weekBoundsUTC,
  clusterPromises,
  STARVATION_TIME_THRESHOLD,
  STARVATION_FILL_THRESHOLD,
  type RoutingClient,
} from '../lib/routing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function client(overrides: Partial<RoutingClient> & { id: string; covered_postcodes: string[] }): RoutingClient {
  return {
    company: overrides.id,
    weekly_promise: 10,
    priority: 1,
    joined_at: '2024-01-01',
    leads_this_week: 0,
    last_lead_at: null,
    ...overrides,
  };
}

// A Monday well within the week — not near the starvation threshold
const MID_WEEK = new Date(Date.UTC(2025, 0, 6, 9, 0, 0)); // Mon 2025-01-06 09:00 UTC
// Late Sunday — 12 hours left in the Mon–Sun week (≈7% remaining), well below the 30% starvation threshold
const FRIDAY_PM = new Date(Date.UTC(2025, 0, 12, 12, 0, 0)); // Sun 2025-01-12 12:00 UTC

const clientA = client({ id: 'A', covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 0 });
const clientB = client({ id: 'B', covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 5 });

// ---------------------------------------------------------------------------
// fillPercent
// ---------------------------------------------------------------------------

describe('fillPercent', () => {
  it('returns leads_this_week / weekly_promise', () => {
    expect(fillPercent(client({ id: 'x', covered_postcodes: [], weekly_promise: 10, leads_this_week: 3 }))).toBeCloseTo(0.3);
  });

  it('returns 1 when weekly_promise is 0 (never "behind")', () => {
    expect(fillPercent(client({ id: 'x', covered_postcodes: [], weekly_promise: 0, leads_this_week: 0 }))).toBe(1);
  });

  it('can exceed 1 when over-delivered', () => {
    expect(fillPercent(client({ id: 'x', covered_postcodes: [], weekly_promise: 5, leads_this_week: 7 }))).toBeCloseTo(1.4);
  });
});

// ---------------------------------------------------------------------------
// weekBoundsUTC
// ---------------------------------------------------------------------------

describe('weekBoundsUTC', () => {
  it('starts on Monday 00:00 UTC', () => {
    const { start } = weekBoundsUTC(MID_WEEK);
    expect(start.getUTCDay()).toBe(1); // Monday
    expect(start.getUTCHours()).toBe(0);
  });

  it('fractionRemaining is between 0 and 1', () => {
    const { fractionRemaining } = weekBoundsUTC(MID_WEEK);
    expect(fractionRemaining).toBeGreaterThan(0);
    expect(fractionRemaining).toBeLessThanOrEqual(1);
  });

  it('late Friday is at or below starvation threshold', () => {
    const { fractionRemaining } = weekBoundsUTC(FRIDAY_PM);
    expect(fractionRemaining).toBeLessThanOrEqual(STARVATION_TIME_THRESHOLD);
  });
});

// ---------------------------------------------------------------------------
// routeLead — no candidates
// ---------------------------------------------------------------------------

describe('routeLead — no candidates', () => {
  it('fires no_candidates when no client covers the postcode', () => {
    const result = routeLead('NW1 4AB', [clientA, clientB], MID_WEEK);
    expect(result.ruleFired).toBe('no_candidates');
    expect(result.winnerId).toBeNull();
  });

  it('fires no_candidates for a blank postcode', () => {
    const result = routeLead('', [clientA], MID_WEEK);
    expect(result.ruleFired).toBe('no_candidates');
  });
});

// ---------------------------------------------------------------------------
// routeLead — most_behind (rule 2)
// ---------------------------------------------------------------------------

describe('routeLead — most_behind', () => {
  it('picks the client with the lowest fill % mid-week', () => {
    // A: 0/10 = 0%, B: 5/10 = 50% → A wins
    const result = routeLead('SW1A 1AA', [clientA, clientB], MID_WEEK);
    expect(result.ruleFired).toBe('most_behind');
    expect(result.winnerId).toBe('A');
  });

  it('fillPercents map contains both clients', () => {
    const result = routeLead('SW1A 1AA', [clientA, clientB], MID_WEEK);
    expect(result.fillPercents['A']).toBe(0);
    expect(result.fillPercents['B']).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// routeLead — newest_client (rule 3 tie-break)
// ---------------------------------------------------------------------------

describe('routeLead — newest_client tie-break', () => {
  it('picks the most recently joined client when fill % is tied', () => {
    const tied1 = client({ id: 'old', covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2023-01-01' });
    const tied2 = client({ id: 'new', covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-06-01' });
    const result = routeLead('SW1', [tied1, tied2], MID_WEEK);
    expect(result.ruleFired).toBe('newest_client');
    expect(result.winnerId).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// routeLead — round_robin (rule 4)
// ---------------------------------------------------------------------------

describe('routeLead — round_robin', () => {
  it('picks the client who received a lead least recently when all else is tied', () => {
    const c1 = client({ id: 'c1', covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-05T10:00:00Z' });
    const c2 = client({ id: 'c2', covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-04T08:00:00Z' });
    const result = routeLead('SW1', [c1, c2], MID_WEEK);
    expect(result.ruleFired).toBe('round_robin');
    expect(result.winnerId).toBe('c2'); // c2 received a lead earlier
  });

  it('a client with no prior leads (null) wins round-robin over one with a lead', () => {
    const c1 = client({ id: 'c1', covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-05T10:00:00Z' });
    const c2 = client({ id: 'c2', covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: null });
    const result = routeLead('SW1', [c1, c2], MID_WEEK);
    expect(result.winnerId).toBe('c2');
  });
});

// ---------------------------------------------------------------------------
// routeLead — starvation floor (rule 1)
// ---------------------------------------------------------------------------

describe('routeLead — starvation floor', () => {
  it('starvation is NOT active mid-week', () => {
    const result = routeLead('SW1', [clientA, clientB], MID_WEEK);
    expect(result.starvationActive).toBe(false);
  });

  it('starvation IS active late Friday', () => {
    const result = routeLead('SW1', [clientA, clientB], FRIDAY_PM);
    expect(result.starvationActive).toBe(true);
  });

  it('starving client wins over ahead client when starvation active', () => {
    // A: 0/10 = 0% (starving, below 50%), B: 8/10 = 80% (fine)
    const starving = client({ id: 'A', covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 0 });
    const ahead    = client({ id: 'B', covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 8 });
    const result = routeLead('SW1', [starving, ahead], FRIDAY_PM);
    expect(result.ruleFired).toBe('starvation');
    expect(result.winnerId).toBe('A');
  });

  it('does not fire starvation if no client is below the fill threshold', () => {
    // Both at 60% — above the 50% starvation threshold
    const ok1 = client({ id: 'ok1', covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 6 });
    const ok2 = client({ id: 'ok2', covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 7 });
    const result = routeLead('SW1', [ok1, ok2], FRIDAY_PM);
    expect(result.ruleFired).not.toBe('starvation');
    expect(result.starvationActive).toBe(true); // time threshold met but fill threshold not
  });
});

// ---------------------------------------------------------------------------
// routeLead — postcode eligibility
// ---------------------------------------------------------------------------

describe('routeLead — postcode matching', () => {
  it('prefix matching is case-insensitive', () => {
    const c = client({ id: 'x', covered_postcodes: ['sw'] });
    const result = routeLead('SW1A 1AA', [c], MID_WEEK);
    expect(result.winnerId).toBe('x');
  });

  it('whitespace in submitted postcode is ignored', () => {
    const c = client({ id: 'x', covered_postcodes: ['SW1A'] });
    const result = routeLead('SW1A 1AA', [c], MID_WEEK);
    expect(result.winnerId).toBe('x');
  });

  it('a client that does not cover the area is excluded', () => {
    const covering  = client({ id: 'yes', covered_postcodes: ['SW'] });
    const excluding = client({ id: 'no',  covered_postcodes: ['NW'] });
    const result = routeLead('SW1A 1AA', [covering, excluding], MID_WEEK);
    expect(result.winnerId).toBe('yes');
    expect(result.considered.map(c => c.id)).not.toContain('no');
  });
});

// ---------------------------------------------------------------------------
// clusterPromises — over-promise warning
// ---------------------------------------------------------------------------

describe('clusterPromises', () => {
  const clients: RoutingClient[] = [
    client({ id: 'a', covered_postcodes: ['SW'], weekly_promise: 8 }),
    client({ id: 'b', covered_postcodes: ['SW'], weekly_promise: 5 }),
  ];
  const volumes = [{ postcode_prefix: 'SW', typical_weekly_leads: 10 }];

  it('warns when total promised exceeds typical weekly leads', () => {
    const result = clusterPromises(clients, volumes);
    expect(result[0].warn).toBe(true);   // 13 > 10
    expect(result[0].total_promised).toBe(13);
  });

  it('does not warn when total promised is within volume', () => {
    const light = [client({ id: 'only', covered_postcodes: ['SW'], weekly_promise: 5 })];
    const result = clusterPromises(light, volumes);
    expect(result[0].warn).toBe(false); // 5 <= 10
  });

  it('returns an empty covering list for a prefix no client covers', () => {
    const result = clusterPromises([], volumes);
    expect(result[0].covering).toHaveLength(0);
    expect(result[0].warn).toBe(false);
  });
});
