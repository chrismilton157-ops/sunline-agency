'use client';
import { useState } from 'react';
import { fmtPct, fmtInt } from '@/lib/format';
import { SETTER_BENCHMARKS } from '@/lib/setter-metrics';
import type { SetterQualityStats, ClaimSummary } from '@/lib/setter-metrics';
import { Avatar } from '@/components/Avatar';

type Range = 'today' | 'week' | 'month';

type Props = {
  byRange: Record<Range, SetterQualityStats[]>;
  claimsByRange: Record<Range, ClaimSummary>;
};

function fmtSpeed(mins: number | null): string {
  if (mins === null) return '—';
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function speedColor(mins: number | null): string {
  if (mins === null) return 'text-muted';
  if (mins <= 15) return 'text-good font-semibold';
  if (mins <= 60) return 'text-amber font-semibold';
  return 'text-bad font-semibold';
}

export function SettersClient({ byRange, claimsByRange }: Props) {
  const [range, setRange] = useState<Range>('week');
  const stats = byRange[range];
  const claims = claimsByRange[range];

  const ranked = [...stats].sort(
    (a, b) => b.bookings - a.bookings || (b.bookingRate ?? 0) - (a.bookingRate ?? 0),
  );

  const top3 = ranked.slice(0, 3);
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3;

  const flagged = ranked.filter((s) => s.qualityFlag);

  return (
    <div className="space-y-8">
      {/* Time range toggle */}
      <div className="flex gap-2 flex-wrap">
        {(['today', 'week', 'month'] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${range === r
                ? 'bg-amber text-white'
                : 'bg-hairline/30 text-ink hover:bg-hairline/60'
              }`}
          >
            {r === 'today' ? 'Today' : r === 'week' ? 'This week' : 'This month'}
          </button>
        ))}
      </div>

      {/* Quality flags — owner-only alert */}
      {flagged.length > 0 && (
        <section className="space-y-2">
          {flagged.map((s) => (
            <div key={s.setterId}
              className="rounded-md border border-bad/30 bg-bad/8 px-4 py-3 text-sm flex items-start gap-3">
              <span className="text-bad font-semibold shrink-0">⚠ Quality flag</span>
              <span className="text-ink">
                <strong>{s.displayName}</strong>: {s.qualityFlagReason}
              </span>
            </div>
          ))}
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
              return (
                <div key={s.setterId} className="flex flex-col items-center gap-2 w-28">
                  <Avatar
                    avatarUrl={s.avatarUrl}
                    initials={s.initials}
                    sizeCls="w-14 h-14 text-lg"
                    ring={s.qualityFlag ? 'bad' : null}
                    rankFirst={actualRank === 1}
                  />
                  <div className="text-center">
                    <div className="text-xs font-medium truncate w-28 text-center">{s.displayName}</div>
                    <div className="num text-sm font-semibold">{fmtInt(s.bookings)} booked</div>
                    <div className="text-xs text-muted">{fmtPct(s.bookingRate)} rate</div>
                    {s.qualityFlag && (
                      <div className="text-xs text-bad mt-0.5">⚠ quality flag</div>
                    )}
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

      {/* Full table — output + quality side by side */}
      {ranked.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">All setters</h2>
          <div className="rounded-xl border border-hairline overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-hairline/30 text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Setter</th>
                  <th className="px-4 py-3 text-right num">Dials</th>
                  <th className="px-4 py-3 text-right num">Contacts</th>
                  <th className="px-4 py-3 text-right num">Bookings</th>
                  <th className="px-4 py-3 text-right num">Booking rate</th>
                  {/* Owner-only quality columns */}
                  <th className="px-4 py-3 text-right num text-amber/80">No-show rate</th>
                  <th className="px-4 py-3 text-right num text-amber/80">Down-rating</th>
                  <th className="px-4 py-3 text-right num text-amber/80">Disquals</th>
                  <th className="px-4 py-3 text-left"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {ranked.map((s, i) => {
                  const noShowBad = s.noShowRate != null && s.noShowRate >= 0.25;
                  const downBad = s.downRatingRate != null && s.downRatingRate >= 0.30;
                  return (
                    <tr key={s.setterId} className="hover:bg-hairline/10">
                      <td className="px-4 py-3 text-muted num">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar
                            avatarUrl={s.avatarUrl}
                            initials={s.initials}
                            sizeCls="w-7 h-7 text-xs"
                            ring={s.qualityFlag ? 'bad' : null}
                          />
                          <div>
                            <div className="font-medium">{s.displayName}</div>
                            <div className="text-xs text-muted">{s.setterEmail}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right num">{fmtInt(s.dials)}</td>
                      <td className="px-4 py-3 text-right num">{fmtInt(s.contacted)}</td>
                      <td className="px-4 py-3 text-right num font-semibold">{fmtInt(s.bookings)}</td>
                      <td className="px-4 py-3 text-right num">
                        <span className={s.bookingRate != null && s.bookingRate >= SETTER_BENCHMARKS.targetBookingRate
                          ? 'text-good' : ''}>
                          {fmtPct(s.bookingRate)}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right num ${noShowBad ? 'text-bad font-semibold' : ''}`}>
                        {s.appointmentsOccurred > 0 ? fmtPct(s.noShowRate) : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right num ${downBad ? 'text-bad font-semibold' : ''}`}>
                        {s.totalRated > 0 ? fmtPct(s.downRatingRate) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right num">{fmtInt(s.disqualCount)}</td>
                      <td className="px-4 py-3">
                        {s.qualityFlag && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                            bg-bad/10 text-bad border border-bad/30 whitespace-nowrap">
                            ⚠ quality flag
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted mt-2">
            Amber columns are owner-only — setters never see no-show rates, down-ratings, or disqual counts.
          </p>
        </section>
      )}

      {/* Per-setter quality detail cards */}
      {ranked.some((s) => s.disqualReasons.length > 0) && (
        <section>
          <h2 className="text-base font-semibold mb-3">Disqualification breakdown</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {ranked.filter((s) => s.disqualCount > 0).map((s) => (
              <div key={s.setterId} className="rounded-xl border border-hairline p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Avatar
                    avatarUrl={s.avatarUrl}
                    initials={s.initials}
                    sizeCls="w-8 h-8 text-xs"
                  />
                  <div>
                    <div className="text-sm font-medium">{s.displayName}</div>
                    <div className="text-xs text-muted">{s.disqualCount} disquals total</div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {s.disqualReasons.map(({ reason, count }) => (
                    <div key={reason} className="flex items-center justify-between text-xs">
                      <span className="text-ink capitalize">{reason.replace(/_/g, ' ')}</span>
                      <span className="num font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {ranked.length === 0 && (
        <div className="text-center py-16 text-muted">
          <div className="text-4xl mb-3">📋</div>
          <div className="text-sm">No setter activity in this period yet.</div>
        </div>
      )}

      {/* Claim speed — owner-only */}
      <section>
        <h2 className="text-base font-semibold mb-1">Speed-to-claim</h2>
        <p className="text-xs text-muted mb-4">
          Time between a lead arriving in the system and a setter first claiming it.
          Faster = fresher leads. Tracking starts from deploy — older leads show —.
        </p>

        {/* Team average highlight */}
        <div className="rounded-xl border border-hairline p-4 mb-4 flex items-center gap-6">
          <div>
            <div className="text-xs text-muted uppercase tracking-wide font-semibold mb-1">Team average</div>
            <div className={`num text-2xl ${speedColor(claims.teamAvgSpeedMins)}`}>
              {fmtSpeed(claims.teamAvgSpeedMins)}
            </div>
          </div>
          {claims.fastestSetterId && (() => {
            const fastest = claims.perSetter.find((s) => s.setterId === claims.fastestSetterId);
            return fastest ? (
              <div className="border-l border-hairline pl-6">
                <div className="text-xs text-muted uppercase tracking-wide font-semibold mb-1">Fastest claimer</div>
                <div className="flex items-center gap-2">
                  <Avatar avatarUrl={fastest.avatarUrl} initials={fastest.initials} sizeCls="w-7 h-7 text-xs" />
                  <div>
                    <div className="text-sm font-medium">{fastest.displayName}</div>
                    <div className={`num text-sm ${speedColor(fastest.avgSpeedMins)}`}>
                      {fmtSpeed(fastest.avgSpeedMins)}
                    </div>
                  </div>
                </div>
              </div>
            ) : null;
          })()}
          {claims.teamAvgSpeedMins === null && (
            <p className="text-sm text-muted">
              No claim timestamps yet — claim a few leads as a setter to see this metric.
            </p>
          )}
        </div>

        {/* Per-setter table */}
        {claims.perSetter.some((s) => s.claimCount > 0) && (
          <div className="rounded-xl border border-hairline overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-hairline/30 text-muted text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Setter</th>
                  <th className="px-4 py-3 text-right num">Claims</th>
                  <th className="px-4 py-3 text-right num">Avg speed-to-claim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {claims.perSetter
                  .filter((s) => s.claimCount > 0)
                  .sort((a, b) => (a.avgSpeedMins ?? Infinity) - (b.avgSpeedMins ?? Infinity))
                  .map((s) => (
                    <tr key={s.setterId} className="hover:bg-hairline/10">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar avatarUrl={s.avatarUrl} initials={s.initials} sizeCls="w-7 h-7 text-xs" />
                          <span className="font-medium">{s.displayName}</span>
                          {s.setterId === claims.fastestSetterId && (
                            <span className="text-xs text-good bg-good/10 border border-good/20 px-1.5 py-0.5 rounded-full">
                              fastest
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right num">{fmtInt(s.claimCount)}</td>
                      <td className={`px-4 py-3 text-right num ${speedColor(s.avgSpeedMins)}`}>
                        {fmtSpeed(s.avgSpeedMins)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted mt-2">
          Owner-only. Green ≤ 15 min · amber ≤ 60 min · red &gt; 60 min.
          Speed anchored to lead created_at.
        </p>
      </section>

      {/* Benchmarks */}
      <section className="rounded-xl border border-hairline/60 bg-hairline/10 p-4">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Targets</h3>
        <div className="grid grid-cols-3 gap-4 text-sm text-center">
          <div>
            <div className="num font-semibold">{fmtPct(SETTER_BENCHMARKS.targetBookingRate)}</div>
            <div className="text-xs text-muted mt-0.5">Booking rate</div>
          </div>
          <div>
            <div className="num font-semibold">{fmtPct(SETTER_BENCHMARKS.targetPickupRate)}</div>
            <div className="text-xs text-muted mt-0.5">Pickup rate</div>
          </div>
          <div>
            <div className="num font-semibold">&lt; 25%</div>
            <div className="text-xs text-muted mt-0.5">No-show rate (max)</div>
          </div>
        </div>
      </section>
    </div>
  );
}
