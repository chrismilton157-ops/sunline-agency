import type { Appointment, Client } from './types';

export type ChurnBand = 'Healthy' | 'Watch' | 'At risk' | 'Too new';

export type ChurnInputs = {
  weeks_active: number;
  total_sits: number;
  close_rate_recent: number | null;   // last 4 weeks
  close_rate_prior: number | null;    // 4–8 weeks ago
  no_show_rate_recent: number | null; // last 4 weeks
  delivery_pct_recent: number | null; // leads delivered / (weekly_promise × 4)
  days_since_portal_login: number | null;
  flagged_recent: number;   // down-rated appointments in last 4 weeks
  occurred_recent: number;  // appointments that happened in last 4 weeks
  roi_overall: number | null;
};

export type ChurnRiskResult = {
  client: Client;
  sufficient_data: boolean;
  score: number;       // 0–100, higher = more churn risk
  band: ChurnBand;
  reasons: string[];   // plain-English explanations, worst first
  inputs: ChurnInputs; // raw numbers for transparency / sanity-check
};

// All scoring weights in one place — owner-tunable later.
export const CHURN_WEIGHTS = {
  close_rate_falling: 25, // close rate deteriorating ≥12 pp in 4 weeks
  close_rate_low: 15,     // close rate < 25% (no comparison available)
  no_show_high: 20,       // recent no-show rate > 30%
  delivery_shortfall: 20, // delivered < 70% of weekly promise over 4 weeks
  portal_stale_30d: 15,   // no portal login in 30+ days
  portal_stale_14d: 8,    // no portal login in 14–29 days
  quality_flags: 10,      // ≥25% of recent appointments rated down
  roi_low: 10,            // overall ROI < 1.5×
} as const;

// Sufficiency gates — below these values a client is "too new to assess".
export const CHURN_MIN_WEEKS = 6;
export const CHURN_MIN_SITS = 5;

