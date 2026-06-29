import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Allocation' };

import { loadAllocationView } from '@/lib/data';
import { fmtMoney, fmtMoney2, fmtPct, monthLabel } from '@/lib/format';
import { ymUTC, previousYM } from '@/lib/billing';
import { ALLOCATION_BASIS } from '@/lib/allocation';
import { recordCampaignSpend, removeCampaignSpend } from './actions';

export const dynamic = 'force-dynamic';

const PERIOD_RE = /^\d{4}-\d{2}$/;

export default async function AllocationPage({
  searchParams,
}: {
  searchParams: { period?: string; saved?: string; removed?: string; error?: string };
}) {
  const periodRaw = String(searchParams.period ?? '').trim();
  const period = PERIOD_RE.test(periodRaw)
    ? periodRaw
    : previousYM(ymUTC(new Date()));

  const view = await loadAllocationView(period);

  const flash = searchParams.saved
    ? 'Spend recorded.'
    : searchParams.removed
      ? 'Spend removed.'
      : null;

  const basisLabel =
    ALLOCATION_BASIS === 'by_leads_delivered'
      ? 'by leads delivered'
      : 'by promised volume';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Ad spend allocation
        </h1>
        <p className="text-muted text-sm mt-1">
          Record each campaign&apos;s real monthly ad spend (from Meta) and
          see how it splits across the clients who received leads from it.
          Allocation basis: <span className="font-medium">{basisLabel}</span>.
          The split rolls into each client&apos;s combined &ldquo;Advertising
          management&rdquo; line on their invoice — clients never see the
          split itself.
        </p>
      </header>

      {/* Period picker */}
      <section className="card p-5">
        <form className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
          <label className="flex-1">
            <div className="label">Period</div>
            <input
              type="month"
              name="period"
              defaultValue={period}
              className="input num w-full mt-1"
            />
          </label>
          <button type="submit" className="btn btn-primary">
            Show period
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

      {/* Totals */}
      <section className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="card p-4">
          <div className="label">Recorded spend</div>
          <div className="num mt-2 text-2xl md:text-3xl font-semibold tracking-tight">
            {fmtMoney(view.totalRecorded)}
          </div>
          <div className="text-[11px] text-muted mt-1 num">
            {monthLabel(view.period)}
          </div>
        </div>
        <div className="card p-4">
          <div className="label">Allocated</div>
          <div className="num mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-good">
            {fmtMoney(view.totalAllocated)}
          </div>
          <div className="text-[11px] text-muted mt-1">across clients</div>
        </div>
        <div className="card p-4">
          <div className="label">Unallocated</div>
          <div
            className={`num mt-2 text-2xl md:text-3xl font-semibold tracking-tight ${
              view.totalUnallocated > 0 ? 'text-bad' : 'text-muted'
            }`}
          >
            {fmtMoney(view.totalUnallocated)}
          </div>
          <div className="text-[11px] text-muted mt-1">
            spend with no assigned leads
          </div>
        </div>
      </section>

      {/* Per-client roll-up */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">By client — total allocated this period</h2>
          <p className="text-muted text-xs mt-0.5">
            Feeds each client&apos;s &ldquo;Advertising management&rdquo;
            line (after the per-client management markup).
          </p>
        </header>
        <table className="w-full text-sm">
          <thead className="text-muted text-xs uppercase">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-5 py-2">Client</th>
              <th className="text-right font-medium px-5 py-2">Allocated spend</th>
            </tr>
          </thead>
          <tbody>
            {view.perClientTotals.size === 0 && (
              <tr>
                <td colSpan={2} className="px-5 py-8 text-center text-muted">
                  No allocations yet for this period.
                </td>
              </tr>
            )}
            {Array.from(view.perClientTotals.entries())
              .map(([cid, amt]) => ({
                cid,
                company: view.clientsById.get(cid) ?? '—',
                amt,
              }))
              .sort((a, b) => a.company.localeCompare(b.company))
              .map((row) => (
                <tr
                  key={row.cid}
                  className="border-b last:border-b-0 border-hairline"
                >
                  <td className="px-5 py-3 font-medium">{row.company}</td>
                  <td className="px-5 py-3 text-right num">
                    {fmtMoney2(row.amt)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      {/* Per-campaign breakdown */}
      <section className="space-y-4">
        <h2 className="font-semibold text-lg">
          By campaign — record spend &amp; see split
        </h2>
        {view.campaigns.length === 0 && (
          <div className="card p-8 text-center text-muted text-sm">
            No campaigns yet. Add a campaign first.
          </div>
        )}
        {view.campaigns.map((c) => {
          const recorded = view.spendByCampaign.get(c.campaign_id);
          const alloc = view.allocations.find(
            (a) => a.campaign_id === c.campaign_id,
          );
          const hasSpend = recorded != null;
          const flagged = hasSpend && (alloc?.unallocated_amount ?? 0) > 0;
          return (
            <section key={c.campaign_id} className="card">
              <header className="px-5 py-4 border-b border-hairline flex items-baseline justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold">
                    {c.campaign_name}{' '}
                    {c.is_regional ? (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber/10 text-amber border border-amber/30 align-middle">
                        regional · shared
                      </span>
                    ) : (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-hairline/40 text-muted border border-hairline align-middle">
                        single client
                      </span>
                    )}
                  </h3>
                  <p className="text-muted text-xs mt-0.5">
                    {c.platform}
                    {c.client_company && (
                      <> · owned by {c.client_company}</>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <div className="num text-sm font-medium">
                    {hasSpend ? fmtMoney2(recorded ?? 0) : '—'}
                  </div>
                  <div className="text-[10px] text-muted">recorded spend</div>
                </div>
              </header>

              {/* Spend form */}
              <div className="px-5 py-4 border-b border-hairline">
                <form
                  action={recordCampaignSpend}
                  className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end"
                >
                  <input type="hidden" name="campaign_id" value={c.campaign_id} />
                  <input type="hidden" name="period" value={view.period} />
                  <label className="flex-1">
                    <div className="label">Spend for {monthLabel(view.period)} (£)</div>
                    <input
                      type="number"
                      name="amount"
                      step="0.01"
                      min="0"
                      defaultValue={recorded ?? ''}
                      placeholder="0.00"
                      required
                      className="input num w-full mt-1"
                    />
                  </label>
                  <button type="submit" className="btn btn-primary">
                    {hasSpend ? 'Update' : 'Record'}
                  </button>
                  {hasSpend && (
                    <button
                      type="submit"
                      formAction={removeCampaignSpend}
                      className="btn"
                    >
                      Remove
                    </button>
                  )}
                </form>
              </div>

              {/* Split table */}
              {hasSpend && (
                <div>
                  {flagged && (
                    <div className="px-5 py-3 bg-bad/5 border-b border-hairline text-xs text-bad">
                      <span className="font-medium">Unallocated:</span>{' '}
                      {fmtMoney2(alloc?.unallocated_amount ?? 0)} — this
                      campaign has spend but zero assigned leads this period.
                      Review before issuing invoices.
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead className="text-muted text-xs uppercase">
                      <tr className="border-b border-hairline">
                        <th className="text-left font-medium px-5 py-2">
                          Client
                        </th>
                        <th className="text-right font-medium px-3 py-2">
                          Leads
                        </th>
                        <th className="text-right font-medium px-3 py-2">
                          Share
                        </th>
                        <th className="text-right font-medium px-5 py-2">
                          Allocated
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(alloc?.per_client ?? []).length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-5 py-6 text-center text-muted text-sm"
                          >
                            No assigned leads from this campaign in{' '}
                            {monthLabel(view.period)}.
                          </td>
                        </tr>
                      )}
                      {(alloc?.per_client ?? []).map((pc) => (
                        <tr
                          key={pc.client_id}
                          className="border-b last:border-b-0 border-hairline"
                        >
                          <td className="px-5 py-3">
                            {view.clientsById.get(pc.client_id) ?? '—'}
                          </td>
                          <td className="px-3 py-3 text-right num">
                            {pc.leads}
                          </td>
                          <td className="px-3 py-3 text-right num">
                            {fmtPct(pc.share_pct)}
                          </td>
                          <td className="px-5 py-3 text-right num font-medium">
                            {fmtMoney2(pc.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </section>
    </div>
  );
}
