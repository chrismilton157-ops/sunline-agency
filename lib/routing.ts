// Sunline Phase 4: lead routing engine.
//
// `routeLead` is a PURE function — no I/O, no clock. Callers supply the
// current state and `now`. This makes the rules trivially testable and
// reusable by Phase 5's automation path.
//
// Decision order (first rule that fires wins):
//   1. NOBODY-STARVES FLOOR  (failsafe): if there's little of the week
//      left AND any eligible client is below 50% of their weekly promise,
//      one of those starving clients takes every eligible lead until
//      caught up — even if another candidate is more behind on %.
//   2. MOST BEHIND            : whichever eligible client has the lowest
//      promise-fill % (leads_this_week / weekly_promise).
//   3. NEWEST CLIENT (tie-break for rule 2): client who joined most
//      recently — churn is front-loaded; protect the newest relationship.
//   4. ROUND ROBIN (final fallback): whoever received a lead least recently.

export type RoutingClient = {
  id: string;
  company: string;
  weekly_promise: number;
  priority: number;
  joined_at: string;             // YYYY-MM-DD
  leads_this_week: number;
  last_lead_at: string | null;   // ISO timestamp, may be null
  covered_postcodes: string[];
};

export type RuleFired =
  | 'starvation'
  | 'most_behind'
  | 'newest_client'
  | 'round_robin'
  | 'no_candidates';

export type RoutingDecision = {
  winnerId: string | null;
  winnerCompany: string | null;
  ruleFired: RuleFired;
  reason: string;
  // Candidates that were in the running at the rule that fired.
  // (For the simulator: lets us show *why*.)
  considered: RoutingClient[];
  // Promise-fill % for each considered candidate, 0..1.
  fillPercents: Record<string, number>;
  // Was the starvation floor active (regardless of whether it changed the winner)?
  starvationActive: boolean;
};

// % of the current week remaining at or below which the starvation
// floor activates. 0.3 ≈ Friday lunchtime in a Mon–Sun week.
export const STARVATION_TIME_THRESHOLD = 0.3;
// % of promise filled below which a client counts as "starving".
export const STARVATION_FILL_THRESHOLD = 0.5;

export function fillPercent(c: RoutingClient): number {
  if (c.weekly_promise <= 0) return 1; // promised nothing → never "behind"
  return c.leads_this_week / c.weekly_promise;
}

// ISO-style week: Mon 00:00 UTC → next Mon 00:00 UTC.
export function weekBoundsUTC(now: Date) {
  const day = now.getUTCDay();                  // 0=Sun..6=Sat
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
    ),
  );
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const end = new Date(start.getTime() + WEEK_MS);
  const remaining = end.getTime() - now.getTime();
  return {
    start,
    end,
    fractionRemaining: Math.max(0, Math.min(1, remaining / WEEK_MS)),
  };
}

function normalizePostcode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

function pickEligible(
  postcode: string,
  clients: RoutingClient[],
): RoutingClient[] {
  const p = normalizePostcode(postcode);
  if (p === '') return [];
  return clients.filter((c) =>
    c.covered_postcodes.some((prefix) => p.startsWith(prefix.toUpperCase())),
  );
}

function makeFillMap(cs: RoutingClient[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of cs) m[c.id] = fillPercent(c);
  return m;
}

