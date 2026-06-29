// Adaptive routing layer — ADDITIVE only. Never modifies routeLead.
//
// SHADOW MODE (default, adaptive_routing_enabled = false):
//   Computes what the adaptive layer WOULD route, compares to the base
//   engine's decision, and surfaces the diff to the owner. Live routing
//   is completely unchanged.
//
// LIVE MODE (adaptive_routing_enabled = true):
//   Among candidates that are genuinely tied on the fairness rules
//   (rules 3 and 4 — newest_client and round_robin), prefer the client
//   whose reps actually close. The mandatory fairness rules (starvation
//   floor and most-behind) are NEVER overridden.
//
// Statistical honesty (shrinkage):
//   blendedRate = (sample * learned + minN * agencyDefault) / (sample + minN)
//   Below minN samples: labelled "insufficient", still used but heavily
//   pulled toward the agency default.

import {
  routeLead,
  fillPercent,
  weekBoundsUTC,
  STARVATION_FILL_THRESHOLD,
  STARVATION_TIME_THRESHOLD,
  type RoutingClient,
  type RoutingDecision,
  type RuleFired,
} from './routing';

// ---- Data quality label ----

export type DataQuality = 'sufficient' | 'insufficient' | 'none';

export function dataQuality(sample: number, minN: number): DataQuality {
  if (sample === 0) return 'none';
  if (sample < minN) return 'insufficient';
  return 'sufficient';
}

// ---- Shrinkage blending ----
// Pulls a thin learned rate toward the agency default so that 2–3 data
// points don't wildly swing routing.

export function blendRate(
  learned: number | null,
  sample: number,
  agencyDefault: number,
  minN: number,
): number {
  if (learned === null || sample === 0) return agencyDefault;
  return (sample * learned + minN * agencyDefault) / (sample + minN);
}

// ---- Learned-rate types ----

export type LearnedClientRate = {
  client_id: string;
  company: string;
  // sit = outcome sat or sold; close = outcome sold
  sit_count: number;       // appointments that sat or sold
  close_count: number;     // appointments sold
  total_appointments: number;
  sit_rate: number | null;   // null = no data
  close_rate: number | null;
  blended_sit_rate: number;
  blended_close_rate: number;
  data_quality: DataQuality; // based on close_count vs min_sample
};

export type LearnedPostcodeRate = {
  postcode_area: string;   // e.g. "SW", "GU2"
  lead_count: number;
  appt_count: number;
  sit_count: number;
  lead_to_appt_rate: number | null;
  sit_rate: number | null;
  blended_lead_to_appt_rate: number;
  data_quality: DataQuality; // based on lead_count vs min_sample
};

export type AdaptiveMetrics = {
  clients: LearnedClientRate[];
  postcodes: LearnedPostcodeRate[];
  min_sample: number;
  agency_default_close_rate: number;    // from settings (lead_to_appt_rate × typical close)
  agency_default_lead_to_appt_rate: number;
};

// ---- Adaptive rule label ----

export type AdaptiveRuleFired = RuleFired | 'adaptive_close_rate';

export type AdaptiveRoutingDecision = RoutingDecision & {
  adaptiveRuleFired: AdaptiveRuleFired;
  adaptiveReason: string;
  wouldDiffer: boolean;   // true when adaptive picks a different winner than base
  clientRates: Record<string, { blended_close_rate: number; data_quality: DataQuality }>;
};

// ---- Core: adaptive routeLead ----
//
// Mandatory rules (1 = starvation, 2 = most_behind) fire identically to the
// base engine. Only tie-break rules (3 = newest_client, 4 = round_robin) are
// eligible for adaptive override.

