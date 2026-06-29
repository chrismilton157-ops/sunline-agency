import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Routing' };

import { RoutingSimulator } from '@/components/RoutingSimulator';
import { AdaptiveSimulator } from '@/components/AdaptiveSimulator';
import { loadRoutingState } from '@/lib/data';
import { loadAdaptiveMetrics } from '@/lib/adaptive-data';
import { clusterPromises, fillPercent, weekBoundsUTC } from '@/lib/routing';
import { getSettings } from '@/lib/settings';
import { fmtInt, fmtPct } from '@/lib/format';
import type { LearnedClientRate, LearnedPostcodeRate } from '@/lib/adaptive-routing';

export const dynamic = 'force-dynamic';

function qualityBadge(q: LearnedClientRate['data_quality']) {
  if (q === 'sufficient') return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-good/10 text-good border border-good/30">
      sufficient
    </span>
  );
  if (q === 'insufficient') return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber/10 text-amber border border-amber/30">
      thin data
    </span>
  );
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-hairline/40 text-muted border border-hairline">
      no data
    </span>
  );
}

function RateCell({ value, sample, minSample }: { value: number | null; sample: number; minSample: number }) {
  if (value === null || sample === 0) {
    return <span className="text-muted text-xs">—</span>;
  }
  const pct = (value * 100).toFixed(0) + '%';
  return (
    <span className={`num text-sm ${sample < minSample ? 'text-amber' : 'text-ink'}`}>
      {pct}
    </span>
  );
}

