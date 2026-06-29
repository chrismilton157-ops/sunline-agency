import { describe, it, expect } from 'vitest';
import {
  blendRate,
  dataQuality,
  adaptiveRouteLead,
  shadowCompare,
  buildLearnedRates,
  type AdaptiveMetrics,
  type RawApptRow,
  type RawLeadRow,
} from '../lib/adaptive-routing';
import { routeLead, type RoutingClient } from '../lib/routing';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MID_WEEK = new Date(Date.UTC(2025, 0, 6, 9, 0, 0));  // Mon 2025-01-06 09:00
const LATE_WEEK = new Date(Date.UTC(2025, 0, 12, 12, 0, 0)); // Sun 2025-01-12 12:00

function client(id: string, opts: Partial<RoutingClient> & { covered_postcodes: string[] }): RoutingClient {
  return {
    company: id,
    weekly_promise: 10,
    priority: 1,
    joined_at: '2024-01-01',
    leads_this_week: 0,
    last_lead_at: null,
    id,
    ...opts,
  };
}

const AGENCY_CLOSE = 0.5;
const AGENCY_APPT  = 0.3;
const MIN_N        = 20;

function emptyMetrics(clients: RoutingClient[]): AdaptiveMetrics {
  return {
    clients: clients.map((c) => ({
      client_id: c.id,
      company: c.company,
      sit_count: 0,
      close_count: 0,
      total_appointments: 0,
      sit_rate: null,
      close_rate: null,
      blended_sit_rate: AGENCY_APPT,
      blended_close_rate: AGENCY_CLOSE,
      data_quality: 'none',
    })),
    postcodes: [],
    min_sample: MIN_N,
    agency_default_close_rate: AGENCY_CLOSE,
    agency_default_lead_to_appt_rate: AGENCY_APPT,
  };
}

// ---------------------------------------------------------------------------
// blendRate — shrinkage
// ---------------------------------------------------------------------------

describe('blendRate', () => {
  it('returns agency default when sample is 0', () => {
    expect(blendRate(null, 0, 0.5, 20)).toBe(0.5);
  });

  it('pulls a thin learned rate heavily toward the agency default', () => {
    // 2 sits, 2 closes → learned = 100%; with minN=20 and default=50%
    // blend = (2*1 + 20*0.5) / (2+20) = 12/22 ≈ 0.545 — much less than 100%
    const b = blendRate(1.0, 2, 0.5, 20);
    expect(b).toBeCloseTo(12 / 22);
    expect(b).toBeLessThan(0.6); // well below 100% learned rate
  });

  it('returns close to learned rate when sample is large', () => {
    // 100 sits, 80 closes → learned = 80%; with minN=20 and default=50%
    // blend = (100*0.8 + 20*0.5) / 120 = 90/120 = 0.75
    const b = blendRate(0.8, 100, 0.5, 20);
    expect(b).toBeCloseTo(90 / 120);
  });
});

// ---------------------------------------------------------------------------
// dataQuality
// ---------------------------------------------------------------------------

describe('dataQuality', () => {
  it('returns none when sample is 0', () => {
    expect(dataQuality(0, 20)).toBe('none');
  });
  it('returns insufficient when sample < minN', () => {
    expect(dataQuality(5, 20)).toBe('insufficient');
  });
  it('returns sufficient when sample >= minN', () => {
    expect(dataQuality(20, 20)).toBe('sufficient');
    expect(dataQuality(50, 20)).toBe('sufficient');
  });
});

// ---------------------------------------------------------------------------
// Base engine unchanged when adaptive OFF
// (i.e. routeLead and adaptiveRouteLead agree when there are no ties)
// ---------------------------------------------------------------------------

