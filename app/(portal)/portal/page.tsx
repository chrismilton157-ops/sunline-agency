import { redirect } from 'next/navigation';
import { ComparisonBar } from '@/components/ComparisonBar';
import { MetricCard } from '@/components/MetricCard';
import { PortalAppointmentRow } from '@/components/PortalAppointmentRow';
import { SatVsSoldChart } from '@/components/SatVsSoldChart';
import { loadPortalForClient, requireSession } from '@/lib/data';
import {
  clientFacingMetrics,
  INDUSTRY_CLOSE_RATE,
  INDUSTRY_SIT_RATE,
  monthlySatVsSold,
} from '@/lib/metrics';
import {
  fmtDateTime,
  fmtInt,
  fmtMins,
  fmtMoney,
  fmtMoney2,
  fmtPct,
  fmtRatio,
} from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PortalPage() {
  const { user, role, clientId } = await requireSession();
  if (!user) redirect('/login');
  if (role === 'owner') redirect('/overview');
  if (role !== 'client' || !clientId) {
    redirect('/login?error=No+client+linked+to+this+account');
  }

  const { client, appointments, leads } = await loadPortalForClient(clientId);
  const m = clientFacingMetrics(client, appointments, leads);
  const monthly = monthlySatVsSold(appointments);

  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const sitsThisMonth = appointments.filter(
    (a) => (a.outcome === 'sat' || a.outcome === 'sold') && a.appt_date.startsWith(ym),
  );
  const invoiceTotal = client.retainer + sitsThisMonth.length * client.per_sit_fee;

  const upcoming = appointments
    .filter((a) => a.outcome === 'booked' && new Date(a.appt_date) >= now)
    .sort((a, b) => (a.appt_date < b.appt_date ? -1 : 1));

  // Recent = anything that has actually happened (not still 'booked')
  const recent = appointments.filter((a) => a.outcome !== 'booked').slice(0, 10);

  const leadById = new Map(leads.map((l) => [l.id, l]));

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

      {/* UPCOMING + RECENT */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <header className="px-5 py-4 border-b border-hairline">
            <h2 className="font-semibold">Upcoming appointments</h2>
            <p className="text-muted text-xs mt-0.5">
              Booked sits scheduled ahead. You&apos;ll get a confirmation call from
              us within 48 hours of the appointment.
            </p>
          </header>
          {upcoming.length === 0 ? (
            <div className="px-5 py-8 text-muted text-sm text-center">
              No upcoming appointments yet.
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {upcoming.map((a) => {
                const lead = leadById.get(a.lead_id);
                return (
                  <li key={a.id} className="px-5 py-3 flex justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{lead?.name ?? '—'}</div>
                      <div className="text-muted text-xs">{lead?.address ?? '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm">{fmtDateTime(a.appt_date)}</div>
                      <div className="text-[10px] mt-0.5">
                        {a.confirmed_at ? (
                          <span className="text-good">confirmed</span>
                        ) : (
                          <span className="text-muted">awaiting confirmation</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Billing this month ({ym})</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-muted">Monthly retainer</dt>
              <dd className="num">{fmtMoney2(client.retainer)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">
                Sits this month ({sitsThisMonth.length} × {fmtMoney2(client.per_sit_fee)})
              </dt>
              <dd className="num">
                {fmtMoney2(sitsThisMonth.length * client.per_sit_fee)}
              </dd>
            </div>
            <div className="flex justify-between pt-2 border-t border-hairline font-medium">
              <dt>Your invoice</dt>
              <dd className="num text-amber">{fmtMoney2(invoiceTotal)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted mt-4">
            All sits and no-shows are billable. Booked appointments that don&apos;t
            occur (e.g. cancelled before the day) don&apos;t count.
          </p>
        </div>
      </section>

      {/* RECENT — editable */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">Recent appointments</h2>
          <p className="text-muted text-xs mt-0.5">
            Mark the outcome and rate the lead quality — saves immediately.
          </p>
        </header>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-4 md:px-5 py-2">Lead</th>
              <th className="text-left font-medium px-3 py-2">When</th>
              <th className="text-left font-medium px-3 py-2">Outcome</th>
              <th className="text-left font-medium px-4 md:px-5 py-2">Quality</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((a) => (
              <PortalAppointmentRow
                key={a.id}
                appt={a}
                lead={leadById.get(a.lead_id) ?? null}
              />
            ))}
            {recent.length === 0 && (
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