export function adaptiveRouteLead(
  postcode: string,
  clients: RoutingClient[],
  metrics: AdaptiveMetrics,
  now: Date = new Date(),
): AdaptiveRoutingDecision {
  const base = routeLead(postcode, clients, now);

  // Build per-client rate lookup
  const rateMap: Record<string, LearnedClientRate> = {};
  for (const r of metrics.clients) rateMap[r.client_id] = r;

  const clientRates: Record<string, { blended_close_rate: number; data_quality: DataQuality }> = {};
  for (const c of clients) {
    const r = rateMap[c.id];
    clientRates[c.id] = {
      blended_close_rate: r?.blended_close_rate ?? metrics.agency_default_close_rate,
      data_quality: r?.data_quality ?? 'none',
    };
  }

  // Adaptive only applies to genuine tie-breaks
  const isTiebreak =
    base.ruleFired === 'newest_client' || base.ruleFired === 'round_robin';

  if (!isTiebreak || base.considered.length <= 1) {
    return {
      ...base,
      adaptiveRuleFired: base.ruleFired as AdaptiveRuleFired,
      adaptiveReason:
        base.ruleFired === 'no_candidates'
          ? 'No eligible clients — nothing to route.'
          : base.ruleFired === 'starvation'
          ? 'Starvation floor is mandatory — adaptive does not override it.'
          : base.ruleFired === 'most_behind'
          ? 'Clear winner on promise-fill — adaptive tie-break not needed.'
          : 'Adaptive not applicable here.',
      wouldDiffer: false,
      clientRates,
    };
  }

  // Among the tied candidates, find the highest blended close rate.
  // If the base winner shares that top score, defer to the base (no change).
  const maxScore = Math.max(
    ...base.considered.map((c) => clientRates[c.id]?.blended_close_rate ?? 0),
  );
  const topTied = base.considered.filter(
    (c) => Math.abs((clientRates[c.id]?.blended_close_rate ?? 0) - maxScore) < 1e-9,
  );

  const baseWinnerId = base.winnerId;

  // If the base winner is already in the top-scored group, adaptive agrees.
  if (topTied.some((c) => c.id === baseWinnerId)) {
    const winnerInfo = clientRates[baseWinnerId!] ?? { blended_close_rate: maxScore, data_quality: 'none' as DataQuality };
    const learnedR = rateMap[baseWinnerId!];
    const ratePct = (winnerInfo.blended_close_rate * 100).toFixed(0);
    return {
      ...base,
      adaptiveRuleFired: 'adaptive_close_rate',
      adaptiveReason: `Adaptive agrees — ${base.winnerCompany ?? '—'} is among the top close-rate candidates (${ratePct}%, ${winnerInfo.data_quality === 'sufficient' ? `${learnedR?.close_count ?? 0} sits` : 'thin data'}).`,
      wouldDiffer: false,
      clientRates,
    };
  }

  // Pick the single top-rated candidate (arbitrary if still tied — fine, no worse than base)
  const winner = topTied[0];
  const wouldDiffer = winner.id !== baseWinnerId;

  const winnerInfo = clientRates[winner.id];
  const learnedR = rateMap[winner.id];
  const ratePct = (winnerInfo.blended_close_rate * 100).toFixed(0);
  const qualNote =
    winnerInfo.data_quality === 'sufficient'
      ? `${ratePct}% close rate from ${learnedR?.close_count ?? 0} sits`
      : winnerInfo.data_quality === 'insufficient'
      ? `${ratePct}% estimated (thin data — ${learnedR?.close_count ?? 0} sits, blended toward agency default)`
      : `${ratePct}% estimated (no data — using agency default)`;

  const adaptiveReason = wouldDiffer
    ? `Adaptive tie-break: ${winner.company} has the highest blended close rate (${qualNote}) among the ${base.considered.length} tied candidates.`
    : `Adaptive agrees with the base tie-break — ${winner.company} wins either way (${qualNote}).`;

  return {
    ...base,
    winnerId: winner.id,
    winnerCompany: winner.company,
    adaptiveRuleFired: 'adaptive_close_rate',
    adaptiveReason,
    wouldDiffer,
    clientRates,
  };
}

// ---- Shadow comparison ----
// Returns what the base engine decided AND what adaptive would decide,
// without changing anything. Safe to call always.

export type ShadowComparison = {
  postcode: string;
  base: RoutingDecision;
  adaptive: AdaptiveRoutingDecision;
  wouldDiffer: boolean;
  shadowSummary: string;
};

export function shadowCompare(
  postcode: string,
  clients: RoutingClient[],
  metrics: AdaptiveMetrics,
  now: Date = new Date(),
): ShadowComparison {
  const base = routeLead(postcode, clients, now);
  const adaptive = adaptiveRouteLead(postcode, clients, metrics, now);
  const wouldDiffer = base.winnerId !== adaptive.winnerId;

  const shadowSummary = wouldDiffer
    ? `Shadow: adaptive would route to ${adaptive.winnerCompany ?? '—'} (not ${base.winnerCompany ?? '—'}). ${adaptive.adaptiveReason}`
    : `Shadow: adaptive agrees — ${base.winnerCompany ?? '—'} wins under both rules. ${adaptive.adaptiveReason}`;

  return { postcode, base, adaptive, wouldDiffer, shadowSummary };
}

