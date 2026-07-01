// Setter performance stats.
// All inputs come from the service-role admin client (server-side only).
// Two output types:
//   SetterOutputStats — safe for the setter to see (their own numbers + leaderboard rank)
//   SetterQualityStats — owner-only layer (no-show rate, down-rating rate, quality flag)

const FORTY_EIGHT_HRS_MS = 48 * 60 * 60 * 1000;

export type SetterRow = {
  id: string;
  email: string;
  avatar_url: string | null;
};

export type DispositionRow = {
  id: string;
  lead_id: string;
  disposition: string;
  disqual_reason: string | null;
  created_by: string;
  created_at: string;
  // Phase 26: best-effort talk-time capture (nullable / may be absent).
  talk_time_seconds?: number | null;
};

export type ApptRow = {
  id: string;
  setter_id: string | null;
  setter: string | null;
  outcome: string;
  quality_rating: string | null;
  quality_reason: string | null;
  confirmed_at: string | null;
  appt_date: string;
  // Phase 26: when the appointment was booked (funnel framing). May be absent
  // on older selects — falls back to appt_date.
  created_at?: string | null;
};

// Resolve which UUID owns each appointment.
// Phase 11+: setter_id is the authoritative link.
// Legacy: fall back to matching setter email = user email.
function apptBelongsTo(appt: ApptRow, setter: SetterRow): boolean {
  if (appt.setter_id) return appt.setter_id === setter.id;
  return !!(appt.setter && appt.setter.toLowerCase() === setter.email.toLowerCase());
}

