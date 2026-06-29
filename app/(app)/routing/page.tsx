import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Routing' };

import { RoutingSimulator } from '@/components/RoutingSimulator';
import { loadRoutingState } from '@/lib/data';
import { clusterPromises, fillPercent, weekBoundsUTC } from '@/lib/routing';
import { fmtInt, fmtPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function RoutingPage() {
  const now = new Date();
  const { routingClients, volumes, weekStart } = await loadRoutingState(now);
  const clusters = clusterPromises(routingClients, volumes);
  const { fractionRemaining } = weekBoundsUTC(now);

  const weekStartLabel = weekStart.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const weekRemainingPct = Math.round(fractionRemaining * 100);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Routing
        </h1>
        <p className="text-muted text-sm mt-1">
          Week starting{' '}
          <span className="num">{weekStartLabel}</span> ·{' '}
          <span className="num">{weekRemainingPct}%</span> of the week remaining
          {fractionRemaining <= 0.3 && (
            <span className="text-bad font-medium"> · starvation floor active</span>
          )}
        </p>
      </header>

      {/* Per-client routing state */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">This week, by client</h2>
          <p className="text-muted text-xs mt-0.5">
            Delivered vs promised this week, postcode coverage, and priority.
          </p>
        </header>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-5 py-2">Client</th>
              <th className="text-left font-medium px-3 py-2">Coverage</th>
              <th className="text-right font-medium px-3 py-2">Priority</th>
              <th className="text-right font-medium px-3 py-2">This week</th>
              <th className="text-left font-medium px-5 py-2 w-56">Promise filled</th>
            </tr>
          </thead>
          <tbody>
            {routingClients.map((c) => {
              const fill = fillPercent(c);
              const pct = Math.min(100, Math.round(fill * 100));
              const barTone =
                fill >= 1
                  ? 'bg-good'
                  : fill >= 0.5
                    ? 'bg-amber'
                    : 'bg-bad';
              return (
                <tr
                  key={c.id}
                  className="border-b last:border-b-0 border-hairline"
                >
                  <td className="px-5 py-3 align-top">
                    <div className="font-medium">{c.company}</div>
                    <div className="text-muted text-xs num">
                      joined {c.joined_at}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="flex flex-wrap gap-1">
                      {c.covered_postcodes.length === 0 ? (
                        <span className="text-muted text-xs">no postcodes</span>
                      ) : (
                        c.covered_postcodes.map((p) => (
                          <span
                            key={p}
                            className="num text-[11px] px-1.5 py-0.5 rounded bg-hairline/40 text-ink"
                          >
                            {p}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top text-right num">
                    {fmtInt(c.priority)}
                  </td>
                  <td className="px-3 py-3 align-top text-right num">
                    {fmtInt(c.leads_this_week)} / {fmtInt(c.weekly_promise)}
                  </td>
                  <td className="px-5 py-3 align-top">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-hairline/50 rounded-sm overflow-hidden">
                        <div
                          className={`h-full ${barTone}`}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <span className="num text-xs text-muted w-10 text-right">
                        {fmtPct(fill)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {routingClients.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted">
                  No active clients.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Over-promise warnings */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">Over-promise check</h2>
          <p className="text-muted text-xs mt-0.5">
            Total weekly promises vs realistic supply, per postcode cluster.
          </p>
        </header>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-5 py-2">Prefix</th>
              <th className="text-left font-medium px-3 py-2">Covered by</th>
              <th className="text-right font-medium px-3 py-2">Typical / wk</th>
              <th className="text-right font-medium px-3 py-2">Promised</th>
              <th className="text-right font-medium px-5 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((cl) => (
              <tr
                key={cl.postcode_prefix}
                className={`border-b last:border-b-0 border-hairline ${
                  cl.warn ? 'bg-bad/5' : ''
                }`}
              >
                <td className="px-5 py-3 align-top num font-medium">
                  {cl.postcode_prefix}
                </td>
                <td className="px-3 py-3 align-top">
                  {cl.covering.length === 0 ? (
                    <span className="text-muted text-xs">no client</span>
                  ) : (
                    <div className="space-y-0.5 text-xs">
                      {cl.covering.map((c) => (
                        <div key={c.client_id}>
                          {c.company}{' '}
                          <span className="num text-muted">
                            ({fmtInt(c.weekly_promise)}/wk)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 align-top text-right num">
                  {fmtInt(cl.typical_weekly_leads)}
                </td>
                <td className="px-3 py-3 align-top text-right num">
                  {fmtInt(cl.total_promised)}
                </td>
                <td className="px-5 py-3 align-top text-right">
                  {cl.covering.length === 0 ? (
                    <span className="text-xs text-muted">uncovered</span>
                  ) : cl.warn ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-bad/10 text-bad border border-bad/30">
                      over-promised
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-good/10 text-good border border-good/30">
                      OK
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {clusters.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted">
                  No postcode volume data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Simulator */}
      <section className="card p-5">
        <h2 className="font-semibold mb-1">Simulate a lead</h2>
        <p className="text-muted text-xs mb-4">
          Enter a postcode — we&apos;ll show which client would get it next, and which rule fired.
          This does NOT consume a real lead or update any data.
        </p>
        <RoutingSimulator />
      </section>
    </div>
  );
}