// ---- Postcode area extraction ----
// "SW1A 1AA" → "SW", "GU2 8AA" → "GU"

export function postcodeArea(postcode: string): string {
  const p = postcode.trim().toUpperCase().replace(/\s+/g, '');
  const m = p.match(/^([A-Z]{1,2})/);
  return m ? m[1] : '';
}

// ---- Build learned rates from raw data ----
// Called by lib/adaptive-data.ts which does the DB queries.

export type RawApptRow = {
  client_id: string;
  outcome: string;       // 'booked' | 'sat' | 'sold' | 'no_show'
};

export type RawLeadRow = {
  client_id: string | null;
  postcode: string | null;
  status: string;        // 'new'|'contacted'|'qualified'|'booked'|'disqualified'
  has_appointment: boolean;
  appointment_outcome: string | null;
};

export function buildLearnedRates(
  appts: RawApptRow[],
  leads: RawLeadRow[],
  clientList: { id: string; company: string }[],
  minSample: number,
  agencyDefaultCloseRate: number,
  agencyDefaultLeadToApptRate: number,
): { clients: LearnedClientRate[]; postcodes: LearnedPostcodeRate[] } {
  // ---- Per-client ----
  const clientMap: Record<string, { sit: number; close: number; total: number }> = {};
  for (const a of appts) {
    if (!clientMap[a.client_id]) clientMap[a.client_id] = { sit: 0, close: 0, total: 0 };
    clientMap[a.client_id].total++;
    if (a.outcome === 'sat' || a.outcome === 'sold') clientMap[a.client_id].sit++;
    if (a.outcome === 'sold') clientMap[a.client_id].close++;
  }

  const clients: LearnedClientRate[] = clientList.map((c) => {
    const d = clientMap[c.id] ?? { sit: 0, close: 0, total: 0 };
    const sit_rate = d.sit > 0 ? d.sit / Math.max(d.total, 1) : null;
    const close_rate = d.total > 0 ? d.close / d.sit || 0 : null;
    // Use close_count (not total) as the meaningful sample — we want enough sat appts
    const effectiveSample = d.sit;
    return {
      client_id: c.id,
      company: c.company,
      sit_count: d.sit,
      close_count: d.close,
      total_appointments: d.total,
      sit_rate: d.total > 0 ? d.sit / d.total : null,
      close_rate: d.sit > 0 ? d.close / d.sit : null,
      blended_sit_rate: blendRate(sit_rate, d.total, agencyDefaultLeadToApptRate, minSample),
      blended_close_rate: blendRate(
        d.sit > 0 ? d.close / d.sit : null,
        effectiveSample,
        agencyDefaultCloseRate,
        minSample,
      ),
      data_quality: dataQuality(effectiveSample, minSample),
    };
  });

  // ---- Per-postcode ----
  const areaMap: Record<string, { leads: number; appts: number; sits: number }> = {};
  for (const l of leads) {
    if (!l.postcode || l.status === 'disqualified') continue;
    const area = postcodeArea(l.postcode);
    if (!area) continue;
    if (!areaMap[area]) areaMap[area] = { leads: 0, appts: 0, sits: 0 };
    areaMap[area].leads++;
    if (l.has_appointment) {
      areaMap[area].appts++;
      if (l.appointment_outcome === 'sat' || l.appointment_outcome === 'sold') {
        areaMap[area].sits++;
      }
    }
  }

  const postcodes: LearnedPostcodeRate[] = Object.entries(areaMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, d]) => {
      const lead_to_appt_rate = d.leads > 0 ? d.appts / d.leads : null;
      const sit_rate = d.appts > 0 ? d.sits / d.appts : null;
      return {
        postcode_area: area,
        lead_count: d.leads,
        appt_count: d.appts,
        sit_count: d.sits,
        lead_to_appt_rate,
        sit_rate,
        blended_lead_to_appt_rate: blendRate(lead_to_appt_rate, d.leads, agencyDefaultLeadToApptRate, minSample),
        data_quality: dataQuality(d.leads, minSample),
      };
    });

  return { clients, postcodes };
}
