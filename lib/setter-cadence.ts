// Pure cadence logic — no I/O, fully testable.
// Mirrors the serve_next_lead Postgres function's rules so TypeScript and DB
// always agree on pipeline membership and scheduling.

export type Pipeline = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Pipeline membership
// ---------------------------------------------------------------------------

/** Compute which pipeline a lead belongs to based on age and no-answer count. */
export function computePipeline(
  createdAt: Date,
  noAnswerCount: number,
  now: Date = new Date(),
): Pipeline {
  const ageDays = (now.getTime() - createdAt.getTime()) / 86_400_000;
  if (ageDays >= 30) return 3;
  if (ageDays >= 7 || noAnswerCount >= 10) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Date helpers (UK timezone)
// ---------------------------------------------------------------------------

/** Format a Date as YYYY-MM-DD in UK time. Used for daily_attempts_date. */
export function toUKDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
}

/** Return a Date representing 8am tomorrow UK time (handles BST/GMT). */
export function nextDayAt8amUK(now: Date = new Date()): Date {
  const ukToday = toUKDateString(now);
  const [y, m, d] = ukToday.split('-').map(Number);
  // UTC midnight of tomorrow in calendar terms
  const tomorrowUTCMidnight = Date.UTC(y, m - 1, d + 1);
  const base = new Date(tomorrowUTCMidnight);
  const ukTomorrow = toUKDateString(base);
  const [ty, tm, td] = ukTomorrow.split('-').map(Number);

  // Try 7am UTC (= 8am BST) and 8am UTC (= 8am GMT); return whichever gives 8am UK
  for (const utcHour of [7, 8]) {
    const candidate = new Date(Date.UTC(ty, tm - 1, td, utcHour, 0, 0));
    const ukHour = parseInt(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        hour12: false,
      }).format(candidate),
      10,
    );
    if (ukHour === 8) return candidate;
  }
  // Fallback: 8am UTC
  return new Date(Date.UTC(ty, tm - 1, td, 8, 0, 0));
}

// ---------------------------------------------------------------------------
// Cadence scheduling
// ---------------------------------------------------------------------------

/**
 * Compute next_available_at after a no-answer attempt.
 *
 * Rule set (from the brief):
 *   - First-ever dial (noAnswerCountBefore == 0): 30-second gap so the same
 *     lead re-surfaces immediately for the CE1 double-dial.
 *   - Daily cap hit (dailyAttemptsAfter >= 4): resurface at 8am tomorrow UK.
 *   - Otherwise: 2-hour gap between contact events.
 */
export function computeNextAvailableAt(
  noAnswerCountBefore: number,
  dailyAttemptsAfter: number,
  now: Date = new Date(),
): Date {
  if (noAnswerCountBefore === 0) {
    // First-ever dial → re-serve in 30 s for the CE1 second dial
    return new Date(now.getTime() + 30_000);
  }
  if (dailyAttemptsAfter >= 4) {
    // Daily cap — resume next day at 8am UK
    return nextDayAt8amUK(now);
  }
  // Normal 2-hour gap between contact events
  return new Date(now.getTime() + 2 * 60 * 60 * 1_000);
}

// ---------------------------------------------------------------------------
// Daily attempt helpers
// ---------------------------------------------------------------------------

/**
 * Effective number of no-answer dials on today's UK date.
 * Returns 0 if daily_attempts_date is a different day (auto-reset).
 */
export function effectiveDailyAttempts(
  dailyAttempts: number,
  dailyAttemptsDate: string | null,
  now: Date = new Date(),
): number {
  return dailyAttemptsDate === toUKDateString(now) ? dailyAttempts : 0;
}

// ---------------------------------------------------------------------------
// Double-dial helpers
// ---------------------------------------------------------------------------

/** True if this is the very first dial ever on this lead (CE1 double-dial). */
export function isFirstEverContact(noAnswerCount: number): boolean {
  return noAnswerCount === 0;
}

/**
 * True if this is the second dial of CE1 (the immediate re-serve after the
 * first no-answer on the very first contact event).
 */
export function isSecondDialOfDoubleDial(
  noAnswerCount: number,
  dailyAttempts: number,
): boolean {
  return noAnswerCount === 1 && dailyAttempts === 1;
}

// ---------------------------------------------------------------------------
// UI labels
// ---------------------------------------------------------------------------

/** Status label shown on the served-lead card. */
export function attemptStatusLabel(
  noAnswerCount: number,
  dailyAttempts: number,
  dailyAttemptsDate: string | null,
  now: Date = new Date(),
): string {
  const todayAttempts = effectiveDailyAttempts(dailyAttempts, dailyAttemptsDate, now);
  if (noAnswerCount === 0) return 'First contact — DOUBLE DIAL';
  if (noAnswerCount === 1 && todayAttempts === 1) return 'CE1 second dial — call immediately again';
  return `Attempt ${noAnswerCount + 1} of 10`;
}

export const PIPELINE_LABEL: Record<Pipeline, string> = {
  1: 'Pipeline 1 — New',
  2: 'Pipeline 2 — Working',
  3: 'Pipeline 3 — Aged',
};

export const PIPELINE_SHORT: Record<Pipeline, string> = {
  1: 'P1 New',
  2: 'P2 Working',
  3: 'P3 Aged',
};
