import type { Appointment, Client, Lead } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Whole months from joined date to `now`, minimum 1.
export function monthsActive(joinedAt: string, now: Date = new Date()): number {
  const j = new Date(`${joinedAt}T00:00:00Z`);
  let m =
    (now.getUTCFullYear() - j.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - j.getUTCMonth());
  if (now.getUTCDate() < j.getUTCDate()) m -= 1;
  return Math.max(1, m);
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const safe = (num: number, den: number): number | null =>
  den > 0 ? num / den : null;

// ---------- per-client metrics ----------

export type ClientMetrics = {
  client: Client;
  monthsActive: number;

  appointments: number;
  occurred: number;       // appointments that aren't still 'booked'
  bookedPending: number;  // appointments still 'booked'
  sits: number;
  sold: number;
  noShows: number;

  sitRate: number | null;
  closeRate: number | null;
  avgJobValue: number | null;
  speedToLead: number | null;     // median response_mins
  qualityScore: number | null;    // 0..1

  // client-facing money
  clientPaid: number;
  costPerAppointment: number | null;
  costPerSale: number | null;
  revenueGenerated: number;
  roi: number | null;

  // agency-only (NEVER shown to clients)
  myRevenue: number;
  myCost: number;
  marginPerSit: number | null;
  unbilledSits: number;            // £ value, not count

  // risk
  daysSinceLastSale: number | null;
};

type OverheadInputs = {
  // total monthly overhead (setter + tooling) split across clients by share of sits
  monthlyOverhead: number;
  totalSitsAcrossPortfolio: number;
};

export function clientMetrics(
  client: Client,
  appts: Appointment[],
  leads: Lead[],
  overhead: OverheadInputs,
  now: Date = new Date(),
): ClientMetrics {
  const ma = monthsActive(client.joined_at, now);

  const occurred = appts.filter((a) => a.outcome !== 'booked');
  const sitsList = appts.filter((a) => a.outcome === 'sat' || a.outcome === 'sold');
  const soldList = appts.filter((a) => a.outcome === 'sold');
  const noShows = appts.filter((a) => a.outcome === 'no_show').length;
  const bookedPending = appts.filter((a) => a.outcome === 'booked').length;

  const sits = sitsList.length;
  const sold = soldList.length;

  const sitRate = safe(sits, occurred.length);
  const closeRate = safe(sold, sits);

  const totalSaleValue = soldList.reduce(
    (sum, a) => sum + (a.sale_value ?? 0),
    0,
  );
  const avgJobValue = safe(totalSaleValue, sold);

  const responseMins = leads
    .map((l) => l.response_mins)
    .filter((v): v is number => v != null);
  const speedToLead = median(responseMins);

  const ups = appts.filter((a) => a.quality_rating === 'up').length;
  const downs = appts.filter((a) => a.quality_rating === 'down').length;
  const qualityScore = safe(ups, ups + downs);

  // money
  const clientPaid = client.retainer * ma + sits * client.per_sit_fee;
  const costPerAppointment = safe(clientPaid, sits);
  const costPerSale = safe(clientPaid, sold);
  const revenueGenerated = totalSaleValue;
  const roi = safe(revenueGenerated, clientPaid);

  // agency-only
  const myRevenue = clientPaid; // identical formula by Phase 2 spec
  const overheadShare =
    overhead.totalSitsAcrossPortfolio > 0
      ? overhead.monthlyOverhead * ma * (sits / overhead.totalSitsAcrossPortfolio)
      : overhead.monthlyOverhead * ma;
  const adSpend = client.ad_spend_monthly * ma;
  const myCost = adSpend + overheadShare;
  const marginPerSit = safe(myRevenue - myCost, sits);

  const unbilledSitsCount = sitsList.filter((a) => !a.invoiced).length;
  const unbilledSits = unbilledSitsCount * client.per_sit_fee;

  // days since last sale
  const lastSale = soldList
    .map((a) => new Date(a.appt_date).getTime())
    .sort((a, b) => b - a)[0];
  const daysSinceLastSale =
    lastSale == null ? null : Math.floor((now.getTime() - lastSale) / DAY_MS);

  return {
    client,
    monthsActive: ma,
    appointments: appts.length,
    occurred: occurred.length,
    bookedPending,
    sits,
    sold,
    noShows,
    sitRate,
    closeRate,
    avgJobValue,
    speedToLead,
    qualityScore,
    clientPaid,
    costPerAppointment,
    costPerSale,
    revenueGenerated,
    roi,
    myRevenue,
    myCost,
    marginPerSit,
    unbilledSits,
    daysSinceLastSale,
  };
}

// ---------- portfolio-wide ----------

export type Portfolio = {
  activeClients: number;
  sitsThisMonth: number;
  myRevenue: number;
  marginPerSit: number | null;
  unbilledSits: number;
  revenueConcentration: number | null; // 0..1
  speedToLead: number | null;          // median across all consented leads
  netMargin: number;

  pipelineValue: number;
  totalRevenue: number;

  // benchmarks used for reps-flag
  portfolioSitRate: number | null;
  portfolioCloseRate: number | null;
  portfolioAvgJobValue: number | null;
};

export function portfolio(
  clients: Client[],
  perClient: ClientMetrics[],
  appts: Appointment[],
  leads: Lead[],
  monthlyOverhead: number,
  now: Date = new Date(),
): Portfolio {
  const activeClients = clients.filter((c) => c.status === 'active').length;

  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}`;
  const sitsThisMonth = appts.filter(
    (a) =>
      (a.outcome === 'sat' || a.outcome === 'sold') &&
      a.appt_date.startsWith(ym),
  ).length;

  const myRevenue = perClient.reduce((s, m) => s + m.myRevenue, 0);
  const totalSits = perClient.reduce((s, m) => s + m.sits, 0);
  const totalAdSpend = perClient.reduce(
    (s, m) => s + m.client.ad_spend_monthly * m.monthsActive,
    0,
  );
  const totalOverhead = perClient.reduce(
    (s, m) => s + monthlyOverhead * m.monthsActive,
    0,
  );
  const myCostTotal = perClient.reduce((s, m) => s + m.myCost, 0);
  const marginPerSit = safe(myRevenue - myCostTotal, totalSits);
  const unbilledSits = perClient.reduce((s, m) => s + m.unbilledSits, 0);

  const totalRevenue = perClient.reduce((s, m) => s + m.revenueGenerated, 0);
  const biggest = perClient
    .map((m) => m.revenueGenerated)
    .sort((a, b) => b - a)[0] ?? 0;
  const revenueConcentration =
    totalRevenue > 0 ? biggest / totalRevenue : null;

  const allResponseMins = leads
    .map((l) => l.response_mins)
    .filter((v): v is number => v != null);
  const speedToLead = median(allResponseMins);

  const netMargin = myRevenue - totalAdSpend - totalOverhead;

  // portfolio benchmarks (for reps-flag / fallback)
  const totalOccurred = perClient.reduce((s, m) => s + m.occurred, 0);
  const totalSold = perClient.reduce((s, m) => s + m.sold, 0);
  const totalSaleValue = perClient.reduce((s, m) => s + m.revenueGenerated, 0);
  const portfolioSitRate = safe(totalSits, totalOccurred);
  const portfolioCloseRate = safe(totalSold, totalSits);
  const portfolioAvgJobValue = safe(totalSaleValue, totalSold);

  // pipeline forecast across portfolio
  const pipelineValue = perClient.reduce(
    (s, m) =>
      s +
      pipelineForClient(m, {
        portfolioSitRate,
        portfolioCloseRate,
        portfolioAvgJobValue,
      }),
    0,
  );

  return {
    activeClients,
    sitsThisMonth,
    myRevenue,
    marginPerSit,
    unbilledSits,
    revenueConcentration,
    speedToLead,
    netMargin,
    pipelineValue,
    totalRevenue,
    portfolioSitRate,
    portfolioCloseRate,
    portfolioAvgJobValue,
  };
}

export type PortfolioBenchmarks = {
  portfolioSitRate: number | null;
  portfolioCloseRate: number | null;
  portfolioAvgJobValue: number | null;
};

// Per-client pipeline value, with portfolio fallback.
export function pipelineForClient(
  m: ClientMetrics,
  pf: PortfolioBenchmarks,
): number {
  const sitRate = m.sitRate ?? pf.portfolioSitRate ?? 0.65;
  const closeRate = m.closeRate ?? pf.portfolioCloseRate ?? 0.28;
  const avg = m.avgJobValue ?? pf.portfolioAvgJobValue ?? 0;
  return m.bookedPending * sitRate * closeRate * avg;
}

// ---------- flags & health ----------

export type Health = {
  score: number;
  band: 'Healthy' | 'Watch' | 'At risk';
  reasons: string[];
};

export function repsFlag(
  m: ClientMetrics,
  pf: PortfolioBenchmarks,
): boolean {
  if (m.sits < 6) return false;
  if (m.closeRate == null) return false;
  if (pf.portfolioCloseRate == null) return false;
  return m.closeRate < 0.7 * pf.portfolioCloseRate;
}

export function healthScore(
  m: ClientMetrics,
  pf: PortfolioBenchmarks,
): Health {
  let score = 100;
  const reasons: string[] = [];

  const d = m.daysSinceLastSale;
  if (d == null || d >= 35) {
    score -= 50;
    reasons.push(d == null ? 'no sale on record' : `${d} days since last sale`);
  } else if (d >= 21) {
    score -= 28;
    reasons.push(`${d} days since last sale`);
  }

  if (m.roi != null && m.roi < 2) {
    score -= 20;
    reasons.push('ROI below 2×');
  }

  if (m.sitRate != null && m.sitRate < 0.6) {
    score -= 14;
    reasons.push('sit rate below 60%');
  }

  if (repsFlag(m, pf)) {
    score -= 16;
    reasons.push('reps-flagged: close rate < 70% of portfolio avg');
  }

  const clamped = Math.max(0, Math.min(100, score));
  const band: Health['band'] =
    clamped >= 75 ? 'Healthy' : clamped >= 50 ? 'Watch' : 'At risk';

  return { score: clamped, band, reasons };
}

// ---------- monthly bucketing for charts ----------

export type MonthBar = { ym: string; sat: number; sold: number };

export function monthlySatVsSold(appts: Appointment[]): MonthBar[] {
  const map = new Map<string, MonthBar>();
  for (const a of appts) {
    if (a.outcome !== 'sat' && a.outcome !== 'sold') continue;
    const ym = a.appt_date.slice(0, 7);
    if (!map.has(ym)) map.set(ym, { ym, sat: 0, sold: 0 });
    const bar = map.get(ym)!;
    if (a.outcome === 'sat') bar.sat += 1;
    else bar.sold += 1;
  }
  return [...map.values()].sort((a, b) => (a.ym < b.ym ? -1 : 1));
}

// Quality-flag reasons summary
export function flagReasons(appts: Appointment[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of appts) {
    if (a.quality_rating !== 'down') continue;
    const reason = a.quality_reason?.trim() || 'unspecified';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

// Default monthly overhead used across the app. Tweak in one place.
export const MONTHLY_OVERHEAD = 1200;
