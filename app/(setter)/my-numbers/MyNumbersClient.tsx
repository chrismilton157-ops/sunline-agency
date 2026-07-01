'use client';
import { useState } from 'react';
import Link from 'next/link';
import { fmtInt, fmtPct } from '@/lib/format';
import { SETTER_BENCHMARKS } from '@/lib/setter-metrics';
import type {
  SetterOutputStats,
  SetterActivity,
  SetterFunnel,
} from '@/lib/setter-metrics';
import { fmtDuration } from '@/lib/setter-sessions';
import { Avatar } from '@/components/Avatar';

type Range = 'today' | 'week' | 'month';

type RangeData = {
  output: SetterOutputStats | null;
  rank: number | null;
  activity: SetterActivity;
  funnel: SetterFunnel | null;
};

type Props = {
  byRange: Record<Range, RangeData>;
  displayName: string;
  initials: string;
  avatarUrl: string | null;
  dialerToday: { activeMs: number; pausedMs: number };
};

const RANGE_LABEL: Record<Range, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
};

function fmtTalk(seconds: number, captured: boolean): string {
  if (!captured || seconds <= 0) return '—';
  return fmtDuration(seconds * 1000);
}

export function MyNumbersClient({
  byRange, displayName, initials, avatarUrl, dialerToday,
}: Props) {
  const [range, setRange] = useState<Range>('week');
  const data = byRange[range];
  const { activity, funnel, output, rank } = data;

  const dialerTotalMs = dialerToday.activeMs + dialerToday.pausedMs;
  const activePct =
    dialerTotalMs > 0 ? dialerToday.activeMs / dialerTotalMs : null;

  return (
    <div className="space-y-8">
      {/* Identity + range toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <Avatar avatarUrl={avatarUrl} initials={initials} sizeCls="w-11 h-11 text-base" ring="amber" />
        <div className="mr-auto">
          <div className="font-semibold text-lg leading-tight">{displayName}</div>
          <Link href="/leaderboard" className="text-xs text-amber hover:underline">
            {rank != null ? `Ranked #${rank} on the leaderboard →` : 'View the leaderboard →'}
          </Link>
        </div>
        <div className="flex gap-2">
          {(['today', 'week', 'month'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
                ${range === r
                  ? 'bg-amber text-white shadow-[0_2px_8px_0_rgba(224,123,57,0.25)]'
                  : 'bg-hairline/30 text-ink hover:bg-hairline/60 active:scale-[0.97]'
                }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Activity */}
      <section>
        <h2 className="text-base font-semibold mb-3">Activity — {RANGE_LABEL[range].toLowerCase()}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Tile label="Dials" value={fmtInt(activity.dials)} />
          <Tile label="Talk-time"
            value={fmtTalk(activity.talkTimeSeconds, activity.talkTimeCaptured)}
            sub={activity.talkTimeCaptured ? undefined : 'best-effort'} />
          <Tile label="Pickups" value={fmtInt(activity.contacted)}
            sub={activity.pickupRate != null ? `${fmtPct(activity.pickupRate)} answer rate` : undefined} />
          <Tile label="Leads worked" value={fmtInt(activity.leadsWorked)} />
        </div>
      </section>

      {/* Dialer time today (always today, regardless of range toggle) */}
      <section>
        <h2 className="text-base font-semibold mb-3">Dialer time today</h2>
        <div className="rounded-xl border border-hairline p-4">
          {dialerTotalMs > 0 ? (
            <>
              <div className="flex items-baseline justify-between mb-2 text-sm">
                <span className="text-good font-semibold num">
                  {fmtDuration(dialerToday.activeMs)} on the dialer
                </span>
                <span className="text-muted num">
                  {fmtDuration(dialerToday.pausedMs)} paused
                </span>
              </div>
              <div className="h-2 rounded-full bg-hairline/60 overflow-hidden flex">
                <div className="bg-good h-full" style={{ width: `${(activePct ?? 0) * 100}%` }} />
                <div className="bg-amber/50 h-full" style={{ width: `${(1 - (activePct ?? 0)) * 100}%` }} />
              </div>
              {activePct != null && (
                <div className="text-xs text-muted mt-2">
                  {fmtPct(activePct)} of your time today was active.
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-muted">
              No dialer time recorded today yet. Open the Call queue to start.
            </div>
          )}
        </div>
      </section>

      {/* Booking funnel */}
      <section>
        <h2 className="text-base font-semibold mb-3">Booking funnel — {RANGE_LABEL[range].toLowerCase()}</h2>
        {funnel && funnel.booked > 0 ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <FunnelTile label="Booked" value={funnel.booked} tone="amber" highlight />
              <FunnelTile label="Confirmed" value={funnel.confirmed} tone="ink"
                sub={funnel.confirmRate != null ? fmtPct(funnel.confirmRate) : undefined} />
              <FunnelTile label="Sat / showed" value={funnel.sat} tone="good" />
              <FunnelTile label="No-showed" value={funnel.noShow} tone="bad" />
              <FunnelTile label="Cancelled" value={funnel.cancelled} tone="muted" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <Tile label="Show rate" value={fmtPct(funnel.showRate)}
                sub={`Target ${fmtPct(SETTER_BENCHMARKS.targetShowRate)}`}
                good={funnel.showRate != null && funnel.showRate >= SETTER_BENCHMARKS.targetShowRate} />
              <Tile label="Booking rate (per pickup)" value={fmtPct(funnel.bookingRatePerPickup)}
                sub={`Target ${fmtPct(SETTER_BENCHMARKS.targetBookingRate)}`}
                good={funnel.bookingRatePerPickup != null && funnel.bookingRatePerPickup >= SETTER_BENCHMARKS.targetBookingRate} />
              <Tile label="Booking rate (per dial)" value={fmtPct(funnel.bookingRatePerDial)} />
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-hairline p-6 text-center text-sm text-muted">
            No appointments booked in this period yet — book one and the funnel
            (booked → confirmed → sat → no-show / cancelled) fills in here.
          </div>
        )}
      </section>

      {/* Confirmation rate context (reuses existing output metric) */}
      {output && (
        <section className="rounded-xl border border-hairline/60 bg-hairline/10 p-4">
          <div className="grid grid-cols-3 gap-4 text-sm text-center">
            <div>
              <div className="num font-semibold">{fmtInt(output.bookings)}</div>
              <div className="text-xs text-muted mt-0.5">Bookings</div>
            </div>
            <div>
              <div className="num font-semibold">{fmtPct(output.confirmationRate)}</div>
              <div className="text-xs text-muted mt-0.5">Confirmation rate</div>
            </div>
            <div>
              <div className="num font-semibold">{rank != null ? `#${rank}` : '—'}</div>
              <div className="text-xs text-muted mt-0.5">Leaderboard rank</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({
  label, value, sub, good, highlight,
}: {
  label: string; value: string; sub?: string; good?: boolean; highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 text-center
      ${highlight ? 'border-amber/40 bg-amber/5' : 'border-hairline bg-white'}`}>
      <div className={`text-2xl font-bold num ${good ? 'text-good' : highlight ? 'text-amber' : 'text-ink'}`}>
        {value}
      </div>
      <div className="text-xs text-muted mt-1">{label}</div>
      {sub && <div className="text-xs text-muted/70 mt-0.5">{sub}</div>}
    </div>
  );
}

function FunnelTile({
  label, value, tone, sub, highlight,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'good' | 'bad' | 'ink' | 'muted';
  sub?: string;
  highlight?: boolean;
}) {
  const toneCls =
    tone === 'amber' ? 'text-amber'
    : tone === 'good' ? 'text-good'
    : tone === 'bad' ? 'text-bad'
    : tone === 'muted' ? 'text-muted'
    : 'text-ink';
  return (
    <div className={`rounded-xl border p-4 text-center
      ${highlight ? 'border-amber/40 bg-amber/5' : 'border-hairline bg-white'}`}>
      <div className={`text-2xl font-bold num ${toneCls}`}>{fmtInt(value)}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
      {sub && <div className="text-xs text-muted/70 mt-0.5">{sub}</div>}
    </div>
  );
}
