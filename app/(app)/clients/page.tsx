import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Clients' };

import Link from 'next/link';
import { HealthBadge } from '@/components/HealthBadge';
import { EmptyState } from '@/components/EmptyState';
import { loadAll } from '@/lib/data';
import {
  clientMetrics,
  healthScore,
  MONTHLY_OVERHEAD,
  portfolio,
  repsFlag,
} from '@/lib/metrics';
import { fmtInt, fmtMoney2, fmtPct, fmtRatio } from '@/lib/format';
import { AddClientButton } from './AddClientButton';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const { clients, appointments, leads } = await loadAll();

  const sitsTotal = appointments.filter(
    (a) => a.outcome === 'sat' || a.outcome === 'sold',
  ).length;

  const perClient = clients.map((c) =>
    clientMetrics(
      c,
      appointments.filter((a) => a.client_id === c.id),
      leads.filter((l) => l.client_id === c.id),
      { monthlyOverhead: MONTHLY_OVERHEAD, totalSitsAcrossPortfolio: sitsTotal },
    ),
  );

  const pf = portfolio(clients, perClient, appointments, leads, MONTHLY_OVERHEAD);
  const bench = {
    portfolioSitRate: pf.portfolioSitRate,
    portfolioCloseRate: pf.portfolioCloseRate,
    portfolioAvgJobValue: pf.portfolioAvgJobValue,
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Clients
          </h1>
          <p className="text-muted text-sm mt-1">
            Tap a row for full client detail.
          </p>
        </div>
        <AddClientButton />
      </header>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase bg-bg/60">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-5 py-3">Client</th>
              <th className="text-right font-medium px-3 py-3">Sits</th>
              <th className="text-right font-medium px-3 py-3">ROI</th>
              <th className="text-right font-medium px-3 py-3">Margin / sit</th>
              <th className="text-right font-medium px-3 py-3">Close rate</th>
              <th className="text-right font-medium px-5 py-3">Health</th>
            </tr>
          </thead>
          <tbody>
            {perClient.map((m) => {
              const h = healthScore(m, bench);
              const flagged = repsFlag(m, bench);
              const closeStyle = flagged
                ? 'text-bad font-medium'
                : '';
              return (
                <tr
                  key={m.client.id}
                  className="border-b last:border-b-0 border-hairline table-row-hover cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/clients/${m.client.id}`}
                      className="block"
                    >
                      <div className="font-medium hover:text-amber">
                        {m.client.company}
                      </div>
                      <div className="text-muted text-xs">
                        {m.client.contact ?? '—'} · {m.client.region ?? '—'}
                      </div>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right num">{fmtInt(m.sits)}</td>
                  <td className="px-3 py-3 text-right num">{fmtRatio(m.roi)}</td>
                  <td className="px-3 py-3 text-right num">
                    {fmtMoney2(m.marginPerSit)}
                  </td>
                  <td className={`px-3 py-3 text-right num ${closeStyle}`}>
                    {fmtPct(m.closeRate)}
                    {flagged && (
                      <span
                        className="ml-1.5 text-[10px] uppercase tracking-wide"
                        title="Close rate < 70% of portfolio average"
                      >
                        reps-flag
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <HealthBadge health={h} />
                  </td>
                </tr>
              );
            })}
            {perClient.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    preset="clients"
                    heading="No clients yet"
                    body="Add your first client to get started."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