export default async function RoutingPage() {
  const now = new Date();
  const [{ routingClients, volumes, weekStart }, adaptiveMetrics, settings] = await Promise.all([
    loadRoutingState(now),
    loadAdaptiveMetrics(),
    getSettings(),
  ]);

  const clusters = clusterPromises(routingClients, volumes);
  const { fractionRemaining } = weekBoundsUTC(now);

  const weekStartLabel = weekStart.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const weekRemainingPct = Math.round(fractionRemaining * 100);
  const adaptiveEnabled = settings.adaptive_routing_enabled;
  const minSample = settings.adaptive_min_sample;

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

      {/* Adaptive mode status banner */}
      <div className={`rounded-md border px-4 py-3 flex items-center justify-between gap-4 ${
        adaptiveEnabled
          ? 'bg-amber/5 border-amber/30'
          : 'bg-hairline/20 border-hairline'
      }`}>
        <div>
          <span className={`text-sm font-medium ${adaptiveEnabled ? 'text-amber' : 'text-ink'}`}>
            Adaptive routing: {adaptiveEnabled ? 'LIVE' : 'Shadow mode'}
          </span>
          <p className="text-muted text-xs mt-0.5">
            {adaptiveEnabled
              ? 'Adaptive tie-breaking is active. The engine may favour higher-converting clients in genuine tie situations — starvation and promise-fill rules still bind.'
              : 'Adaptive routing is watching but not changing decisions. The simulator below shows what it would do differently. Enable in Settings → Adaptive Routing when you\'re ready.'}
          </p>
        </div>
        <a href="/settings#adaptive" className="btn text-xs px-3 py-1.5 shrink-0 whitespace-nowrap">
          {adaptiveEnabled ? 'Manage' : 'Enable'}
        </a>
      </div>

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

      {/* Learned rates — per client */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Learned rates — by client</h2>
              <p className="text-muted text-xs mt-0.5">
                Computed from your actual appointment outcomes. Minimum sample before a rate is
                trusted: <span className="num font-medium">{minSample}</span> sits.
                Below that, rates are blended toward the agency default and flagged as thin data.
              </p>
            </div>
          </div>
        </header>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-5 py-2">Client</th>
              <th className="text-right font-medium px-3 py-2">Appts</th>
              <th className="text-right font-medium px-3 py-2">Sat</th>
              <th className="text-right font-medium px-3 py-2">Sold</th>
              <th className="text-right font-medium px-3 py-2">Show rate</th>
              <th className="text-right font-medium px-3 py-2">Close rate</th>
              <th className="text-right font-medium px-3 py-2">Blended close</th>
              <th className="text-right font-medium px-5 py-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {adaptiveMetrics.clients.map((r: LearnedClientRate) => (
              <tr key={r.client_id} className="border-b last:border-b-0 border-hairline">
                <td className="px-5 py-3 align-top font-medium">{r.company}</td>
                <td className="px-3 py-3 align-top text-right num text-muted">{r.total_appointments}</td>
                <td className="px-3 py-3 align-top text-right num text-muted">{r.sit_count}</td>
                <td className="px-3 py-3 align-top text-right num text-muted">{r.close_count}</td>
                <td className="px-3 py-3 align-top text-right">
                  <RateCell value={r.sit_rate} sample={r.total_appointments} minSample={minSample} />
                </td>
                <td className="px-3 py-3 align-top text-right">
                  <RateCell value={r.close_rate} sample={r.sit_count} minSample={minSample} />
                </td>
                <td className="px-3 py-3 align-top text-right">
                  <span className="num text-sm text-ink">
                    {(r.blended_close_rate * 100).toFixed(0)}%
                  </span>
                  <div className="text-[10px] text-muted num">
                    agency default: {(adaptiveMetrics.agency_default_close_rate * 100).toFixed(0)}%
                  </div>
                </td>
                <td className="px-5 py-3 align-top text-right">
                  {qualityBadge(r.data_quality)}
                </td>
              </tr>
            ))}
            {adaptiveMetrics.clients.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-muted">
                  No client data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-hairline bg-hairline/10 text-[11px] text-muted">
          <strong>Blended close rate</strong> = shrinkage estimate that pulls thin data toward the
          agency default (50%) — so 2–3 data points don&apos;t wildly swing routing decisions.
          The adaptive engine uses this column, not the raw rate.
        </div>
      </section>

      {/* Learned rates — per postcode area */}
      {adaptiveMetrics.postcodes.length > 0 && (
        <section className="card">
          <header className="px-5 py-4 border-b border-hairline">
            <h2 className="font-semibold">Learned rates — by postcode area</h2>
            <p className="text-muted text-xs mt-0.5">
              Lead → appointment conversion from actual lead data. Used for budget estimates.
            </p>
          </header>
          <table className="w-full text-sm">
            <thead className="text-muted text-xs uppercase">
              <tr className="border-b border-hairline">
                <th className="text-left font-medium px-5 py-2">Area</th>
                <th className="text-right font-medium px-3 py-2">Leads</th>
                <th className="text-right font-medium px-3 py-2">Appts</th>
                <th className="text-right font-medium px-3 py-2">Lead→appt</th>
                <th className="text-right font-medium px-3 py-2">Blended</th>
                <th className="text-right font-medium px-5 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {adaptiveMetrics.postcodes.map((r: LearnedPostcodeRate) => (
                <tr key={r.postcode_area} className="border-b last:border-b-0 border-hairline">
                  <td className="px-5 py-3 align-top font-medium num">{r.postcode_area}</td>
                  <td className="px-3 py-3 align-top text-right num text-muted">{r.lead_count}</td>
                  <td className="px-3 py-3 align-top text-right num text-muted">{r.appt_count}</td>
                  <td className="px-3 py-3 align-top text-right">
                    <RateCell value={r.lead_to_appt_rate} sample={r.lead_count} minSample={minSample} />
                  </td>
                  <td className="px-3 py-3 align-top text-right num text-sm">
                    {(r.blended_lead_to_appt_rate * 100).toFixed(0)}%
                  </td>
                  <td className="px-5 py-3 align-top text-right">
                    {qualityBadge(r.data_quality)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

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

      {/* Simulator — base + shadow/adaptive side by side */}
      <section className="card p-5">
        <h2 className="font-semibold mb-1">Simulate a lead</h2>
        <p className="text-muted text-xs mb-4">
          Enter a postcode — we&apos;ll show which client the <strong>current rules</strong> would
          pick, and what the <strong>adaptive layer</strong> would do differently (shadow) or
          did (if live). This does NOT consume a real lead or update any data.
        </p>
        <AdaptiveSimulator adaptiveEnabled={adaptiveEnabled} />
      </section>

      {/* Original simulator (kept for reference) */}
      <section className="card p-5">
        <h2 className="font-semibold mb-1">Base rules only (reference)</h2>
        <p className="text-muted text-xs mb-4">
          Classic simulator — shows which rule fires with no adaptive influence.
        </p>
        <RoutingSimulator />
      </section>
    </div>
  );
}
