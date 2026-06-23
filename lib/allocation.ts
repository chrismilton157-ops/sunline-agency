// Sunline Phase 7: shared-campaign cost allocation.
//
// A campaign may be REGIONAL — one Sunline-owned campaign serving several
// clients whose covered postcodes overlap. We record the campaign's real
// monthly ad spend (Meta) and split it across the clients who actually
// received assigned leads from that campaign in the period, in proportion
// to the number of leads each received.
//
// All money calculations live here as PURE functions — no I/O, no clock.

import type { Appointment } from './types';
import {
  appointmentsInPeriod,
  computeInvoice,
  DEFAULT_MANAGEMENT_MARKUP_PCT,
  type InvoiceBreakdown,
} from './billing';

// ---- allocation basis ----
// Today's rule: split by the number of leads ACTUALLY DELIVERED to each
// client by the campaign in the period. Future option: switch to
// 'by_promised_volume' (split by weekly_promise of covering clients) so
// that an under-delivery doesn't reward / penalise a client unfairly.
// Keep this in one place — flipping it later is a one-line change here
// plus updating allocateCampaignSpend's `basis` branch.
export type AllocationBasis = 'by_leads_delivered' | 'by_promised_volume';
export const ALLOCATION_BASIS: AllocationBasis = 'by_leads_delivered';

// ---- types ----
export type CampaignSpend = {
  campaign_id: string;
  period: string; // YYYY-MM
  amount: number;
};

export type LeadForAllocation = {
  campaign_id: string | null;
  client_id: string | null; // NULL = unassigned / disqualified, not billed
  created_at: string;       // ISO; YYYY-MM prefix used to bucket into period
};

// One row per campaign × period: how that spend was split.
export type CampaignAllocation = {
  campaign_id: string;
  period: string;
  total_spend: number;
  total_assigned_leads: number;            // sum across receiving clients
  per_client: { client_id: string; leads: number; share_pct: number; amount: number }[];
  unallocated_amount: number;              // spend with zero assigned leads
};

// Aggregated to one row per client × period across every campaign they
// received leads from. This is what feeds into computeInvoice.
export type ClientPeriodAllocation = {
  client_id: string;
  period: string;
  allocated_spend: number;
  from_campaigns: { campaign_id: string; leads: number; amount: number }[];
};

// ---- core allocation ----

// Allocate one campaign's spend in one period across the clients who
// received assigned leads from it that period.
export function allocateCampaignSpend(
  campaign_id: string,
  period: string,
  total_spend: number,
  leads: LeadForAllocation[],
): CampaignAllocation {
  const periodLeads = leads.filter(
    (l) => l.campaign_id === campaign_id && l.created_at.startsWith(period),
  );
  const assigned = periodLeads.filter((l) => l.client_id != null);

  const byClient = new Map<string, number>();
  for (const l of assigned) {
    byClient.set(l.client_id!, (byClient.get(l.client_id!) ?? 0) + 1);
  }
  const total_assigned_leads = assigned.length;

  if (total_assigned_leads === 0) {
    return {
      campaign_id,
      period,
      total_spend: round2(total_spend),
      total_assigned_leads: 0,
      per_client: [],
      unallocated_amount: round2(total_spend),
    };
  }

  const entries = Array.from(byClient.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  let allocated = 0;
  const per_client = entries.map(([client_id, leadCount], idx) => {
    // Last client soaks any rounding so the total matches to the penny.
    const isLast = idx === entries.length - 1;
    const sharePct = leadCount / total_assigned_leads;
    const raw = total_spend * sharePct;
    const amount = isLast
      ? round2(total_spend - allocated)
      : round2(raw);
    allocated = round2(allocated + amount);
    return {
      client_id,
      leads: leadCount,
      share_pct: sharePct,
      amount,
    };
  });

  return {
    campaign_id,
    period,
    total_spend: round2(total_spend),
    total_assigned_leads,
    per_client,
    unallocated_amount: 0,
  };
}

// Roll every campaign's allocation in a period into one row per client.
export function rollUpByClient(
  allocations: CampaignAllocation[],
): ClientPeriodAllocation[] {
  const map = new Map<string, ClientPeriodAllocation>();
  for (const a of allocations) {
    for (const pc of a.per_client) {
      const key = `${pc.client_id}::${a.period}`;
      const existing = map.get(key) ?? {
        client_id: pc.client_id,
        period: a.period,
        allocated_spend: 0,
        from_campaigns: [],
      };
      existing.allocated_spend = round2(existing.allocated_spend + pc.amount);
      existing.from_campaigns.push({
        campaign_id: a.campaign_id,
        leads: pc.leads,
        amount: pc.amount,
      });
      map.set(key, existing);
    }
  }
  return Array.from(map.values());
}

// Convenience: compute invoice for one client using their allocated spend
// (from rollUpByClient) plus the period's appointments. Just a thin wrapper
// around lib/billing.computeInvoice so callers don't duplicate the bridge.
export function computeInvoiceWithAllocation(input: {
  allocated_spend: number;
  management_markup_pct: number | null | undefined;
  per_sit_fee: number;
  appointments_in_period: Appointment[];
}): InvoiceBreakdown {
  return computeInvoice({
    ad_spend_monthly: input.allocated_spend,
    management_markup_pct:
      input.management_markup_pct ?? DEFAULT_MANAGEMENT_MARKUP_PCT,
    per_sit_fee: input.per_sit_fee,
    appointments_in_period: input.appointments_in_period,
  });
}

export { appointmentsInPeriod };

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
