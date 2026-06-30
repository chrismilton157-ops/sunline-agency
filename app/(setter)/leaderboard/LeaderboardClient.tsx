'use client';
import { useState } from 'react';
import { fmtPct, fmtInt } from '@/lib/format';
import { SETTER_BENCHMARKS } from '@/lib/setter-metrics';
import type { SetterOutputStats } from '@/lib/setter-metrics';
import { Avatar } from '@/components/Avatar';
import { ProfilePhotoUpload } from './ProfilePhotoUpload';
import { EmptyState } from '@/components/EmptyState';

type Range = 'today' | 'week' | 'month';

type Props = {
  byRange: Record<Range, SetterOutputStats[]>;
  myId: string;
  myInitials: string;
  myAvatarUrl: string | null;
};

export function LeaderboardClient({ byRange, myId, myInitials, myAvatarUrl }: Props) {
  const [range, setRange] = useState<Range>('week');
  const stats = byRange[range];

  // Sort by bookings desc
  const ranked = [...stats].sort(
    (a, b) => b.bookings - a.bookings || (b.bookingRate ?? 0) - (a.bookingRate ?? 0),
  );

  const me = ranked.find((s) => s.setterId === myId);
  const myRank = ranked.findIndex((s) => s.setterId === myId) + 1;

  const top3 = ranked.slice(0, 3);
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
    ? [top3[0], top3[1]]
    : top3;

  return (
    <div className="space-y-8">
      {/* Time range toggle */}
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
            {r === 'today' ? 'Today' : r === 'week' ? 'This week' : 'This month'}
          </button>
        ))}
      </div>

      {/* My stats card */}
      {me && (
        <section>
          <h2 className="text-base font-semibold mb-3">My stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Profile photo upload — spans 1 cell on mobile, stays compact */}
            <div className="border border-hairline rounded-xl p-4 flex flex-col items-center justify-center gap-1">
              <ProfilePhotoUpload
                userId={myId}
                initials={myInitials}
                currentAvatarUrl={myAvatarUrl}
              />
            </div>
            <StatBox label="Dials" value={fmtInt(me.dials)} />
            <StatBox label="Contacts" value={fmtInt(me.contacted)} />
            <StatBox label="Bookings" value={fmtInt(me.bookings)} highlight />
            <StatBox label="Booking rate" value={fmtPct(me.bookingRate)}
              sub={`Target ${fmtPct(SETTER_BENCHMARKS.targetBookingRate)}`}
              good={me.bookingRate != null && me.bookingRate >= SETTER_BENCHMARKS.targetBookingRate} />
            <StatBox label="Pickup rate" value={fmtPct(me.pickupRate)}
              sub={`Target ${fmtPct(SETTER_BENCHMARKS.targetPickupRate)}`}
              good={me.pickupRate != null && me.pickupRate >= SETTER_BENCHMARKS.targetPickupRate} />
            <StatBox label="Confirmation rate" value={fmtPct(me.confirmationRate)}
              sub={`Target ${fmtPct(SETTER_BENCHMARKS.targetConfirmationRate)}`}
              good={me.confirmationRate != null && me.confirmationRate >= SETTER_BENCHMARKS.targetConfirmationRate} />
            <div className="bg-amber/10 border border-amber/30 rounded-xl p-4 text-center col-span-2 md:col-span-1">
              <div className="text-3xl font-bold num text-amber">#{myRank}</div>
              <div className="text-xs text-muted mt-1">Leaderboard rank</div>
            </div>
          </div>
        </section>
      )}

      {/* Podium */}
      {ranked.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-4">
            Top setters — {range === 'today' ? 'today' : range === 'week' ? 'this week' : 'this month'}
          </h2>
          <div className="flex items-end justify-center gap-4 mb-6">
            {podiumOrder.map((s) => {
              const actualRank = ranked.indexOf(s) + 1;
              const height = actualRank === 1 ? 'h-28' : actualRank === 2 ? 'h-20' : 'h-14';
              const bgColor = actualRank === 1 ? 'bg-amber' : actualRank === 2 ? 'bg-hairline' : 'bg-hairline/60';
              const isMe = s.setterId === myId;
              return (
                <div key={s.setterId} className="flex flex-col items-center gap-2 w-28">
                  <Avatar
                    avatarUrl={s.avatarUrl}
                    initials={s.initials}
                    sizeCls="w-14 h-14 text-lg"
                    ring={isMe ? 'amber' : null}
                    rankFirst={actualRank === 1}
                  />
                  <div className="text-center">
                    <div className="text-xs font-medium truncate w-28 text-center">{s.displayName}</div>
                    <div className="num text-sm font-semibold">{fmtInt(s.bookings)} booked</div>
                    <div className="text-xs text-muted">{fmtPct(s.bookingRate)} rate</div>
                  </div>
                  <div className={`w-full ${height} ${bgColor} rounded-t-md flex items-center justify-center text-white font-bold text-lg`}>
                    {actualRank}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Full ranking table */}
      {ranked.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Full ranking</h2>
          <div className="rounded-xl border border-hairline overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-hairline/30 text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Setter</th>
                  <th className="px-4 py-3 text-right num">Dials</th>
                  <th className="px-4 py-3 text-right num">Contacts</th>
                  <th className="px-4 py-3 text-right num">Bookings</th>
                  <th className="px-4 py-3 text-right num">Booking rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {ranked.map((s, i) => {
                  const isMe = s.setterId === myId;
                  return (
                    <tr key={s.setterId}
                      className={`transition-colors duration-100 ${isMe ? 'bg-amber/5 font-medium' : 'hover:bg-amber/[0.03]'}`}>
                      <td className="px-4 py-3 text-muted num">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar
                            avatarUrl={s.avatarUrl}
                            initials={s.initials}
                            sizeCls="w-7 h-7 text-xs"
                            ring={isMe ? 'amber' : null}
                          />
                          <span>{s.displayName}</span>
                          {isMe && <span className="text-xs text-amber font-medium">you</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right num">{fmtInt(s.dials)}</td>
                      <td className="px-4 py-3 text-right num">{fmtInt(s.contacted)}</td>
                      <td className="px-4 py-3 text-right num font-semibold">{fmtInt(s.bookings)}</td>
                      <td className="px-4 py-3 text-right num">{fmtPct(s.bookingRate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {ranked.length === 0 && (
        <div className="card overflow-hidden">
          <EmptyState
            preset="leaderboard"
            heading="No activity in this period"
            body="Start dialling — your stats and ranking will appear here once calls are logged."
          />
        </div>
      )}

      {/* Benchmarks footer */}
      <section className="rounded-xl border border-hairline/60 bg-hairline/10 p-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Benchmarks</h3>
        <div className="grid grid-cols-3 gap-4 text-sm text-center">
          <div>
            <div className="num font-semibold">{fmtPct(SETTER_BENCHMARKS.targetBookingRate)}</div>
            <div className="text-xs text-muted mt-0.5">Target booking rate</div>
          </div>
          <div>
            <div className="num font-semibold">{fmtPct(SETTER_BENCHMARKS.targetPickupRate)}</div>
            <div className="text-xs text-muted mt-0.5">Target pickup rate</div>
          </div>
          <div>
            <div className="num font-semibold">{fmtPct(SETTER_BENCHMARKS.targetConfirmationRate)}</div>
            <div className="text-xs text-muted mt-0.5">Target confirmation rate</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatBox({
  label, value, sub, good, highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
  highlight?: boolean;
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
