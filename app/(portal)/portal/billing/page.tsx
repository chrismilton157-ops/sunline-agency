import { redirect } from 'next/navigation';
import { loadPortalInvoices, requireSession } from '@/lib/data';
import { fmtDate, fmtMoney2, monthLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

const statusChip = (s: string) => {
  switch (s) {
    case 'paid':
      return 'bg-good/10 text-good border-good/30';
    case 'issued':
      return 'bg-amber/10 text-amber border-amber/30';
    default:
      return 'bg-hairline/40 text-muted border-hairline';
  }
};

export default async function PortalBillingPage() {
  const { user, role, clientId } = await requireSession();
  if (!user) redirect('/login');
  if (role === 'owner') redirect('/overview');
  if (role !== 'client' || !clientId) {
    redirect('/login?error=No+client+linked+to+this+account');
  }

  const invoices = await loadPortalInvoices(clientId);

  // Client doesn't need to see drafts — those are the owner's working
  // copy. They see invoices once they've been issued.
  const visible = invoices.filter((i) => i.status !== 'draft');

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Billing
        </h1>
        <p className="text-muted text-sm mt-1">
          Every invoice you&apos;ve been issued, with a transparent
          two-line breakdown.
        </p>
      </header>

      {visible.length === 0 && (
        <section className="card p-8 text-center">
          <div className="text-muted text-sm">
            No invoices yet. Your first invoice will appear here once
            it&apos;s been issued.
          </div>
        </section>
      )}

      {visible.map((inv) => (
        <section key={inv.id} className="card p-5 md:p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h2 className="font-semibold text-lg">{monthLabel(inv.period)}</h2>
              <p className="text-muted text-xs mt-0.5 num">{inv.period}</p>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full border ${statusChip(
                inv.status,
              )}`}
            >
              {inv.status}
              {inv.status === 'issued' && inv.issued_at && (
                <span className="ml-1 text-muted num">
                  · issued {fmtDate(inv.issued_at)}
                </span>
              )}
              {inv.status === 'paid' && inv.paid_at && (
                <span className="ml-1 text-muted num">
                  · paid {fmtDate(inv.paid_at)}
                </span>
              )}
            </span>
          </div>

          <dl className="text-sm space-y-2.5">
            <div className="flex justify-between">
              <dt className="text-muted">Advertising management</dt>
              <dd className="num">{fmtMoney2(inv.advertising_management)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">
                Qualified appointments ({inv.appointment_count} ×{' '}
                {fmtMoney2(inv.per_sit_fee_snapshot)})
              </dt>
              <dd className="num">{fmtMoney2(inv.appointment_fees)}</dd>
            </div>
            <div className="flex justify-between pt-3 border-t border-hairline font-medium">
              <dt>Invoice total</dt>
              <dd className="num text-amber text-base">
                {fmtMoney2(inv.total)}
              </dd>
            </div>
          </dl>

          <p className="text-xs text-muted mt-5">
            Qualified appointments are billable whether or not the homeowner
            shows on the day — both sits and no-shows count. Bookings
            cancelled before the day don&apos;t.
          </p>
        </section>
      ))}
    </div>
  );
}