export function initialsFromEmail(email: string): string {
  const local = email.split('@')[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

export function displayName(email: string): string {
  const local = email.split('@')[0];
  return local
    .split(/[._-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

// Date bounds for time range
export function rangeBounds(
  range: 'today' | 'week' | 'month',
  now: Date = new Date(),
): { start: Date; end: Date } {
  const end = now;
  if (range === 'today') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { start, end };
  }
  if (range === 'week') {
    // Mon–Sun week (ISO)
    const day = now.getUTCDay(); // 0=Sun
    const diff = (day === 0 ? -6 : 1 - day);
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
    return { start, end };
  }
  // month
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { start, end };
}

export type SetterOutputStats = {
  setterId: string;
  setterEmail: string;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  dials: number;
  contacted: number;
  pickupRate: number | null;
  bookings: number;
  bookingRate: number | null;
  confirmationRate: number | null;
};

export type SetterQualityStats = SetterOutputStats & {
  appointmentsOccurred: number;
  noShows: number;
  noShowRate: number | null;
  downRatings: number;
  totalRated: number;
  downRatingRate: number | null;
  disqualCount: number;
  disqualReasons: { reason: string; count: number }[];
  // Owner-only quality flag:
  // setter's booking rate looks good but their sits show high no-show/down-rating
  qualityFlag: boolean;
  qualityFlagReason: string | null;
};

const safe = (n: number, d: number): number | null => (d > 0 ? n / d : null);

// Contacts = dispositions that aren't no_answer or wrong_number
const CONTACT_DISPOSITIONS = new Set(['callback', 'not_interested', 'disqualified', 'booked']);

function computeOutput(
  setter: SetterRow,
  disps: DispositionRow[],
  appts: ApptRow[],
  start: Date,
  end: Date,
  now: Date,
): SetterOutputStats {
  const myDisps = disps.filter(
    (d) =>
      d.created_by === setter.id &&
      new Date(d.created_at) >= start &&
      new Date(d.created_at) <= end,
  );

  const dials = myDisps.length;
  const contacted = myDisps.filter((d) => CONTACT_DISPOSITIONS.has(d.disposition)).length;
  const bookingsFromDisps = myDisps.filter((d) => d.disposition === 'booked').length;

  // Confirmation rate: past appointments by this setter (any time), outcome !== 'booked'
  const myAppts = appts.filter((a) => apptBelongsTo(a, setter));
  const past = myAppts.filter(
    (a) => a.outcome !== 'booked' && new Date(a.appt_date).getTime() <= now.getTime(),
  );
  const confirmedOnTime = past.filter((a) => {
    if (!a.confirmed_at) return false;
    const apptT = new Date(a.appt_date).getTime();
    const confT = new Date(a.confirmed_at).getTime();
    return confT <= apptT && apptT - confT <= FORTY_EIGHT_HRS_MS;
  }).length;

  return {
    setterId: setter.id,
    setterEmail: setter.email,
    displayName: displayName(setter.email),
    initials: initialsFromEmail(setter.email),
    avatarUrl: setter.avatar_url,
    dials,
    contacted,
    pickupRate: safe(contacted, dials),
    bookings: bookingsFromDisps,
    bookingRate: safe(bookingsFromDisps, contacted),
    confirmationRate: safe(confirmedOnTime, past.length),
  };
}

export function computeSetterOutput(
  setters: SetterRow[],
  disps: DispositionRow[],
  appts: ApptRow[],
  range: 'today' | 'week' | 'month',
  now: Date = new Date(),
): SetterOutputStats[] {
  const { start, end } = rangeBounds(range, now);
  return setters.map((s) => computeOutput(s, disps, appts, start, end, now));
}

// Thresholds for quality flag
const QUALITY_FLAG_MIN_BOOKING_RATE = 0.35; // setter is booking well
const QUALITY_FLAG_MIN_NOSHOW_RATE = 0.25;  // but sits are not showing up
const QUALITY_FLAG_MIN_DOWN_RATE = 0.30;    // or appointments are thumbs-down

export function computeSetterQuality(
  setters: SetterRow[],
  disps: DispositionRow[],
  appts: ApptRow[],
  range: 'today' | 'week' | 'month',
  now: Date = new Date(),
): SetterQualityStats[] {
  const { start, end } = rangeBounds(range, now);

  return setters.map((setter) => {
    const output = computeOutput(setter, disps, appts, start, end, now);

    const myAppts = appts.filter((a) => apptBelongsTo(a, setter));
    const past = myAppts.filter(
      (a) => a.outcome !== 'booked' && new Date(a.appt_date).getTime() <= now.getTime(),
    );

    const noShows = past.filter((a) => a.outcome === 'no_show').length;
    const rated = past.filter((a) => a.quality_rating === 'up' || a.quality_rating === 'down');
    const downRatings = rated.filter((a) => a.quality_rating === 'down').length;

    const noShowRate = safe(noShows, past.length);
    const downRatingRate = safe(downRatings, rated.length);

    // Disqual counts from call_dispositions
    const myAllDisps = disps.filter((d) => d.created_by === setter.id);
    const disquals = myAllDisps.filter((d) => d.disposition === 'disqualified');
    const reasonCounts = new Map<string, number>();
    for (const d of disquals) {
      const r = d.disqual_reason?.trim() || 'unspecified';
      reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
    }
    const disqualReasons = [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    // Quality flag logic
    const bookingRate = output.bookingRate ?? 0;
    const noShowR = noShowRate ?? 0;
    const downR = downRatingRate ?? 0;
    const hasEnoughData = past.length >= 3; // need a sample
    const qualityFlag =
      hasEnoughData &&
      bookingRate >= QUALITY_FLAG_MIN_BOOKING_RATE &&
      (noShowR >= QUALITY_FLAG_MIN_NOSHOW_RATE || downR >= QUALITY_FLAG_MIN_DOWN_RATE);

    let qualityFlagReason: string | null = null;
    if (qualityFlag) {
      const parts: string[] = [];
      if (noShowR >= QUALITY_FLAG_MIN_NOSHOW_RATE)
        parts.push(`no-show rate ${Math.round(noShowR * 100)}%`);
      if (downR >= QUALITY_FLAG_MIN_DOWN_RATE)
        parts.push(`down-rating rate ${Math.round(downR * 100)}%`);
      qualityFlagReason = `Good booking rate but ${parts.join(' and ')} — appointments may be low quality`;
    }

    return {
      ...output,
      appointmentsOccurred: past.length,
      noShows,
      noShowRate,
      downRatings,
      totalRated: rated.length,
      downRatingRate,
      disqualCount: disquals.length,
      disqualReasons,
      qualityFlag,
      qualityFlagReason,
    };
  });
}

// Sort by bookings desc for leaderboard
export function rankByBookings(stats: SetterOutputStats[]): SetterOutputStats[] {
  return [...stats].sort((a, b) => b.bookings - a.bookings || (b.bookingRate ?? 0) - (a.bookingRate ?? 0));
}

// ── Claim tracking (owner-only) ──────────────────────────────────────────────

export type LeadClaimRow = {
  id: string;
  first_claimed_by: string | null;
  first_claimed_at: string | null;
  created_at: string;
};

export type SetterClaimStats = {
  setterId: string;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  claimCount: number;
  avgSpeedMins: number | null;
};

export type ClaimSummary = {
  perSetter: SetterClaimStats[];
  teamAvgSpeedMins: number | null;
  fastestSetterId: string | null;
};

export function computeSetterClaimStats(
  setters: SetterRow[],
  leads: LeadClaimRow[],
  range: 'today' | 'week' | 'month',
  now: Date = new Date(),
): ClaimSummary {
  const { start, end } = rangeBounds(range, now);

  const inRange = leads.filter((l) => {
    if (!l.first_claimed_at) return false;
    const t = new Date(l.first_claimed_at);
    return t >= start && t <= end;
  });

  const perSetter: SetterClaimStats[] = setters.map((s) => {
    const mine = inRange.filter((l) => l.first_claimed_by === s.id);
    const speeds = mine
      .map((l) => {
        const claimedAt = new Date(l.first_claimed_at!).getTime();
        const createdAt = new Date(l.created_at).getTime();
        return (claimedAt - createdAt) / 60_000;
      })
      .filter((v) => v >= 0); // ignore negative (clock skew)

    const avgSpeedMins =
      speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : null;

    return {
      setterId: s.id,
      displayName: displayName(s.email),
      initials: initialsFromEmail(s.email),
      avatarUrl: s.avatar_url,
      claimCount: mine.length,
      avgSpeedMins,
    };
  });

  // Team average across all leads with both timestamps in range
  const allSpeeds = inRange
    .map((l) => {
      const claimedAt = new Date(l.first_claimed_at!).getTime();
      const createdAt = new Date(l.created_at).getTime();
      return (claimedAt - createdAt) / 60_000;
    })
    .filter((v) => v >= 0);

  const teamAvgSpeedMins =
    allSpeeds.length > 0 ? allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length : null;

  // Fastest setter = lowest avgSpeedMins (with at least 1 claim)
  const withClaims = perSetter.filter((s) => s.avgSpeedMins !== null);
  const fastest = withClaims.sort((a, b) => (a.avgSpeedMins ?? 0) - (b.avgSpeedMins ?? 0))[0];

  return {
    perSetter,
    teamAvgSpeedMins,
    fastestSetterId: fastest?.setterId ?? null,
  };
}

// Target benchmarks shown to setters for context
export const SETTER_BENCHMARKS = {
  targetBookingRate: 0.45,
  targetPickupRate: 0.35,
  targetConfirmationRate: 0.80,
  targetShowRate: 0.70,
};

// ── Phase 26: personal dashboard ("My Numbers") ─────────────────────────────

// Outcomes that count as the appointment having gone ahead (the sit happened).
const SAT_OUTCOMES = new Set(['sat', 'sold']);

/** When was this appointment booked? Prefer created_at, fall back to appt_date. */
function apptBookedAt(a: ApptRow): number {
  return new Date(a.created_at ?? a.appt_date).getTime();
}

export type SetterActivity = {
  dials: number;
  contacted: number;
  pickupRate: number | null;
  leadsWorked: number;
  talkTimeSeconds: number;
  talkTimeCaptured: boolean; // false when no attempt in range carried a duration
};

/**
 * Own activity numbers for one setter in a range: dials, pickups/answer rate,
 * distinct leads worked, and best-effort total talk-time.
 */
export function computeSetterActivity(
  setterId: string,
  disps: DispositionRow[],
  range: 'today' | 'week' | 'month',
  now: Date = new Date(),
): SetterActivity {
  const { start, end } = rangeBounds(range, now);
  const mine = disps.filter(
    (d) =>
      d.created_by === setterId &&
      new Date(d.created_at) >= start &&
      new Date(d.created_at) <= end,
  );

  const dials = mine.length;
  const contacted = mine.filter((d) => CONTACT_DISPOSITIONS.has(d.disposition)).length;
  const leadsWorked = new Set(mine.map((d) => d.lead_id)).size;

  let talkTimeSeconds = 0;
  let talkTimeCaptured = false;
  for (const d of mine) {
    if (d.talk_time_seconds != null && d.talk_time_seconds > 0) {
      talkTimeSeconds += d.talk_time_seconds;
      talkTimeCaptured = true;
    }
  }

  return {
    dials,
    contacted,
    pickupRate: safe(contacted, dials),
    leadsWorked,
    talkTimeSeconds,
    talkTimeCaptured,
  };
}

export type SetterFunnel = {
  booked: number;
  confirmed: number;
  sat: number;
  noShow: number;
  cancelled: number;
  // Of the appointments booked in this period, the % that actually sat/showed
  // out of those with a terminal show/no-show outcome.
  showRate: number | null;
  confirmRate: number | null; // confirmed / booked
  bookingRatePerDial: number | null;
  bookingRatePerPickup: number | null;
};

/**
 * Booking funnel for ONE setter: of the appointments they booked in the period,
 * how many are confirmed, sat/showed, no-showed, cancelled — plus booking and
 * show rates. Cohort is defined by when the appointment was booked (created_at).
 */
export function computeSetterFunnel(
  setter: SetterRow,
  appts: ApptRow[],
  disps: DispositionRow[],
  range: 'today' | 'week' | 'month',
  now: Date = new Date(),
): SetterFunnel {
  const { start, end } = rangeBounds(range, now);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const cohort = appts.filter((a) => {
    if (!apptBelongsTo(a, setter)) return false;
    const t = apptBookedAt(a);
    return t >= startMs && t <= endMs;
  });

  const booked = cohort.length;
  const confirmed = cohort.filter((a) => a.confirmed_at != null).length;
  const sat = cohort.filter((a) => SAT_OUTCOMES.has(a.outcome)).length;
  const noShow = cohort.filter((a) => a.outcome === 'no_show').length;
  const cancelled = cohort.filter((a) => a.outcome === 'cancelled').length;

  // Dials / pickups this period for booking-rate denominators.
  const activity = computeSetterActivity(setter.id, disps, range, now);

  return {
    booked,
    confirmed,
    sat,
    noShow,
    cancelled,
    showRate: safe(sat, sat + noShow),
    confirmRate: safe(confirmed, booked),
    bookingRatePerDial: safe(booked, activity.dials),
    bookingRatePerPickup: safe(booked, activity.contacted),
  };
}

/**
 * 1-based leaderboard rank for a setter, using the same bookings-first ordering
 * as the leaderboard. Returns null if the setter isn't in the list.
 */
export function leaderboardRank(
  stats: SetterOutputStats[],
  setterId: string,
): number | null {
  const ranked = rankByBookings(stats);
  const idx = ranked.findIndex((s) => s.setterId === setterId);
  return idx === -1 ? null : idx + 1;
}
