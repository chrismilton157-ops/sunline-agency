import { describe, it, expect } from 'vitest';
import {
  computeSetterActivity,
  computeSetterFunnel,
  computeSetterOutput,
  leaderboardRank,
  type SetterRow,
  type DispositionRow,
  type ApptRow,
} from '../lib/setter-metrics';
import {
  computeDialerTotals,
  sessionEffectiveEnd,
  fmtDuration,
  type SessionRow,
} from '../lib/setter-sessions';
import {
  isWorkableStatus,
  isWorkableLead,
  filterWorkableLeads,
  pageRange,
  totalPages,
  canClaimLead,
  type MinimalLead,
} from '../lib/leads-list';

// Fixed reference time: mid-month so 'month' and 'week' windows are stable.
const NOW = new Date('2026-06-15T12:00:00.000Z'); // a Monday
const iso = (d: string) => new Date(d).toISOString();

const alice: SetterRow = { id: 'alice', email: 'alice@sunline.test', avatar_url: null };
const bob: SetterRow = { id: 'bob', email: 'bob@sunline.test', avatar_url: null };

// ---------------------------------------------------------------------------
// Booking funnel — per setter, correct breakdown + isolation
// ---------------------------------------------------------------------------
describe('computeSetterfunnel', () => {
  const appts: ApptRow[] = [
    // Alice — booked this month, various outcomes
    { id: 'a1', setter_id: 'alice', setter: null, outcome: 'booked', quality_rating: null,
      quality_reason: null, confirmed_at: iso('2026-06-11T10:00:00Z'), appt_date: iso('2026-06-20T10:00:00Z'), created_at: iso('2026-06-10T09:00:00Z') },
    { id: 'a2', setter_id: 'alice', setter: null, outcome: 'sat', quality_rating: 'up',
      quality_reason: null, confirmed_at: iso('2026-06-12T10:00:00Z'), appt_date: iso('2026-06-13T10:00:00Z'), created_at: iso('2026-06-11T09:00:00Z') },
    { id: 'a3', setter_id: 'alice', setter: null, outcome: 'no_show', quality_rating: null,
      quality_reason: null, confirmed_at: null, appt_date: iso('2026-06-13T10:00:00Z'), created_at: iso('2026-06-12T09:00:00Z') },
    { id: 'a4', setter_id: 'alice', setter: null, outcome: 'cancelled', quality_rating: null,
      quality_reason: null, confirmed_at: iso('2026-06-12T10:00:00Z'), appt_date: iso('2026-06-14T10:00:00Z'), created_at: iso('2026-06-12T11:00:00Z') },
    { id: 'a5', setter_id: 'alice', setter: null, outcome: 'sold', quality_rating: 'up',
      quality_reason: null, confirmed_at: iso('2026-06-13T10:00:00Z'), appt_date: iso('2026-06-14T10:00:00Z'), created_at: iso('2026-06-13T09:00:00Z') },
    // Alice — booked LAST month, must be excluded from 'month'
    { id: 'a6', setter_id: 'alice', setter: null, outcome: 'sat', quality_rating: null,
      quality_reason: null, confirmed_at: null, appt_date: iso('2026-05-20T10:00:00Z'), created_at: iso('2026-05-10T09:00:00Z') },
    // Bob — must not leak into Alice's numbers
    { id: 'b1', setter_id: 'bob', setter: null, outcome: 'no_show', quality_rating: null,
      quality_reason: null, confirmed_at: null, appt_date: iso('2026-06-13T10:00:00Z'), created_at: iso('2026-06-10T09:00:00Z') },
  ];

  it('breaks Alice down: booked/confirmed/sat/no-show/cancelled (this month)', () => {
    const f = computeSetterFunnel(alice, appts, [], 'month', NOW);
    expect(f.booked).toBe(5);          // a1..a5 booked in June
    expect(f.confirmed).toBe(4);       // a1,a2,a4,a5 have confirmed_at
    expect(f.sat).toBe(2);             // a2 (sat) + a5 (sold)
    expect(f.noShow).toBe(1);          // a3
    expect(f.cancelled).toBe(1);       // a4
    // show rate = sat / (sat + noShow) = 2/3
    expect(f.showRate).toBeCloseTo(2 / 3, 5);
    // confirm rate = 4/5
    expect(f.confirmRate).toBeCloseTo(0.8, 5);
  });

  it('excludes appointments booked outside the range', () => {
    const f = computeSetterFunnel(alice, appts, [], 'month', NOW);
    // a6 was booked in May — not counted
    expect(f.booked).toBe(5);
  });

  it("does not count another setter's appointments", () => {
    const f = computeSetterFunnel(alice, appts, [], 'month', NOW);
    // Bob's b1 no_show must not appear in Alice's numbers
    expect(f.noShow).toBe(1);
    const fb = computeSetterFunnel(bob, appts, [], 'month', NOW);
    expect(fb.booked).toBe(1);
    expect(fb.noShow).toBe(1);
  });

  it('honest with no data: rates are null, counts zero', () => {
    const f = computeSetterFunnel(alice, [], [], 'week', NOW);
    expect(f.booked).toBe(0);
    expect(f.showRate).toBeNull();
    expect(f.confirmRate).toBeNull();
    expect(f.bookingRatePerDial).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Activity — dials, talk-time, leads worked, pickup — for the right setter only
// ---------------------------------------------------------------------------
describe('computeSetterActivity', () => {
  const disps: DispositionRow[] = [
    { id: 'd1', lead_id: 'L1', disposition: 'no_answer', disqual_reason: null,
      created_by: 'alice', created_at: iso('2026-06-15T09:00:00Z'), talk_time_seconds: null },
    { id: 'd2', lead_id: 'L1', disposition: 'booked', disqual_reason: null,
      created_by: 'alice', created_at: iso('2026-06-15T09:05:00Z'), talk_time_seconds: 300 },
    { id: 'd3', lead_id: 'L2', disposition: 'callback', disqual_reason: null,
      created_by: 'alice', created_at: iso('2026-06-15T09:10:00Z'), talk_time_seconds: 120 },
    // Bob — excluded
    { id: 'd4', lead_id: 'L3', disposition: 'booked', disqual_reason: null,
      created_by: 'bob', created_at: iso('2026-06-15T09:00:00Z'), talk_time_seconds: 999 },
  ];

  it('counts only this setter, in range', () => {
    const a = computeSetterActivity('alice', disps, 'today', NOW);
    expect(a.dials).toBe(3);              // d1,d2,d3
    expect(a.contacted).toBe(2);          // booked + callback are contacts; no_answer isn't
    expect(a.leadsWorked).toBe(2);        // L1, L2 distinct
    expect(a.talkTimeSeconds).toBe(420);  // 300 + 120
    expect(a.talkTimeCaptured).toBe(true);
    expect(a.pickupRate).toBeCloseTo(2 / 3, 5);
  });

  it("does not include Bob's talk-time", () => {
    const a = computeSetterActivity('alice', disps, 'today', NOW);
    expect(a.talkTimeSeconds).toBe(420);
  });

  it('flags talk-time as not captured when all null', () => {
    const noTalk: DispositionRow[] = [
      { id: 'x', lead_id: 'L', disposition: 'no_answer', disqual_reason: null,
        created_by: 'alice', created_at: iso('2026-06-15T09:00:00Z'), talk_time_seconds: null },
    ];
    const a = computeSetterActivity('alice', noTalk, 'today', NOW);
    expect(a.talkTimeSeconds).toBe(0);
    expect(a.talkTimeCaptured).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Leaderboard rank (reuses existing output computation)
// ---------------------------------------------------------------------------
describe('leaderboardRank', () => {
  it('ranks by bookings desc', () => {
    const appts: ApptRow[] = [
      { id: '1', setter_id: 'alice', setter: null, outcome: 'booked', quality_rating: null,
        quality_reason: null, confirmed_at: null, appt_date: iso('2026-06-20T10:00:00Z'), created_at: iso('2026-06-14T09:00:00Z') },
    ];
    const disps: DispositionRow[] = [
      { id: 'a', lead_id: 'L1', disposition: 'booked', disqual_reason: null, created_by: 'alice', created_at: iso('2026-06-14T09:00:00Z') },
      { id: 'b', lead_id: 'L2', disposition: 'booked', disqual_reason: null, created_by: 'bob', created_at: iso('2026-06-14T09:00:00Z') },
      { id: 'c', lead_id: 'L3', disposition: 'booked', disqual_reason: null, created_by: 'bob', created_at: iso('2026-06-14T09:00:00Z') },
    ];
    const out = computeSetterOutput([alice, bob], disps, appts, 'month', NOW);
    expect(leaderboardRank(out, 'bob')).toBe(1);   // 2 bookings
    expect(leaderboardRank(out, 'alice')).toBe(2); // 1 booking
    expect(leaderboardRank(out, 'nobody')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pause/resume durations
// ---------------------------------------------------------------------------
describe('computeDialerTotals', () => {
  const dayStart = new Date('2026-06-15T00:00:00Z');

  it('sums active vs paused, using now for a live open session', () => {
    const sessions: SessionRow[] = [
      // active 09:00 → 10:00 (closed)
      { setter_id: 'alice', state: 'active', started_at: iso('2026-06-15T09:00:00Z'),
        ended_at: iso('2026-06-15T10:00:00Z'), last_heartbeat_at: iso('2026-06-15T10:00:00Z') },
      // paused 10:00 → 10:30 (closed)
      { setter_id: 'alice', state: 'paused', started_at: iso('2026-06-15T10:00:00Z'),
        ended_at: iso('2026-06-15T10:30:00Z'), last_heartbeat_at: iso('2026-06-15T10:30:00Z') },
      // active 10:30 → open, heartbeat just now → counts to NOW (12:00)
      { setter_id: 'alice', state: 'active', started_at: iso('2026-06-15T10:30:00Z'),
        ended_at: null, last_heartbeat_at: iso('2026-06-15T11:59:30Z') },
    ];
    const t = computeDialerTotals(sessions, 'alice', dayStart, NOW, NOW);
    // active: 60m + 90m = 150m ; paused: 30m
    expect(t.activeMs).toBe(150 * 60_000);
    expect(t.pausedMs).toBe(30 * 60_000);
  });

  it('caps a stale open session at its last heartbeat (closed tab)', () => {
    const sessions: SessionRow[] = [
      { setter_id: 'alice', state: 'active', started_at: iso('2026-06-15T08:00:00Z'),
        ended_at: null, last_heartbeat_at: iso('2026-06-15T08:30:00Z') }, // stale (hours ago)
    ];
    const t = computeDialerTotals(sessions, 'alice', dayStart, NOW, NOW);
    expect(t.activeMs).toBe(30 * 60_000); // capped at 08:30, not NOW
  });

  it('isolates by setter', () => {
    const sessions: SessionRow[] = [
      { setter_id: 'bob', state: 'active', started_at: iso('2026-06-15T09:00:00Z'),
        ended_at: iso('2026-06-15T11:00:00Z'), last_heartbeat_at: iso('2026-06-15T11:00:00Z') },
    ];
    const t = computeDialerTotals(sessions, 'alice', dayStart, NOW, NOW);
    expect(t.activeMs).toBe(0);
    expect(t.pausedMs).toBe(0);
  });

  it('clamps a session that starts before the window', () => {
    const sessions: SessionRow[] = [
      // starts yesterday 23:00, ends today 01:00 → only 01:00 counts in today
      { setter_id: 'alice', state: 'active', started_at: iso('2026-06-14T23:00:00Z'),
        ended_at: iso('2026-06-15T01:00:00Z'), last_heartbeat_at: iso('2026-06-15T01:00:00Z') },
    ];
    const t = computeDialerTotals(sessions, 'alice', dayStart, NOW, NOW);
    expect(t.activeMs).toBe(60 * 60_000); // just the hour after midnight
  });

  it('sessionEffectiveEnd: recent heartbeat → now', () => {
    const s: SessionRow = { setter_id: 'a', state: 'active', started_at: iso('2026-06-15T11:00:00Z'),
      ended_at: null, last_heartbeat_at: iso('2026-06-15T11:59:00Z') };
    expect(sessionEffectiveEnd(s, NOW)).toBe(NOW.getTime());
  });

  it('fmtDuration formats sanely', () => {
    expect(fmtDuration(0)).toBe('0m');
    expect(fmtDuration(30_000)).toBe('< 1m');
    expect(fmtDuration(45 * 60_000)).toBe('45m');
    expect(fmtDuration(125 * 60_000)).toBe('2h 5m');
    expect(fmtDuration(120 * 60_000)).toBe('2h');
  });
});

// ---------------------------------------------------------------------------
// Master leads list — workable rule, filters, pagination, locking
// ---------------------------------------------------------------------------
describe('leads-list workable rule', () => {
  const base = (over: Partial<MinimalLead>): MinimalLead => ({
    id: 'x', name: 'Sarah Jones', monthly_bill: 120, created_at: iso('2026-06-14T09:00:00Z'),
    no_answer_count: 0, consent: true, status: 'new', ...over,
  });

  it('includes new/contacted/qualified, excludes booked/disqualified', () => {
    expect(isWorkableStatus('new')).toBe(true);
    expect(isWorkableStatus('contacted')).toBe(true);
    expect(isWorkableStatus('qualified')).toBe(true);
    expect(isWorkableStatus('booked')).toBe(false);
    expect(isWorkableStatus('disqualified')).toBe(false);
  });

  it('excludes non-consented leads', () => {
    expect(isWorkableLead(base({ consent: false }))).toBe(false);
    expect(isWorkableLead(base({ consent: true }))).toBe(true);
  });

  it('filterWorkableLeads drops booked/disqualified/cancelled-out and unconsented', () => {
    const leads = [
      base({ id: '1', status: 'new' }),
      base({ id: '2', status: 'contacted' }),
      base({ id: '3', status: 'booked' }),        // excluded (booked)
      base({ id: '4', status: 'disqualified' }),  // excluded (dead)
      base({ id: '5', status: 'new', consent: false }), // excluded (no consent)
    ];
    const out = filterWorkableLeads(leads, { now: NOW });
    expect(out.map((l) => l.id).sort()).toEqual(['1', '2']);
  });

  it('search filters by name (case-insensitive)', () => {
    const leads = [
      base({ id: '1', name: 'Sarah Jones' }),
      base({ id: '2', name: 'Tom Baker' }),
    ];
    expect(filterWorkableLeads(leads, { search: 'sarah', now: NOW }).map((l) => l.id)).toEqual(['1']);
    expect(filterWorkableLeads(leads, { search: 'BAKER', now: NOW }).map((l) => l.id)).toEqual(['2']);
  });

  it('pipeline filter matches computed pipeline', () => {
    const p1 = base({ id: 'p1', created_at: iso('2026-06-14T09:00:00Z'), no_answer_count: 0 }); // fresh → P1
    const p3 = base({ id: 'p3', created_at: iso('2026-04-01T09:00:00Z'), no_answer_count: 0 }); // >30d → P3
    const leads = [p1, p3];
    expect(filterWorkableLeads(leads, { pipeline: 1, now: NOW }).map((l) => l.id)).toEqual(['p1']);
    expect(filterWorkableLeads(leads, { pipeline: 3, now: NOW }).map((l) => l.id)).toEqual(['p3']);
  });
});

describe('pagination', () => {
  it('pageRange computes safe from/to', () => {
    expect(pageRange(1, 25)).toMatchObject({ from: 0, to: 24 });
    expect(pageRange(2, 25)).toMatchObject({ from: 25, to: 49 });
    expect(pageRange(0, 25)).toMatchObject({ page: 1, from: 0, to: 24 }); // clamps to page 1
    expect(pageRange(-5, 10)).toMatchObject({ page: 1, from: 0 });
  });

  it('totalPages rounds up, min 1', () => {
    expect(totalPages(0, 25)).toBe(1);
    expect(totalPages(25, 25)).toBe(1);
    expect(totalPages(26, 25)).toBe(2);
    expect(totalPages(51, 25)).toBe(3);
  });
});

describe('canClaimLead (locking)', () => {
  const workable = { status: 'new', consent: true } as const;

  it('unclaimed workable lead is claimable', () => {
    expect(canClaimLead({ ...workable, queue_claimed_by: null, queue_claimed_at: null }, 'alice', NOW)).toBe(true);
  });

  it('lead claimed by another setter (fresh) is NOT claimable', () => {
    expect(canClaimLead(
      { ...workable, queue_claimed_by: 'bob', queue_claimed_at: iso('2026-06-15T11:55:00Z') },
      'alice', NOW,
    )).toBe(false);
  });

  it('own claim is re-claimable', () => {
    expect(canClaimLead(
      { ...workable, queue_claimed_by: 'alice', queue_claimed_at: iso('2026-06-15T11:55:00Z') },
      'alice', NOW,
    )).toBe(true);
  });

  it('stale claim (>30m) by another setter is reclaimable', () => {
    expect(canClaimLead(
      { ...workable, queue_claimed_by: 'bob', queue_claimed_at: iso('2026-06-15T11:00:00Z') },
      'alice', NOW,
    )).toBe(true);
  });

  it('non-workable or unconsented lead is never claimable', () => {
    expect(canClaimLead({ status: 'booked', consent: true, queue_claimed_by: null, queue_claimed_at: null }, 'alice', NOW)).toBe(false);
    expect(canClaimLead({ status: 'new', consent: false, queue_claimed_by: null, queue_claimed_at: null }, 'alice', NOW)).toBe(false);
  });
});
