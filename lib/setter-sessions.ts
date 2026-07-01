// Pure pause/resume (dialer) session maths — no I/O, fully testable.
// A session is one continuous "active" or "paused" stretch on the dialer.
// Open sessions (ended_at = null) are still running; we cap their effective
// end at the last heartbeat when that heartbeat has gone stale (tab closed),
// otherwise at `now`. This keeps active-vs-paused durations sane even when a
// setter never cleanly ends a session.

export type DialerState = 'active' | 'paused';

export type SessionRow = {
  setter_id: string;
  state: DialerState;
  started_at: string;
  ended_at: string | null;
  last_heartbeat_at: string;
};

// If an open session hasn't been heartbeated within this window, we treat it as
// having ended at its last heartbeat (the setter closed the tab / went away).
// The queue heartbeats every 15s, so 2 minutes is comfortable slack.
export const HEARTBEAT_GRACE_MS = 120_000;

/** Effective end time (ms) of a session for duration accounting. */
export function sessionEffectiveEnd(s: SessionRow, now: Date = new Date()): number {
  const nowMs = now.getTime();
  if (s.ended_at) return new Date(s.ended_at).getTime();
  const hb = new Date(s.last_heartbeat_at).getTime();
  // Still alive if heartbeat is recent → count up to now; otherwise it died at
  // the last heartbeat.
  return nowMs - hb <= HEARTBEAT_GRACE_MS ? nowMs : hb;
}

/** Overlap (ms) of [start,end] with [windowStart,windowEnd], never negative. */
function clampedOverlapMs(
  startMs: number,
  endMs: number,
  windowStart: number,
  windowEnd: number,
): number {
  const lo = Math.max(startMs, windowStart);
  const hi = Math.min(endMs, windowEnd);
  return Math.max(0, hi - lo);
}

export type DialerTotals = { activeMs: number; pausedMs: number };

/**
 * Sum active vs paused milliseconds for one setter within [windowStart,windowEnd].
 * Sessions are clamped to the window so a stretch spanning midnight only counts
 * the part inside the window.
 */
export function computeDialerTotals(
  sessions: SessionRow[],
  setterId: string,
  windowStart: Date,
  windowEnd: Date,
  now: Date = new Date(),
): DialerTotals {
  const ws = windowStart.getTime();
  const we = windowEnd.getTime();
  let activeMs = 0;
  let pausedMs = 0;

  for (const s of sessions) {
    if (s.setter_id !== setterId) continue;
    const startMs = new Date(s.started_at).getTime();
    const endMs = sessionEffectiveEnd(s, now);
    const overlap = clampedOverlapMs(startMs, endMs, ws, we);
    if (overlap <= 0) continue;
    if (s.state === 'active') activeMs += overlap;
    else pausedMs += overlap;
  }

  return { activeMs, pausedMs };
}

/** Human label for a millisecond duration, e.g. "2h 5m", "45m", "< 1m". */
export function fmtDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMins = Math.floor(ms / 60_000);
  if (totalMins < 1) return '< 1m';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** UTC-day bounds for "today" — matches rangeBounds('today') in setter-metrics. */
export function todayBoundsUTC(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return { start, end: now };
}
