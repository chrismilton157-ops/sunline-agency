import Link from 'next/link';
import { MetricCard } from '@/components/MetricCard';
import { HealthBadge } from '@/components/HealthBadge';
import { EmptyState } from '@/components/EmptyState';
import { SatVsSoldChart } from '@/components/SatVsSoldChart';
import { loadAll, groupByClientId } from '@/lib/data';
import {
  clientMetrics,
  healthScore,
  MONTHLY_OVERHEAD,
  monthlySatVsSold,
  portfolio,
} from '@/lib/metrics';
import {
  fmtInt,
  fmtMins,
  fmtMoney,
  fmtMoney2,
  fmtPct,
  fmtRatio,
} from '@/lib/format';

import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Overview' };

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const { clients, appointments, leads } = await loadAll();

  // Per-client metrics need a portfolio sit total to allocate overhead.
  const sitsTotal = appointments.filter(
    (a) => a.outcome === 'sat' || a.outcome === 'sold',
  ).length;

  const apptsByClient = groupByClientId(appointments);
  const leadsByClient = groupByClientId(leads);

  const perClient = clients.map((c) =>
    clientMetrics(
      c,
      apptsByClient.get(c.id) ?? [],
      leadsByClient.get(c.id) ?? [],
      { monthlyOverhead: MONTHLY_OVERHEAD, totalSitsAcrossPortfolio: sitsTotal },
    ),
  );

  const pf = portfolio(
    clients,
    perClient,
    appointments,
    leads,
    MONTHLY_OVERHEAD,
  );

  const bench = {
    portfolioSitRate: pf.portfolioSitRate,
    portfolioCloseRate: pf.portfolioCloseRate,
    portfolioAvgJobValue: pf.portfolioAvgJobValue,
  };

  const monthly = monthlySatVsSold(appointments);

  // ROI leaderboard — sort by ROI desc, nulls last
  const leaderboard = [...perClient].sort((a, b) => {
    const ar = a.roi ?? -Infinity;
    const br = b.roi ?? -Infinity;
    return br - ar;
  });

  // Phase 6 failsafe alerts.
  const alerts: { kind: 'bad' | 'amber'; text: string }[] = [];
  for (const m of perClient) {
    if (m.marginPerSit != null && m.marginPerSit < 0) {
      alerts.push({
        kind: 'bad',
        text: `${m.client.company}: margin per sit is negative (${fmtMoney2(m.marginPerSit)}).`,
      });
    }
  }
  if (pf.revenueConcentration != null && pf.revenueConcentration > 0.4) {
    alerts.push({
      kind: 'amber',
      text: `Revenue concentration is ${fmtPct(pf.revenueConcentration)} — one client carries more than 40% of total revenue.`,
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Overview
            </h1>
            <p className="text-muted text-sm mt-1">
              Live agency snapshot · {clients.length} clients
            </p>
          </div>
          <a
            href="/api/export/appointments"
            className="btn btn-secondary shrink-0 text-xs"
          >
            Export appointments CSV
          </a>
        </div>
      </header>

      {alerts.length > 0 && (
        <section className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={`rounded-md border px-4 py-3 text-sm flex items-start gap-3
                ${
                  a.kind === 'bad'
                    ? 'bg-bad/10 border-bad/30 text-bad'
                    : 'bg-amber/10 border-amber/30 text-amber'
                }`}
            >
              <span className="font-medium">⚠</span>
              <span className="text-ink">{a.text}</span>
            </div>
          ))}
        </section>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 stagger-children">
        <MetricCard
          label="Active clients"
          value={fmtInt(pf.activeClients)}
        />
        <MetricCard
          label="Sits this month"
          value={fmtInt(pf.sitsThisMonth)}
        />
        <MetricCard
          label="My revenue"
          value={fmtMoney(pf.myRevenue)}
          hint="lifetime, billed + accrued"
          tone="amber"
        />
        <MetricCard
          label="Margin per sit"
          value={fmtMoney2(pf.marginPerSit)}
          tone={pf.marginPerSit != null && pf.marginPerSit < 0 ? 'bad' : 'good'}
        />
        <MetricCard
          label="Unbilled sits"
          value={fmtMoney(pf.unbilledSits)}
          hint="£ at per-sit fee"
        />
        <MetricCard
          label="Revenue concentration"
          value={fmtPct(pf.revenueConcentration)}
          hint="biggest client share"
        />
        <MetricCard
          label="Median speed-to-lead"
          value={fmtMins(pf.speedToLead)}
        />
        <MetricCard
          label="Net margin"
          value={fmtMoney(pf.netMargin)}
          tone={pf.netMargin < 0 ? 'bad' : 'good'}
          hint="revenue − ad spend − overhead"
        />
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold">Sat vs sold by month</h2>
            <span className="text-xs text-muted">
              Amber = sat · Green = sold
            </span>
          </div>
          <SatVsSoldChart data={monthly} />
        </div>
        <div className="card p-5">
          <div className="label">Pipeline forecast</div>
          <div className="num mt-2 text-3xl font-semibold text-amber">
            {fmtMoney(pf.pipelineValue)}
          </div>
          <div className="text-muted text-xs mt-1.5">
            booked appts × expected sit & close × avg job
          </div>
          <hr className="my-4 border-hairline" />
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-muted">Portfolio sit rate</dt>
              <dd className="num">{fmtPct(pf.portfolioSitRate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Portfolio close rate</dt>
              <dd className="num">{fmtPct(pf.portfolioCloseRate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Avg job value</dt>
              <dd className="num">{fmtMoney(pf.portfolioAvgJobValue)}</dd>
            </div>
            <div className="flex justify-between pt-1.5 border-t border-hairline">
              <dt className="text-muted">Total revenue (lifetime)</dt>
              <dd className="num">{fmtMoney(pf.totalRevenue)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="card">
        <header className="px-5 py-4 border-b border-hairline flex items-baseline justify-between">
          <h2 className="font-semibold">ROI leaderboard</h2>
          <span className="text-xs text-muted">Best return → worst</span>
        </header>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-b border-hairline">
              <th scope="col" className="text-left font-medium px-5 py-2">Client</th>
              <th scope="col" className="text-right font-medium px-3 py-2">Sits</th>
              <th scope="col" className="text-right font-medium px-3 py-2">Revenue</th>
              <th scope="col" className="text-right font-medium px-3 py-2">Paid</th>
              <th scope="col" className="text-right font-medium px-3 py-2">ROI</th>
              <th scope="col" className="text-right font-medium px-5 py-2">Health</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((m) => {
              const h = healthScore(m, bench);
              return (
                <tr
                  key={m.client.id}
                  className="border-b last:border-b-0 border-hairline table-row-hover"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/clients/${m.client.id}`}
                      className="font-medium hover:text-amber"
                    >
                      {m.client.company}
                    </Link>
                    <div className="text-muted text-xs">
                      {m.client.region}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right num">{fmtInt(m.sits)}</td>
                  <td className="px-3 py-3 text-right num">
                    {fmtMoney(m.revenueGenerated)}
                  </td>
                  <td className="px-3 py-3 text-right num">
                    {fmtMoney(m.clientPaid)}
                  </td>
                  <td className="px-3 py-3 text-right num">
                    {fmtRatio(m.roi)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <HealthBadge health={h} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
