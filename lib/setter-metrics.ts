// Setter performance stats.
// All inputs come from the service-role admin client (server-side only).
// Two output types:
//   SetterOutputStats — safe for the setter to see (their own numbers + leaderboard rank)
//   SetterQualityStats — owner-only layer (no-show rate, down-rating rate, quality flag)

const FORTY_EIGHT_HRS_MS = 48 * 60 * 60 * 1000;

export type SetterRow = {
  id: string;
  email: string;
};

export type DispositionRow = {
  id: string;
  lead_id: string;
  disposition: string;
  disqual_reason: string | null;
  created_by: string;
  created_at: string;
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

// Target benchmarks shown to setters for context
export const SETTER_BENCHMARKS = {
  targetBookingRate: 0.45,
  targetPickupRate: 0.35,
  targetConfirmationRate: 0.80,
};