// Risk thresholds
const CLOSE_DROP_PP = 0.12;           // 12 pp drop triggers the falling flag
const CLOSE_LOW = 0.25;
const NO_SHOW_HIGH = 0.30;
const DELIVERY_LOW = 0.70;
const FLAG_RATE_HIGH = 0.25;
const ROI_LOW = 1.5;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const safe = (num: number, den: number): number | null => (den > 0 ? num / den : null);
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function computeChurnRisk(
  client: Client,
  appts: Appointment[],
  clientLeads: { client_id: string; created_at: string }[],
  portalLogins: { occurred_at: string }[],
  now: Date = new Date(),
): ChurnRiskResult {
  const joinDate = new Date(`${client.joined_at}T00:00:00Z`);
  const msActive = now.getTime() - joinDate.getTime();
  const weeks_active = Math.floor(msActive / WEEK_MS);
  const total_sits = appts.filter(
    (a) => a.outcome === 'sat' || a.outcome === 'sold',
  ).length;

  // Data sufficiency check — don't flag new clients as at-risk.
  const sufficient_data = weeks_active >= CHURN_MIN_WEEKS && total_sits >= CHURN_MIN_SITS;

  if (!sufficient_data) {
    const insufficientReason =
      weeks_active < CHURN_MIN_WEEKS
        ? `Only ${weeks_active} week${weeks_active !== 1 ? 's' : ''} of data — need at least ${CHURN_MIN_WEEKS} weeks before risk can be assessed`
        : `Only ${total_sits} sit${total_sits !== 1 ? 's' : ''} recorded — need at least ${CHURN_MIN_SITS} to assess risk`;
    return {
      client,
      sufficient_data: false,
      score: 0,
      band: 'Too new',
      reasons: [insufficientReason],
      inputs: {
        weeks_active,
        total_sits,
        close_rate_recent: null,
        close_rate_prior: null,
        no_show_rate_recent: null,
        delivery_pct_recent: null,
        days_since_portal_login: null,
        flagged_recent: 0,
        occurred_recent: 0,
        roi_overall: null,
      },
    };
  }

  // Time windows
  const recentCutoff = new Date(now.getTime() - 4 * WEEK_MS);
  const priorCutoff = new Date(now.getTime() - 8 * WEEK_MS);

  const allOccurred = appts.filter((a) => a.outcome !== 'booked');
  const recentOccurred = allOccurred.filter(
    (a) => new Date(a.appt_date) >= recentCutoff,
  );
  const priorOccurred = allOccurred.filter(
    (a) =>
      new Date(a.appt_date) >= priorCutoff &&
      new Date(a.appt_date) < recentCutoff,
  );

  // Close rate (sold / sits) for each window
  const recentSits = recentOccurred.filter(
    (a) => a.outcome === 'sat' || a.outcome === 'sold',
  );
  const priorSits = priorOccurred.filter(
    (a) => a.outcome === 'sat' || a.outcome === 'sold',
  );
  const close_rate_recent = safe(
    recentSits.filter((a) => a.outcome === 'sold').length,
    recentSits.length,
  );
  const close_rate_prior = safe(
    priorSits.filter((a) => a.outcome === 'sold').length,
    priorSits.length,
  );

  // No-show rate in recent window
  const no_show_rate_recent = safe(
    recentOccurred.filter((a) => a.outcome === 'no_show').length,
    recentOccurred.length,
  );

  // Delivery: leads created in last 4 weeks vs weekly_promise × 4
  const recentLeadCount = clientLeads.filter(
    (l) => new Date(l.created_at) >= recentCutoff,
  ).length;
  const promised = client.weekly_promise * 4;
  const delivery_pct_recent = promised > 0 ? safe(recentLeadCount, promised) : null;

  // Portal login recency
  const lastLoginMs = portalLogins
    .map((l) => new Date(l.occurred_at).getTime())
    .sort((a, b) => b - a)[0];
  const days_since_portal_login =
    lastLoginMs != null
      ? Math.floor((now.getTime() - lastLoginMs) / DAY_MS)
      : null;

  // Quality flags in recent window
  const occurred_recent = recentOccurred.length;
  const flagged_recent = recentOccurred.filter(
    (a) => a.quality_rating === 'down',
  ).length;

  // ROI overall
  const ma = Math.max(1, Math.floor(msActive / (30 * DAY_MS)));
  const clientPaid = client.retainer * ma + total_sits * client.per_sit_fee;
  const revenue = appts
    .filter((a) => a.outcome === 'sold')
    .reduce((s, a) => s + (a.sale_value ?? 0), 0);
  const roi_overall = safe(revenue, clientPaid);

  // ---------- Score computation ----------
  let score = 0;
  const reasons: string[] = [];

  // 1. Close rate trend (highest weight — directly impacts client ROI)
  if (
    close_rate_recent != null &&
    close_rate_prior != null &&
    close_rate_prior - close_rate_recent >= CLOSE_DROP_PP
  ) {
    score += CHURN_WEIGHTS.close_rate_falling;
    reasons.push(
      `Close rate fell from ${pct(close_rate_prior)} to ${pct(close_rate_recent)} over the last 4 weeks`,
    );
  } else if (close_rate_recent != null && close_rate_recent < CLOSE_LOW) {
    score += CHURN_WEIGHTS.close_rate_low;
    reasons.push(
      `Close rate is ${pct(close_rate_recent)} — below the ${pct(CLOSE_LOW)} healthy threshold`,
    );
  }

  // 2. No-show rate
  if (no_show_rate_recent != null && no_show_rate_recent > NO_SHOW_HIGH) {
    score += CHURN_WEIGHTS.no_show_high;
    reasons.push(
      `No-show rate is ${pct(no_show_rate_recent)} in the last 4 weeks (above ${pct(NO_SHOW_HIGH)})`,
    );
  }

  // 3. Delivery shortfall
  if (delivery_pct_recent != null && delivery_pct_recent < DELIVERY_LOW) {
    score += CHURN_WEIGHTS.delivery_shortfall;
    reasons.push(
      `Delivered ${pct(delivery_pct_recent)} of the promised leads over the last 4 weeks — under-delivering may cause dissatisfaction`,
    );
  }

  // 4. Portal login recency
  if (days_since_portal_login == null) {
    score += CHURN_WEIGHTS.portal_stale_30d;
    reasons.push('No portal logins recorded — client may not be monitoring their results');
  } else if (days_since_portal_login >= 30) {
    score += CHURN_WEIGHTS.portal_stale_30d;
    reasons.push(
      `No portal login in ${days_since_portal_login} days — client may be disengaging`,
    );
  } else if (days_since_portal_login >= 14) {
    score += CHURN_WEIGHTS.portal_stale_14d;
    reasons.push(`No portal login in ${days_since_portal_login} days`);
  }

  // 5. Quality flags
  if (occurred_recent > 0) {
    const flag_rate = flagged_recent / occurred_recent;
    if (flag_rate >= FLAG_RATE_HIGH) {
      score += CHURN_WEIGHTS.quality_flags;
      reasons.push(
        `${flagged_recent} of ${occurred_recent} recent appointment${occurred_recent !== 1 ? 's' : ''} rated down (${pct(flag_rate)} quality issue rate)`,
      );
    }
  }

  // 6. ROI
  if (roi_overall != null && roi_overall < ROI_LOW) {
    score += CHURN_WEIGHTS.roi_low;
    reasons.push(
      `Overall ROI is ${roi_overall.toFixed(1)}× — below the ${ROI_LOW}× healthy threshold`,
    );
  }

  const clamped = Math.min(100, score);
  const band: ChurnBand =
    clamped >= 50 ? 'At risk' : clamped >= 25 ? 'Watch' : 'Healthy';

  return {
    client,
    sufficient_data: true,
    score: clamped,
    band,
    reasons,
    inputs: {
      weeks_active,
      total_sits,
      close_rate_recent,
      close_rate_prior,
      no_show_rate_recent,
      delivery_pct_recent,
      days_since_portal_login,
      flagged_recent,
      occurred_recent,
      roi_overall,
    },
  };
}