export function routeLead(
  postcode: string,
  clients: RoutingClient[],
  now: Date = new Date(),
): RoutingDecision {
  const fillPercents = makeFillMap(clients);
  const candidates = pickEligible(postcode, clients);
  const { fractionRemaining } = weekBoundsUTC(now);
  const starvationActive = fractionRemaining <= STARVATION_TIME_THRESHOLD;

  if (candidates.length === 0) {
    return {
      winnerId: null,
      winnerCompany: null,
      ruleFired: 'no_candidates',
      reason: `No client covers postcode ${normalizePostcode(postcode) || '(blank)'}.`,
      considered: [],
      fillPercents,
      starvationActive,
    };
  }

  // Rule 1: starvation floor
  let pool = candidates;
  let baseRule: RuleFired = 'most_behind';
  let starvationFired = false;
  if (starvationActive) {
    const starving = candidates.filter(
      (c) => c.weekly_promise > 0 && fillPercent(c) < STARVATION_FILL_THRESHOLD,
    );
    if (starving.length > 0) {
      pool = starving;
      baseRule = 'starvation';
      starvationFired = true;
    }
  }

  // Rule 2: most behind by promise-fill %
  const minFill = Math.min(...pool.map(fillPercent));
  const mostBehind = pool.filter((c) => fillPercent(c) === minFill);
  if (mostBehind.length === 1) {
    const w = mostBehind[0];
    return {
      winnerId: w.id,
      winnerCompany: w.company,
      ruleFired: baseRule,
      reason: starvationFired
        ? `Starvation floor: ${w.company} is at ${(fillPercent(w) * 100).toFixed(0)}% of weekly promise with only ${(fractionRemaining * 100).toFixed(0)}% of the week left.`
        : `Most behind on weekly promise (${w.leads_this_week} of ${w.weekly_promise}, ${(fillPercent(w) * 100).toFixed(0)}%).`,
      considered: pool,
      fillPercents,
      starvationActive,
    };
  }

  // Rule 3: newest client wins
  const newestJoined = mostBehind
    .map((c) => c.joined_at)
    .sort()
    .at(-1)!;
  const newest = mostBehind.filter((c) => c.joined_at === newestJoined);
  if (newest.length === 1) {
    const w = newest[0];
    return {
      winnerId: w.id,
      winnerCompany: w.company,
      ruleFired: 'newest_client',
      reason: `Tied on promise-fill (${(fillPercent(w) * 100).toFixed(0)}%); ${w.company} is the most recently joined client (joined ${w.joined_at}).`,
      considered: mostBehind,
      fillPercents,
      starvationActive,
    };
  }

  // Rule 4: round-robin (least recent lead receipt)
  const sorted = [...newest].sort((a, b) => {
    const at = a.last_lead_at ? new Date(a.last_lead_at).getTime() : 0;
    const bt = b.last_lead_at ? new Date(b.last_lead_at).getTime() : 0;
    return at - bt;
  });
  const w = sorted[0];
  return {
    winnerId: w.id,
    winnerCompany: w.company,
    ruleFired: 'round_robin',
    reason: w.last_lead_at
      ? `Tied on promise-fill and join date; ${w.company} hasn't received a lead since ${w.last_lead_at}.`
      : `Tied on promise-fill and join date; ${w.company} hasn't received any leads yet.`,
    considered: newest,
    fillPercents,
    starvationActive,
  };
}

// ---------- Over-promise warning ----------
//
// For each postcode_volume row, sum the weekly promises of every client
// that covers that prefix. If the sum exceeds the typical weekly volume,
// it's impossible to keep all the promises out of that prefix alone —
// flag it so the owner sees it before clients get starved.
//
// This deliberately *overestimates* demand (each client's promise is
// counted in full against every prefix they cover) — the spec wants a
// warning, not a forecast.

export type PromiseCluster = {
  postcode_prefix: string;
  typical_weekly_leads: number;
  total_promised: number;
  covering: { client_id: string; company: string; weekly_promise: number }[];
  warn: boolean;
};

export function clusterPromises(
  clients: RoutingClient[],
  volumes: { postcode_prefix: string; typical_weekly_leads: number }[],
): PromiseCluster[] {
  return volumes
    .map((v) => {
      const covering = clients
        .filter((c) =>
          c.covered_postcodes
            .map((p) => p.toUpperCase())
            .includes(v.postcode_prefix.toUpperCase()),
        )
        .map((c) => ({
          client_id: c.id,
          company: c.company,
          weekly_promise: c.weekly_promise,
        }));
      const total_promised = covering.reduce(
        (s, c) => s + c.weekly_promise,
        0,
      );
      return {
        postcode_prefix: v.postcode_prefix,
        typical_weekly_leads: v.typical_weekly_leads,
        total_promised,
        covering,
        warn: covering.length > 0 && total_promised > v.typical_weekly_leads,
      };
    })
    .sort((a, b) => a.postcode_prefix.localeCompare(b.postcode_prefix));
}
