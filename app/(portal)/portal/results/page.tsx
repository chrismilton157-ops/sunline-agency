import { redirect } from 'next/navigation';
import { ComparisonBar } from '@/components/ComparisonBar';
import { MetricCard } from '@/components/MetricCard';
import { SatVsSoldChart } from '@/components/SatVsSoldChart';
import { loadPortalForClient, requireSession } from '@/lib/data';
import {
  clientFacingMetrics,
  INDUSTRY_CLOSE_RATE,
  INDUSTRY_SIT_RATE,
  monthlySatVsSold,
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

export default async function PortalResultsPage() {
  const { user, role, clientId } = await requireSession();
  if (!user) redirect('/login');
  if (role === 'owner') redirect('/overview');
  if (role !== 'client' || !clientId) {
    redirect('/login?error=No+client+linked+to+this+account');
  }

  const { client, appointments, leads } = await loadPortalForClient(clientId);
  const m = clientFacingMetrics(client, appointments, leads);
  const monthly = monthlySatVsSold(appointments);

  return (
    <div className="space-y-8">
      {/* HERO */}
      <section className="card p-6 md:p-8">
        <div className="text-muted text-xs uppercase tracking-wide">
          Lifetime sales with us
        </div>
        <div className="num mt-3 text-5xl md:text-6xl font-semibold text-ink tracking-tight">
          {fmtMoney(m.revenueGenerated)}
        </div>
        <div className="text-muted text-sm mt-2">
          {fmtInt(m.sold)} solar systems sold from {fmtInt(m.sits)} appointments — and counting.
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-hairline">
          <div>
            <div className="label">Return on what you&apos;ve invested</div>
            <div className="num mt-1.5 text-3xl font-semibold text-amber">
              {fmtRatio(m.roi)}
            </div>
            <div className="text-muted text-xs mt-1">
              every £1 with us → {fmtMoney2(m.roi)} of sales
            </div>
          </div>
          <div>
            <div className="label">Pipeline value</div>
            <div className="num mt-1.5 text-3xl font-semibold text-good">
              {fmtMoney(m.pipelineValue)}
            </div>
            <div className="text-muted text-xs mt-1">
              {fmtInt(m.bookedPending)} booked × your sit & close rates
            </div>
          </div>
        </div>
      </section>

      {/* METRIC CARDS */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <MetricCard label="Appointments sat" value={fmtInt(m.sits)} />
        <MetricCard label="Sales closed" value={fmtInt(m.sold)} tone="good" />
        <MetricCard label="Average job value" value={fmtMoney(m.avgJobValue)} />
        <MetricCard label="Cost per appointment" value={fmtMoney2(m.costPerAppointment)} />
        <MetricCard label="Cost per sale" value={fmtMoney2(m.costPerSale)} />
        <MetricCard label="Speed to lead" value={fmtMins(m.speedToLead)} hint="median, mins" />
      </section>

      {/* COMPARISON + CONFIRMATION */}
      <section className="grid md:grid-cols-3 gap-4">
        <div className="card p-5 md:col-span-2 space-y-5">
          <div>
            <h2 className="font-semibold">How you compare</h2>
            <p className="text-muted text-xs mt-0.5">
              Your numbers vs. UK residential solar industry averages.
            </p>
          </div>
          <ComparisonBar label="Sit rate" yours={m.sitRate} benchmark={INDUSTRY_SIT_RATE} />
          <ComparisonBar label="Close rate" yours={m.closeRate} benchmark={INDUSTRY_CLOSE_RATE} />
        </div>

        <div className="card p-5">
          <div className="label">Confirmation rate</div>
          <div className="num mt-2 text-3xl font-semibold text-amber">
            {fmtPct(m.confirmationRate)}
          </div>
          <div className="text-muted text-xs mt-1.5">
            of your past appointments were phone-confirmed within 48h of the sit.
          </div>
          <hr className="my-4 border-hairline" />
          <p className="text-sm text-muted">
            We work the phones hard before every appointment to maximise show-ups —
            the higher this number, the more sits actually happen.
          </p>
        </div>
      </section>

      {/* MONTHLY CHART */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="font-semibold">Monthly results</h2>
            <p className="text-muted text-xs mt-0.5">
              Appointments sat vs systems sold, by month.
            </p>
          </div>
          <span className="text-xs text-muted">
            Amber = sat · Green = sold
          </span>
        </div>
        <SatVsSoldChart data={monthly} />
      </section>
    </div>
  );
}
