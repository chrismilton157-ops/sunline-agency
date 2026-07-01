import { describe, it, expect } from 'vitest';
import {
  computePipeline,
  computeNextAvailableAt,
  effectiveDailyAttempts,
  isFirstEverContact,
  isSecondDialOfDoubleDial,
  nextDayAt8amUK,
  toUKDateString,
  attemptStatusLabel,
} from '../lib/setter-cadence';

// ---------------------------------------------------------------------------
// computePipeline
// ---------------------------------------------------------------------------
describe('computePipeline', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  it('P1: lead < 7 days old with under 10 no-answers', () => {
    expect(computePipeline(daysAgo(1), 0)).toBe(1);
    expect(computePipeline(daysAgo(6.9), 9)).toBe(1);
  });

  it('P2: lead 7–30 days old with under 10 no-answers', () => {
    expect(computePipeline(daysAgo(7), 0)).toBe(2);
    expect(computePipeline(daysAgo(15), 5)).toBe(2);
    expect(computePipeline(daysAgo(29.9), 9)).toBe(2);
  });

  it('P2: fresh lead that has hit 10 attempts (graduates out of P1)', () => {
    expect(computePipeline(daysAgo(1), 10)).toBe(2);
    expect(computePipeline(daysAgo(3), 12)).toBe(2);
  });

  it('P3: lead 30+ days old (regardless of attempts)', () => {
    expect(computePipeline(daysAgo(30), 0)).toBe(3);
    expect(computePipeline(daysAgo(90), 10)).toBe(3);
  });

  it('P3 beats P2: aged lead that also hit 10 attempts stays in P3', () => {
    expect(computePipeline(daysAgo(31), 15)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeNextAvailableAt
// ---------------------------------------------------------------------------
describe('computeNextAvailableAt', () => {
  const now = new Date('2026-06-30T12:00:00Z');

  it('first-ever dial → ~30 second re-serve (CE1 second dial)', () => {
    const next = computeNextAvailableAt(0, 1, now);
    const diffMs = next.getTime() - now.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(29_000);
    expect(diffMs).toBeLessThanOrEqual(31_000);
  });

  it('second dial of CE1 (no_answer_count was 1) → 2-hour gap', () => {
    const next = computeNextAvailableAt(1, 2, now);
    const diffMs = next.getTime() - now.getTime();
    expect(diffMs).toBeCloseTo(2 * 60 * 60 * 1000, -3);
  });

  it('CE2 no-answer → 2-hour gap', () => {
    const next = computeNextAvailableAt(2, 3, now);
    const diffMs = next.getTime() - now.getTime();
    expect(diffMs).toBeCloseTo(2 * 60 * 60 * 1000, -3);
  });

  it('CE3 no-answer (4th today) → next day at 8am UK', () => {
    const next = computeNextAvailableAt(3, 4, now);
    // Should be tomorrow 8am UK = tomorrow 7am UTC (BST in June)
    const ukHour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(next),
      10,
    );
    expect(ukHour).toBe(8);
    // Should be tomorrow
    const tomorrowUTC = new Date('2026-07-01');
    expect(next.getUTCFullYear()).toBe(tomorrowUTC.getUTCFullYear());
    expect(next.getUTCMonth()).toBe(tomorrowUTC.getUTCMonth());
    expect(next.getUTCDate()).toBe(tomorrowUTC.getUTCDate());
  });

  it('day 2+ attempts that hit cap also return next-day 8am', () => {
    // Day 2, 4th no-answer (noAnswerCount=7 before, dailyAfter=4)
    const next = computeNextAvailableAt(7, 4, now);
    const ukHour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(next),
      10,
    );
    expect(ukHour).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// effectiveDailyAttempts
// ---------------------------------------------------------------------------
describe('effectiveDailyAttempts', () => {
  const now = new Date('2026-06-30T12:00:00Z');
  const todayUK = toUKDateString(now); // '2026-06-30'

  it('returns stored count when date matches today', () => {
    expect(effectiveDailyAttempts(3, todayUK, now)).toBe(3);
  });

  it('returns 0 when date is a different day (auto-reset)', () => {
    expect(effectiveDailyAttempts(4, '2026-06-29', now)).toBe(0);
    expect(effectiveDailyAttempts(4, null, now)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Double-dial helpers
// ---------------------------------------------------------------------------
describe('isFirstEverContact', () => {
  it('true only when no_answer_count is 0', () => {
    expect(isFirstEverContact(0)).toBe(true);
    expect(isFirstEverContact(1)).toBe(false);
    expect(isFirstEverContact(5)).toBe(false);
  });
});

describe('isSecondDialOfDoubleDial', () => {
  it('true only when count=1 and daily=1', () => {
    expect(isSecondDialOfDoubleDial(1, 1)).toBe(true);
  });
  it('false for other combos', () => {
    expect(isSecondDialOfDoubleDial(0, 0)).toBe(false);
    expect(isSecondDialOfDoubleDial(2, 1)).toBe(false);
    expect(isSecondDialOfDoubleDial(1, 2)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// nextDayAt8amUK
// ---------------------------------------------------------------------------
describe('nextDayAt8amUK', () => {
  it('returns 8am UK time in summer (BST = UTC+1)', () => {
    const now = new Date('2026-06-30T12:00:00Z'); // summer
    const result = nextDayAt8amUK(now);
    const ukHour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(result),
      10,
    );
    expect(ukHour).toBe(8);
    expect(result.getUTCDate()).toBe(1); // 1 July
    expect(result.getUTCHours()).toBe(7); // 8am BST = 7am UTC
  });

  it('returns 8am UK time in winter (GMT = UTC+0)', () => {
    const now = new Date('2026-01-15T12:00:00Z'); // winter
    const result = nextDayAt8amUK(now);
    const ukHour = parseInt(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(result),
      10,
    );
    expect(ukHour).toBe(8);
    expect(result.getUTCHours()).toBe(8); // 8am GMT = 8am UTC
  });

  it('handles month-end rollover (30 June → 1 July)', () => {
    // 21:00 UTC = 22:00 BST = still 30 June in UK time; next day should be 1 July
    const now = new Date('2026-06-30T21:00:00Z');
    const result = nextDayAt8amUK(now);
    const ukDate = toUKDateString(result);
    expect(ukDate).toBe('2026-07-01');
  });
});

// ---------------------------------------------------------------------------
// attemptStatusLabel
// ---------------------------------------------------------------------------
describe('attemptStatusLabel', () => {
  const now = new Date('2026-06-30T12:00:00Z');
  const today = toUKDateString(now);

  it('shows first-contact double-dial label', () => {
    const label = attemptStatusLabel(0, 0, null, now);
    expect(label).toContain('DOUBLE DIAL');
    expect(label).toContain('First contact');
  });

  it('shows CE1 second dial label', () => {
    const label = attemptStatusLabel(1, 1, today, now);
    expect(label).toContain('second dial');
  });

  it('shows attempt N of 10 for later attempts', () => {
    expect(attemptStatusLabel(4, 2, today, now)).toBe('Attempt 5 of 10');
    expect(attemptStatusLabel(9, 3, today, now)).toBe('Attempt 10 of 10');
  });
});

// ---------------------------------------------------------------------------
// Cadence sequence integration test (pure logic only, no DB)
// Simulates a full Day 1 → Day 2 flow
// ---------------------------------------------------------------------------
describe('Full cadence sequence', () => {
  it('Day 1: 4 attempts with double-dial on first contact, then daily cap', () => {
    const baseNow = new Date('2026-06-30T09:00:00Z');
    const today = toUKDateString(baseNow);
    let noAnswerCount = 0;
    let dailyAttempts = 0;
    let dailyDate: string | null = null;

    // ── Attempt 1 (CE1, dial 1 of double-dial) ──────────────────────────
    const effBefore1 = effectiveDailyAttempts(dailyAttempts, dailyDate, baseNow);
    expect(isFirstEverContact(noAnswerCount)).toBe(true);
    dailyAttempts = effBefore1 + 1;
    dailyDate = today;
    const next1 = computeNextAvailableAt(noAnswerCount, dailyAttempts, baseNow);
    noAnswerCount += 1;
    // ~30 s gap for double-dial
    expect(next1.getTime() - baseNow.getTime()).toBeLessThan(60_000);

    // ── Attempt 2 (CE1, dial 2 of double-dial) ──────────────────────────
    const now2 = new Date(next1.getTime() + 5_000);
    const effBefore2 = effectiveDailyAttempts(dailyAttempts, dailyDate, now2);
    expect(isSecondDialOfDoubleDial(noAnswerCount, effBefore2)).toBe(true);
    dailyAttempts = effBefore2 + 1;
    const next2 = computeNextAvailableAt(noAnswerCount, dailyAttempts, now2);
    noAnswerCount += 1;
    // 2-hour gap
    expect(Math.round((next2.getTime() - now2.getTime()) / 3_600_000)).toBe(2);

    // ── Attempt 3 (CE2) ─────────────────────────────────────────────────
    const now3 = new Date(next2.getTime() + 5_000);
    const effBefore3 = effectiveDailyAttempts(dailyAttempts, dailyDate, now3);
    dailyAttempts = effBefore3 + 1;
    const next3 = computeNextAvailableAt(noAnswerCount, dailyAttempts, now3);
    noAnswerCount += 1;
    // 2-hour gap
    expect(Math.round((next3.getTime() - now3.getTime()) / 3_600_000)).toBe(2);

    // ── Attempt 4 (CE3, hits daily cap) ─────────────────────────────────
    const now4 = new Date(next3.getTime() + 5_000);
    const effBefore4 = effectiveDailyAttempts(dailyAttempts, dailyDate, now4);
    dailyAttempts = effBefore4 + 1;
    expect(dailyAttempts).toBe(4); // daily cap
    const next4 = computeNextAvailableAt(noAnswerCount, dailyAttempts, now4);
    noAnswerCount += 1;
    // next day 8am UK
    const ukHour = parseInt(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London', hour: '2-digit', hour12: false,
      }).format(next4),
      10,
    );
    expect(ukHour).toBe(8);

    // After Day 1: 4 total no-answer attempts
    expect(noAnswerCount).toBe(4);
    // Still P1 (< 7 days, < 10 attempts)
    expect(computePipeline(new Date('2026-06-30'), noAnswerCount)).toBe(1);
  });

  it('Lead graduates P1→P2 at 10 no-answer attempts', () => {
    const created = new Date(Date.now() - 2 * 86_400_000); // 2 days ago
    for (let count = 0; count < 10; count++) {
      const p = computePipeline(created, count);
      expect(p).toBe(1);
    }
    // At 10 attempts: graduates to P2
    expect(computePipeline(created, 10)).toBe(2);
    expect(computePipeline(created, 11)).toBe(2);
  });

  it('daily_attempts resets across days', () => {
    const now = new Date('2026-07-01T12:00:00Z');
    // Yesterday date
    const yesterday = '2026-06-30';
    // Even with daily_attempts = 4 from yesterday, effective is 0 today
    expect(effectiveDailyAttempts(4, yesterday, now)).toBe(0);
  });
});
