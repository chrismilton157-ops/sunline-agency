import { describe, it, expect } from 'vitest';
import {
  allocateCampaignSpend,
  rollUpByClient,
  computeInvoiceWithAllocation,
  type LeadForAllocation,
} from '../lib/allocation';
import type { Appointment } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lead(client_id: string | null, campaign_id = 'camp-1', created_at = '2025-06-10T10:00:00Z'): LeadForAllocation {
  return { campaign_id, client_id, created_at };
}

function appt(outcome: Appointment['outcome']): Appointment {
  return {
    id: 'a', client_id: 'c1', lead_id: 'l1',
    appt_date: '2025-06-01', setter: null, setter_id: null,
    sale_value: null, invoiced: false, quality_rating: null,
    quality_reason: null, confirmed_at: null, outcome,
  };
}

// ---------------------------------------------------------------------------
// allocateCampaignSpend — basic split
// ---------------------------------------------------------------------------

describe('allocateCampaignSpend — basic split', () => {
  it('splits spend proportionally when two clients receive equal leads', () => {
    const leads = [lead('c1'), lead('c2')];
    const result = allocateCampaignSpend('camp-1', '2025-06', 1000, leads);
    expect(result.total_spend).toBe(1000);
    expect(result.total_assigned_leads).toBe(2);

    const c1 = result.per_client.find((p) => p.client_id === 'c1')!;
    const c2 = result.per_client.find((p) => p.client_id === 'c2')!;
    expect(c1.amount).toBe(500);
    expect(c2.amount).toBe(500);
    expect(c1.share_pct).toBeCloseTo(0.5);
  });

  it('allocates spend by lead share when clients receive unequal leads', () => {
    // c1 gets 3, c2 gets 1 → 75%/25%
    const leads = [lead('c1'), lead('c1'), lead('c1'), lead('c2')];
    const result = allocateCampaignSpend('camp-1', '2025-06', 1000, leads);
    const c1 = result.per_client.find((p) => p.client_id === 'c1')!;
    const c2 = result.per_client.find((p) => p.client_id === 'c2')!;
    expect(c1.amount).toBe(750);
    expect(c2.amount).toBe(250);
  });

  it('total allocated amounts sum exactly to spend (no floating-point drift)', () => {
    // Tricky: 1000 / 3 = 333.333…
    const leads = [lead('c1'), lead('c2'), lead('c3')];
    const result = allocateCampaignSpend('camp-1', '2025-06', 1000, leads);
    const total = result.per_client.reduce((s, p) => s + p.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(1000);
  });

  it('unallocated_amount is 0 when all leads are assigned', () => {
    const leads = [lead('c1'), lead('c2')];
    const result = allocateCampaignSpend('camp-1', '2025-06', 500, leads);
    expect(result.unallocated_amount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// allocateCampaignSpend — zero assigned leads
// ---------------------------------------------------------------------------

describe('allocateCampaignSpend — unallocated spend', () => {
  it('full spend is unallocated when no leads were assigned', () => {
    const result = allocateCampaignSpend('camp-1', '2025-06', 800, []);
    expect(result.unallocated_amount).toBe(800);
    expect(result.per_client).toHaveLength(0);
    expect(result.total_assigned_leads).toBe(0);
  });

  it('disqualified leads (client_id null) do not count toward allocation', () => {
    const leads = [lead(null), lead(null)]; // both unassigned/disqualified
    const result = allocateCampaignSpend('camp-1', '2025-06', 500, leads);
    expect(result.unallocated_amount).toBe(500);
    expect(result.per_client).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// allocateCampaignSpend — period filtering
// ---------------------------------------------------------------------------

describe('allocateCampaignSpend — period isolation', () => {
  it('only counts leads from the matching period', () => {
    const leads = [
      lead('c1', 'camp-1', '2025-05-31T23:59:00Z'), // May — excluded
      lead('c1', 'camp-1', '2025-06-01T00:00:00Z'), // June — included
      lead('c2', 'camp-1', '2025-07-01T00:00:00Z'), // July — excluded
    ];
    const result = allocateCampaignSpend('camp-1', '2025-06', 1000, leads);
    expect(result.total_assigned_leads).toBe(1);
    expect(result.per_client).toHaveLength(1);
    expect(result.per_client[0].client_id).toBe('c1');
    expect(result.per_client[0].amount).toBe(1000);
  });

  it('only counts leads from the matching campaign', () => {
    const leads = [
      lead('c1', 'camp-A', '2025-06-01T00:00:00Z'),
      lead('c2', 'camp-B', '2025-06-01T00:00:00Z'), // different campaign
    ];
    const result = allocateCampaignSpend('camp-A', '2025-06', 1000, leads);
    expect(result.per_client).toHaveLength(1);
    expect(result.per_client[0].client_id).toBe('c1');
  });
});

// ---------------------------------------------------------------------------
// rollUpByClient
// ---------------------------------------------------------------------------

describe('rollUpByClient', () => {
  it('sums spend across multiple campaigns for the same client-period', () => {
    const allocations = [
      allocateCampaignSpend('camp-A', '2025-06', 600, [lead('c1', 'camp-A')]),
      allocateCampaignSpend('camp-B', '2025-06', 400, [lead('c1', 'camp-B')]),
    ];
    const rolled = rollUpByClient(allocations);
    expect(rolled).toHaveLength(1);
    expect(rolled[0].allocated_spend).toBe(1000);
    expect(rolled[0].from_campaigns).toHaveLength(2);
  });

  it('keeps separate rows for different clients in the same period', () => {
    const allocation = allocateCampaignSpend('camp-1', '2025-06', 1000, [lead('c1'), lead('c2')]);
    const rolled = rollUpByClient([allocation]);
    expect(rolled).toHaveLength(2);
  });

  it('keeps separate rows for the same client in different periods', () => {
    const a1 = allocateCampaignSpend('camp-1', '2025-05', 500, [lead('c1', 'camp-1', '2025-05-15T00:00:00Z')]);
    const a2 = allocateCampaignSpend('camp-1', '2025-06', 500, [lead('c1', 'camp-1', '2025-06-15T00:00:00Z')]);
    const rolled = rollUpByClient([a1, a2]);
    expect(rolled).toHaveLength(2);
    expect(rolled.map((r) => r.period).sort()).toEqual(['2025-05', '2025-06']);
  });
});

// ---------------------------------------------------------------------------
// computeInvoiceWithAllocation — integration
// ---------------------------------------------------------------------------

describe('computeInvoiceWithAllocation', () => {
  it('uses DEFAULT_MANAGEMENT_MARKUP_PCT (20%) when markup is null', () => {
    const r = computeInvoiceWithAllocation({
      allocated_spend: 1000,
      management_markup_pct: null,
      per_sit_fee: 0,
      appointments_in_period: [],
    });
    // 1000 + 20% = 1200
    expect(r.advertising_management).toBe(1200);
  });

  it('uses the provided markup when given', () => {
    const r = computeInvoiceWithAllocation({
      allocated_spend: 1000,
      management_markup_pct: 10,
      per_sit_fee: 0,
      appointments_in_period: [],
    });
    expect(r.advertising_management).toBe(1100);
  });

  it('adds appointment fees from billable outcomes', () => {
    const r = computeInvoiceWithAllocation({
      allocated_spend: 0,
      management_markup_pct: 20,
      per_sit_fee: 50,
      appointments_in_period: [appt('sat'), appt('sold'), appt('no_show'), appt('booked')],
    });
    // 3 billable × £50 = £150
    expect(r.appointment_fees).toBe(150);
    expect(r.appointment_count).toBe(3);
  });
});
