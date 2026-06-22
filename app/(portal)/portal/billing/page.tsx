import { redirect } from 'next/navigation';
import { loadPortalForClient, requireSession } from '@/lib/data';
import { fmtMoney2, monthLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function PortalBillingPage() {
  const { user, role, clientId } = await requireSession();
  if (!user) redirect('/login');
  if (role === 'owner') redirect('/overview');
  if (role !== 'client' || !clientId) {
    redirect('/login?error=No+client+linked+to+this+account');
  }

  const { client, appointments, invoices } = await loadPortalForClient(clientId);

  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  // Per-sit fee charged for every qualified confirmed appointment that
  // occurred this month — sits, sales, AND no-shows. Cancellations
  // before the day are not billable (they never appear here as
  // appt_date for an outcome other than 'booked').
  const billableThisMonth = appointments.filter(
    (a) =>
      (a.outcome === 'sat' ||
        a.outcome === 'sold' ||
        a.outcome === 'no_show') &&
      a.appt_date.startsWith(ym),
  );
  const thisPeriodPerSitFees = billableThisMonth.length * client.per_sit_fee;
  const invoiceTotal = client.retainer + thisPeriodPerSitFees;

  // Past invoices (excluding current month if present)
  const pastInvoices = invoices.filter((i) => i.period !== ym);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Billing
        </h1>
        <p className="text-muted text-sm mt-1">
          Transparent breakdown of what you&apos;re paying us this month, plus past invoices.
        </p>
      </header>

      <section className="card p-5 md:p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-semibold">This month ({monthLabel(ym)})</h2>
          <span className="text-xs text-muted">accruing live</span>
        </div>
        <dl className="text-sm space-y-2.5">
          <div className="flex justify-between">
            <dt className="text-muted">Monthly retainer</dt>
            <dd className="num">{fmtMoney2(client.retainer)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">
              Qualified confirmed appointments ({billableThisMonth.length} × {fmtMoney2(client.per_sit_fee)})
            </dt>
            <dd className="num">{fmtMoney2(thisPeriodPerSitFees)}</dd>
          </div>
          <div className="flex justify-between pt-3 border-t border-hairline font-medium">
            <dt>Your invoice</dt>
            <dd className="num text-amber text-base">{fmtMoney2(invoiceTotal)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted mt-5">
          Qualified confirmed appointments are billable whether or not the
          homeowner shows on the day — both sits and no-shows count. Bookings
          cancelled before the day don&apos;t.
        </p>
      </section>

      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">Past invoices</h2>
          <p className="text-muted text-xs mt-0.5">
            Months already invoiced.
          </p>
        </header>
        {pastInvoices.length === 0 ? (
          <div className="px-5 py-8 text-muted text-sm text-center">
            No past invoices yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-xs uppercase">
              <tr className="border-b border-hairline">
                <th className="text-left font-medium px-5 py-2">Period</th>
                <th className="text-right font-medium px-3 py-2">Amount</th>
                <th className="text-right font-medium px-5 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {pastInvoices.map((i) => (
                <tr
                  key={i.id}
                  className="border-b last:border-b-0 border-hairline"
                >
                  <td className="px-5 py-3 num">{monthLabel(i.period)}</td>
                  <td className="px-3 py-3 text-right num">
                    {fmtMoney2(i.amount)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {i.paid ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-good/10 text-good border border-good/30">
                        paid
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber/10 text-amber border border-amber/30">
                        outstanding
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