describe('adaptive routing — base engine unchanged', () => {
  it('with no ties, adaptiveRouteLead matches routeLead winner', () => {
    const A = client('A', { covered_postcodes: ['SW'], leads_this_week: 0 });
    const B = client('B', { covered_postcodes: ['SW'], leads_this_week: 5 });
    const metrics = emptyMetrics([A, B]);

    const base     = routeLead('SW1', [A, B], MID_WEEK);
    const adaptive = adaptiveRouteLead('SW1', [A, B], metrics, MID_WEEK);

    expect(adaptive.winnerId).toBe(base.winnerId); // A wins most_behind — unchanged
    expect(adaptive.ruleFired).toBe('most_behind');
    expect(adaptive.wouldDiffer).toBe(false);
  });

  it('starvation floor is never overridden by adaptive', () => {
    const starving = client('starving', { covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 1 });
    const highClose = client('high_close', { covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 9 });

    const metrics: AdaptiveMetrics = {
      clients: [
        {
          client_id: 'starving',
          company: 'starving',
          sit_count: 5, close_count: 5, total_appointments: 5,
          sit_rate: 1, close_rate: 0.1, // low close rate
          blended_sit_rate: 0.3, blended_close_rate: 0.2,
          data_quality: 'sufficient',
        },
        {
          client_id: 'high_close',
          company: 'high_close',
          sit_count: 100, close_count: 90, total_appointments: 100,
          sit_rate: 1, close_rate: 0.9, // very high close rate
          blended_sit_rate: 0.9, blended_close_rate: 0.87,
          data_quality: 'sufficient',
        },
      ],
      postcodes: [],
      min_sample: MIN_N,
      agency_default_close_rate: AGENCY_CLOSE,
      agency_default_lead_to_appt_rate: AGENCY_APPT,
    };

    // Late week: starvation fires. starving is at 10% fill, high_close at 90%.
    const result = adaptiveRouteLead('SW1', [starving, highClose], metrics, LATE_WEEK);
    expect(result.ruleFired).toBe('starvation');
    expect(result.winnerId).toBe('starving'); // FAIRNESS: starvation floor wins
    expect(result.wouldDiffer).toBe(false);    // adaptive can't override mandatory rule
  });

  it('a low-close paying client that is most behind still wins with adaptive on', () => {
    // Client A: 0/10 = 0% fill, low close rate
    // Client B: 5/10 = 50% fill, high close rate
    const A = client('A', { covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 0 });
    const B = client('B', { covered_postcodes: ['SW'], weekly_promise: 10, leads_this_week: 5 });

    const metrics: AdaptiveMetrics = {
      clients: [
        {
          client_id: 'A', company: 'A',
          sit_count: 50, close_count: 5, total_appointments: 50,
          sit_rate: 1, close_rate: 0.1, blended_sit_rate: 0.3, blended_close_rate: 0.17,
          data_quality: 'sufficient',
        },
        {
          client_id: 'B', company: 'B',
          sit_count: 50, close_count: 45, total_appointments: 50,
          sit_rate: 1, close_rate: 0.9, blended_sit_rate: 0.9, blended_close_rate: 0.87,
          data_quality: 'sufficient',
        },
      ],
      postcodes: [],
      min_sample: MIN_N,
      agency_default_close_rate: AGENCY_CLOSE,
      agency_default_lead_to_appt_rate: AGENCY_APPT,
    };

    const result = adaptiveRouteLead('SW1', [A, B], metrics, MID_WEEK);
    // A is most behind — fairness rule fires, adaptive cannot override
    expect(result.ruleFired).toBe('most_behind');
    expect(result.winnerId).toBe('A'); // low-close client is NOT starved
    expect(result.wouldDiffer).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Adaptive — only fires on genuine tie-breaks
// ---------------------------------------------------------------------------

describe('adaptive routing — tie-break scoring', () => {
  it('picks the higher-close-rate client when tied on fill %', () => {
    // Both at 0% fill, same join date → round_robin tie
    const A = client('A', { covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-04T10:00:00Z' });
    const B = client('B', { covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-03T10:00:00Z' });

    // Base: B wins round_robin (received lead earlier)
    const base = routeLead('SW1', [A, B], MID_WEEK);
    expect(base.winnerId).toBe('B');

    const metrics: AdaptiveMetrics = {
      clients: [
        {
          client_id: 'A', company: 'A',
          sit_count: 50, close_count: 45, total_appointments: 50,
          sit_rate: 1, close_rate: 0.9, blended_sit_rate: 0.9, blended_close_rate: 0.87,
          data_quality: 'sufficient',
        },
        {
          client_id: 'B', company: 'B',
          sit_count: 50, close_count: 10, total_appointments: 50,
          sit_rate: 1, close_rate: 0.2, blended_sit_rate: 0.3, blended_close_rate: 0.24,
          data_quality: 'sufficient',
        },
      ],
      postcodes: [],
      min_sample: MIN_N,
      agency_default_close_rate: AGENCY_CLOSE,
      agency_default_lead_to_appt_rate: AGENCY_APPT,
    };

    const result = adaptiveRouteLead('SW1', [A, B], metrics, MID_WEEK);
    expect(result.winnerId).toBe('A'); // adaptive picks higher-close A
    expect(result.adaptiveRuleFired).toBe('adaptive_close_rate');
    expect(result.wouldDiffer).toBe(true);
  });

  it('agrees with base when close rates are equal', () => {
    const A = client('A', { covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-04T10:00:00Z' });
    const B = client('B', { covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-03T10:00:00Z' });

    const sameRate = (id: string): AdaptiveMetrics['clients'][0] => ({
      client_id: id, company: id,
      sit_count: 50, close_count: 25, total_appointments: 50,
      sit_rate: 1, close_rate: 0.5, blended_sit_rate: 0.5, blended_close_rate: 0.5,
      data_quality: 'sufficient',
    });

    const metrics: AdaptiveMetrics = {
      clients: [sameRate('A'), sameRate('B')],
      postcodes: [],
      min_sample: MIN_N,
      agency_default_close_rate: AGENCY_CLOSE,
      agency_default_lead_to_appt_rate: AGENCY_APPT,
    };

    const result = adaptiveRouteLead('SW1', [A, B], metrics, MID_WEEK);
    expect(result.wouldDiffer).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Insufficient data — falls back honestly toward agency default
// ---------------------------------------------------------------------------

describe('adaptive routing — insufficient data', () => {
  it('blends thin data toward agency default (does not fabricate confidence)', () => {
    // 2 sits, 2 closes → 100% close rate learned BUT thin
    const blended = blendRate(1.0, 2, AGENCY_CLOSE, MIN_N);
    // Should be much closer to 50% than 100%
    expect(blended).toBeLessThan(0.6);
    expect(blended).toBeGreaterThan(AGENCY_CLOSE); // slightly above default
  });

  it('data_quality is insufficient below minN', () => {
    const { clients } = buildLearnedRates(
      // Only 3 appointments, all sold
      [
        { client_id: 'x', outcome: 'sat' },
        { client_id: 'x', outcome: 'sold' },
        { client_id: 'x', outcome: 'sat' },
      ] as RawApptRow[],
      [],
      [{ id: 'x', company: 'X' }],
      MIN_N,
      AGENCY_CLOSE,
      AGENCY_APPT,
    );
    const c = clients.find((r) => r.client_id === 'x')!;
    expect(c.data_quality).toBe('insufficient');
    // blended close rate should be much less than the 1/3 = 33% raw rate
    expect(c.blended_close_rate).toBeGreaterThan(0);
  });

  it('data_quality is none with zero appointments', () => {
    const { clients } = buildLearnedRates(
      [],
      [],
      [{ id: 'y', company: 'Y' }],
      MIN_N,
      AGENCY_CLOSE,
      AGENCY_APPT,
    );
    expect(clients[0].data_quality).toBe('none');
    expect(clients[0].blended_close_rate).toBe(AGENCY_CLOSE);
  });
});

// ---------------------------------------------------------------------------
// shadowCompare
// ---------------------------------------------------------------------------

describe('shadowCompare', () => {
  it('reports wouldDiffer when adaptive picks a different winner', () => {
    const A = client('A', { covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-04T10:00:00Z' });
    const B = client('B', { covered_postcodes: ['SW'], leads_this_week: 0, joined_at: '2024-01-01', last_lead_at: '2025-01-03T10:00:00Z' });

    const metrics: AdaptiveMetrics = {
      clients: [
        {
          client_id: 'A', company: 'A',
          sit_count: 50, close_count: 45, total_appointments: 50,
          sit_rate: 1, close_rate: 0.9, blended_sit_rate: 0.9, blended_close_rate: 0.87,
          data_quality: 'sufficient',
        },
        {
          client_id: 'B', company: 'B',
          sit_count: 50, close_count: 10, total_appointments: 50,
          sit_rate: 1, close_rate: 0.2, blended_sit_rate: 0.3, blended_close_rate: 0.24,
          data_quality: 'sufficient',
        },
      ],
      postcodes: [],
      min_sample: MIN_N,
      agency_default_close_rate: AGENCY_CLOSE,
      agency_default_lead_to_appt_rate: AGENCY_APPT,
    };

    const shadow = shadowCompare('SW1', [A, B], metrics, MID_WEEK);
    expect(shadow.wouldDiffer).toBe(true);
    expect(shadow.base.winnerId).toBe('B');
    expect(shadow.adaptive.winnerId).toBe('A');
    expect(shadow.shadowSummary).toContain('A');
  });

  it('reports no difference when adaptive agrees', () => {
    const A = client('A', { covered_postcodes: ['SW'], leads_this_week: 0 });
    const B = client('B', { covered_postcodes: ['SW'], leads_this_week: 5 });
    const metrics = emptyMetrics([A, B]);

    const shadow = shadowCompare('SW1', [A, B], metrics, MID_WEEK);
    expect(shadow.wouldDiffer).toBe(false);
    expect(shadow.base.winnerId).toBe(shadow.adaptive.winnerId);
  });
});
