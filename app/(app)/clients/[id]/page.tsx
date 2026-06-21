import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppointmentRow } from '@/components/AppointmentRow';
import { HealthBadge } from '@/components/HealthBadge';
import { MetricCard } from '@/components/MetricCard';
import { SatVsSoldChart } from '@/components/SatVsSoldChart';
import { loadAll, loadClient } from '@/lib/data';
import {
  clientMetrics,
  flagReasons,
  healthScore,
  MONTHLY_OVERHEAD,
  monthlySatVsSold,
  pipelineForClient,
  portfolio,
  repsFlag,
} from '@/lib/metrics';
import {
  fmtInt,
  fmtMins,
  fmtMoney,
  fmtMoney2,
  fmtPct,
  fmtRatio,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [all, single] = await Promise.all([
    loadAll(),
    loadClient(params.id).catch(() => null),
  ]);
  if (!single) notFound();

  const { client, appointments, leads } = single;
  const sitsTotal = all.appointments.filter(
    (a) => a.outcome === 'sat' || a.outcome === 'sold',
  ).length;

  // Per-client metrics for this client + the whole portfolio, so we
  // can compare against benchmarks and run the reps-flag.
  const perClient = all.clients.map((c) =>
    clientMetrics(
      c,
      all.appointments.filter((a) => a.client_id === c.id),
      all.leads.filter((l) => l.client_id === c.id),
      { monthlyOverhead: MONTHLY_OVERHEAD, totalSitsAcrossPortfolio: sitsTotal },
    ),
  );
  const pf = portfolio(
    all.clients,
    perClient,
    all.appointments,
    all.leads,
    MONTHLY_OVERHEAD,
  );
  const bench = {
    portfolioSitRate: pf.portfolioSitRate,
    portfolioCloseRate: pf.portfolioCloseRate,
    portfolioAvgJobValue: pf.portfolioAvgJobValue,
  };

  const m = perClient.find((x) => x.client.id === client.id)!;
  const h = healthScore(m, bench);
  const flagged = repsFlag(m, bench);
  const pipeline = pipelineForClient(m, bench);

  const monthly = monthlySatVsSold(appointments);
  const reasons = flagReasons(appointments);

  const leadById = new Map(leads.map((l) => [l.id, l]));

  // Billing this period (current month)
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const thisMonthSits = appointments.filter(
    (a) => (a.outcome === 'sat' || a.outcome === 'sold') && a.appt_date.startsWith(ym),
  );
  const thisPeriodRetainer = client.retainer;
  const thisPeriodSitFees = thisMonthSits.length * client.per_sit_fee;
  const thisPeriodTotal = thisPeriodRetainer + thisPeriodSitFees;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/clients" className="text-muted text-sm hover:text-amber">
          ← Clients
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {client.company}
            </h1>
            <p className="text-muted text-sm mt-1">
              {client.contact ?? '—'} · {client.region ?? '—'} · joined{' '}
              <span className="num">{client.joined_at}</span>
            </p>
          </div>
          <HealthBadge health={h} />
        </div>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <MetricCard label="Sits" value={fmtInt(m.sits)} hint={`${m.appointments} appointments`} />
        <MetricCard label="Sit rate" value={fmtPct(m.sitRate)} />
        <MetricCard label="Close rate" value={fmtPct(m.closeRate)} tone={flagged ? 'bad' : 'default'} />
        <MetricCard label="Avg job value" value={fmtMoney(m.avgJobValue)} />
        <MetricCard label="Speed to lead" value={fmtMins(m.speedToLead)} hint="median, mins" />
        <MetricCard label="Quality score" value={fmtPct(m.qualityScore)} hint="thumbs up / total rated" />
        <MetricCard label="ROI" value={fmtRatio(m.roi)} tone={m.roi != null && m.roi < 2 ? 'bad' : 'good'} />
        <MetricCard label="Revenue (lifetime)" value={fmtMoney(m.revenueGenerated)} tone="amber" />
        <MetricCard label="Client paid" value={fmtMoney(m.clientPaid)} hint={`${m.monthsActive} mo. active`} />
        <MetricCard label="Cost per appt" value={fmtMoney2(m.costPerAppointment)} />
        <MetricCard label="Cost per sale" value={fmtMoney2(m.costPerSale)} />
        <MetricCard label="Pipeline value" value={fmtMoney(pipeline)} hint={`${m.bookedPending} booked`} />
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
          <div className="label">Close rate vs portfolio</div>
          <div className="num mt-2 text-3xl font-semibold tracking-tight">
            {fmtPct(m.closeRate)}
          </div>
          <div className="text-muted text-xs mt-1.5">
            Portfolio avg <span className="num">{fmtPct(pf.portfolioCloseRate)}</span>
          </div>
          <div className="mt-4 p-3 rounded-md bg-bg border border-hairline text-xs">
            {flagged ? (
              <p>
                <span className="font-semibold text-bad">Reps-flagged.</span>{' '}
                Close rate is more than 30% below the portfolio average over ≥6 sits — most
                likely the gap is in the client&apos;s sales team, not lead quality.
              </p>
            ) : m.sits < 6 ? (
              <p className="text-muted">
                Not enough sits yet to reps-flag (needs ≥6).
              </p>
            ) : (
              <p className="text-muted">
                Close rate is within portfolio range — leads are converting normally.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-3">Appointment quality</h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="label">Up</div>
              <div className="num text-xl text-good mt-1">
                {fmtInt(appointments.filter((a) => a.quality_rating === 'up').length)}
              </div>
            </div>
            <div>
              <div className="label">Down</div>
              <div className="num text-xl text-bad mt-1">
                {fmtInt(appointments.filter((a) => a.quality_rating === 'down').length)}
              </div>
            </div>
            <div>
              <div className="label">Score</div>
              <div className="num text-xl mt-1">{fmtPct(m.qualityScore)}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="label mb-2">Top down-flag reasons</div>
            {reasons.length === 0 ? (
              <p className="text-muted text-sm">No down-flags yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {reasons.slice(0, 5).map((r) => (
                  <li
                    key={r.reason}
                    className="flex justify-between border-b border-hairline pb-1"
                  >
                    <span>{r.reason}</span>
                    <span className="num text-muted">{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Billing this period ({ym})</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-muted">Retainer</dt>
              <dd className="num">{fmtMoney2(thisPeriodRetainer)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">
                Sit fees ({thisMonthSits.length} × {fmtMoney2(client.per_sit_fee)})
              </dt>
              <dd className="num">{fmtMoney2(thisPeriodSitFees)}</dd>
            </div>
            <div className="flex justify-between pt-2 border-t border-hairline font-medium">
              <dt>Total invoice</dt>
              <dd className="num">{fmtMoney2(thisPeriodTotal)}</dd>
            </div>
            <div className="flex justify-between pt-2 text-xs">
              <dt className="text-muted">Unbilled sits (£)</dt>
              <dd className="num">{fmtMoney(m.unbilledSits)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">Appointments</h2>
          <p className="text-muted text-xs mt-0.5">
            Change outcome or quality rating inline — saves immediately.
          </p>
        </header>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-5 py-2">Lead</th>
              <th className="text-left font-medium px-3 py-2">When</th>
              <th className="text-left font-medium px-3 py-2">Outcome</th>
              <th className="text-left font-medium px-5 py-2">Quality</th>
            </tr>
          </thead>
          <tbody>
            {appointments.map((a) => (
              <AppointmentRow
                key={a.id}
                appt={a}
                lead={leadById.get(a.lead_id) ?? null}
              />
            ))}
            {appointments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted">
                  No appointments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
