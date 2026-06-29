import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Billing' };

import { loadOwnerInvoices } from '@/lib/data';
import { fmtDate, fmtMoney, fmtMoney2, monthLabel } from '@/lib/format';
import { ymUTC, previousYM } from '@/lib/billing';
import { generateInvoices, setInvoiceStatus } from './actions';

export const dynamic = 'force-dynamic';

const statusChip = (s: string) => {
  switch (s) {
    case 'paid':
      return 'bg-good/10 text-good border-good/30';
    case 'issued':
      return 'bg-amber/10 text-amber border-amber/30';
    case 'draft':
    default:
      return 'bg-hairline/40 text-muted border-hairline';
  }
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { period?: string; created?: string; updated?: string; skipped?: string; error?: string };
}) {
  const { invoices, clientsById } = await loadOwnerInvoices();
  const defaultPeriod = previousYM(ymUTC(new Date()));

  // Aggregate by period (newest first).
  const periods = [...new Set(invoices.map((i) => i.period))].sort((a, b) =>
    a < b ? 1 : -1,
  );

  // Header totals across ALL invoices.
  const totalIssued = invoices
    .filter((i) => i.status === 'issued' || i.status === 'paid')
    .reduce((s, i) => s + Number(i.total), 0);
  const totalPaid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + Number(i.total), 0);
  const totalOutstanding = invoices
    .filter((i) => i.status === 'issued')
    .reduce((s, i) => s + Number(i.total), 0);

  const flash = searchParams.created
    ? `${searchParams.period}: ${searchParams.created} created, ${searchParams.updated} updated, ${searchParams.skipped} locked (issued/paid).`
    : null;

  return (
    <div className="space-y-8">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Billing
            </h1>
            <p className="text-muted text-sm mt-1">
              Generate, review, issue and mark invoices paid. Draft invoices can
              be re-generated; issued / paid invoices are locked.
            </p>
          </div>
          <a
            href="/api/export/invoices"
            className="btn btn-secondary shrink-0 text-xs"
          >
            Export CSV
          </a>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="card p-4">
          <div className="label">Issued (lifetime)</div>
          <div className="num mt-2 text-2xl md:text-3xl font-semibold tracking-tight">
            {fmtMoney(totalIssued)}
          </div>
        </div>
        <div className="card p-4">
          <div className="label">Paid (lifetime)</div>
          <div className="num mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-good">
            {fmtMoney(totalPaid)}
          </div>
        </div>
        <div className="card p-4">
          <div className="label">Outstanding</div>
          <div className="num mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-amber">
            {fmtMoney(totalOutstanding)}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Generate invoices</h2>
        <p className="text-muted text-xs mt-0.5">
          Creates a draft for each active client. Re-running for the same
          period updates drafts and skips anything already issued or paid.
        </p>
        <form
          action={generateInvoices}
          className="mt-3 flex flex-col sm:flex-row gap-2"
        >
          <input
            name="period"
            type="month"
            defaultValue={defaultPeriod}
            required
            className="input flex-1 num"
          />
          <button type="submit" className="btn btn-primary">
            Generate drafts
          </button>
        </form>
        {flash && (
          <p className="mt-3 text-xs text-good bg-good/10 border border-good/30 rounded-md px-3 py-2">
            {flash}
          </p>
        )}
        {searchParams.error && (
          <p className="mt-3 text-xs text-bad bg-bad/10 border border-bad/30 rounded-md px-3 py-2">
            {searchParams.error}
          </p>
        )}
      </section>

      {periods.length === 0 && (
        <section className="card p-8 text-center text-muted text-sm">
          No invoices yet. Pick a period above and generate drafts to begin.
        </section>
      )}

      {periods.map((p) => {
        const periodInvoices = invoices.filter((i) => i.period === p);
        const periodTotal = periodInvoices.reduce(
          (s, i) => s + Number(i.total),
          0,
        );
        return (
          <section key={p} className="card">
            <header className="px-5 py-4 border-b border-hairline flex items-baseline justify-between">
              <div>
                <h2 className="font-semibold">{monthLabel(p)}</h2>
                <p className="text-muted text-xs mt-0.5 num">{p}</p>
              </div>
              <div className="text-right">
                <div className="num text-sm">{fmtMoney(periodTotal)}</div>
                <div className="text-[10px] text-muted">period total</div>
              </div>
            </header>
            <table className="w-full text-sm">
              <thead className="text-muted text-xs uppercase">
                <tr className="border-b border-hairline">
                  <th className="text-left font-medium px-5 py-2">Client</th>
                  <th className="text-right font-medium px-3 py-2">Ad mgmt</th>
                  <th className="text-right font-medium px-3 py-2">Appts</th>
                  <th className="text-right font-medium px-3 py-2">Total</th>
                  <th className="text-left font-medium px-3 py-2">Internal</th>
                  <th className="text-right font-medium px-5 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periodInvoices.map((i) => (
                  <tr
                    key={i.id}
                    className="border-b last:border-b-0 border-hairline align-top"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">
                        {clientsById.get(i.client_id) ?? '—'}
                      </div>
                      <span
                        className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full border ${statusChip(
                          i.status,
                        )}`}
                      >
                        {i.status}
                        {i.status === 'issued' && i.issued_at && (
                          <span className="ml-1 text-muted num">
                            · {fmtDate(i.issued_at)}
                          </span>
                        )}
                        {i.status === 'paid' && i.paid_at && (
                          <span className="ml-1 text-muted num">
                            · {fmtDate(i.paid_at)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right num">
                      {fmtMoney2(i.advertising_management)}
                    </td>
                    <td className="px-3 py-3 text-right num">
                      {i.appointment_count} × {fmtMoney2(i.per_sit_fee_snapshot)}
                      <div className="text-[10px] text-muted">
                        = {fmtMoney2(i.appointment_fees)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right num font-medium">
                      {fmtMoney2(i.total)}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">
                      <div className="num">
                        ad spend {fmtMoney(i.ad_spend_raw)}
                      </div>
                      <div className="num">
                        markup {i.management_markup_pct_snapshot}%
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        {i.status === 'draft' && (
                          <StatusBtn id={i.id} next="issued" label="Mark issued" tone="amber" />
                        )}
                        {i.status === 'issued' && (
                          <>
                            <StatusBtn id={i.id} next="paid" label="Mark paid" tone="good" />
                            <StatusBtn id={i.id} next="draft" label="Revert to draft" tone="ghost" />
                          </>
                        )}
                        {i.status === 'paid' && (
                          <StatusBtn id={i.id} next="issued" label="Mark unpaid" tone="ghost" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function StatusBtn({
  id,
  next,
  label,
  tone,
}: {
  id: string;
  next: 'draft' | 'issued' | 'paid';
  label: string;
  tone: 'amber' | 'good' | 'ghost';
}) {
  const cls =
    tone === 'amber'
      ? 'text-amber hover:underline'
      : tone === 'good'
        ? 'text-good hover:underline'
        : 'text-muted hover:text-ink hover:underline';
  return (
    <form action={setInvoiceStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={next} />
      <button type="submit" className={`text-xs ${cls}`}>
        {label}
      </button>
    </form>
  );
}
