import { loadCampaignAttribution } from '@/lib/data';
import { fmtInt, fmtMoney, fmtMoney2, fmtRatio } from '@/lib/format';

export const dynamic = 'force-dynamic';

const safeFmt = (
  v: number | null,
  formatter: (n: number) => string,
): string => (v == null || !Number.isFinite(v) ? '—' : formatter(v));

export default async function AttributionPage() {
  const rows = await loadCampaignAttribution();
  const totals = rows.reduce(
    (acc, r) => {
      acc.ad_spend += r.ad_spend;
      acc.leads += r.leads;
      acc.appointments += r.appointments;
      acc.sales += r.sales;
      acc.revenue += r.revenue;
      return acc;
    },
    { ad_spend: 0, leads: 0, appointments: 0, sales: 0, revenue: 0 },
  );
  const totalRoas =
    totals.ad_spend > 0 ? totals.revenue / totals.ad_spend : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Attribution
        </h1>
        <p className="text-muted text-sm mt-1">
          Spend → leads → appointments → sales, per campaign. Cost-per-X and
          ROAS based on lifetime numbers in the seed/live data.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="card p-4">
          <div className="label">Total spend</div>
          <div className="num mt-2 text-2xl font-semibold tracking-tight">
            {fmtMoney(totals.ad_spend)}
          </div>
        </div>
        <div className="card p-4">
          <div className="label">Total revenue</div>
          <div className="num mt-2 text-2xl font-semibold tracking-tight text-amber">
            {fmtMoney(totals.revenue)}
          </div>
        </div>
        <div className="card p-4">
          <div className="label">Portfolio ROAS</div>
          <div className="num mt-2 text-2xl font-semibold tracking-tight text-good">
            {safeFmt(totalRoas, (n) => fmtRatio(n))}
          </div>
        </div>
        <div className="card p-4">
          <div className="label">Sales</div>
          <div className="num mt-2 text-2xl font-semibold tracking-tight">
            {fmtInt(totals.sales)}
          </div>
        </div>
      </section>

      <section className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-muted text-xs uppercase bg-bg/60">
            <tr className="border-b border-hairline">
              <th className="text-left font-medium px-5 py-3">Campaign</th>
              <th className="text-right font-medium px-3 py-3">Spend</th>
              <th className="text-right font-medium px-3 py-3">Leads</th>
              <th className="text-right font-medium px-3 py-3">Appts</th>
              <th className="text-right font-medium px-3 py-3">Sales</th>
              <th className="text-right font-medium px-3 py-3">Revenue</th>
              <th className="text-right font-medium px-3 py-3">CPL</th>
              <th className="text-right font-medium px-3 py-3">CPA</th>
              <th className="text-right font-medium px-3 py-3">CPS</th>
              <th className="text-right font-medium px-5 py-3">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.campaign_id}
                className="border-b last:border-b-0 border-hairline"
              >
                <td className="px-5 py-3">
                  <div className="font-medium">{r.campaign_name}</div>
                  <div className="text-muted text-xs">
                    {r.client_company} · {r.platform}
                  </div>
                </td>
                <td className="px-3 py-3 text-right num">
                  {fmtMoney(r.ad_spend)}
                </td>
                <td className="px-3 py-3 text-right num">{fmtInt(r.leads)}</td>
                <td className="px-3 py-3 text-right num">
                  {fmtInt(r.appointments)}
                </td>
                <td className="px-3 py-3 text-right num">{fmtInt(r.sales)}</td>
                <td className="px-3 py-3 text-right num">
                  {fmtMoney(r.revenue)}
                </td>
                <td className="px-3 py-3 text-right num">
                  {safeFmt(r.cost_per_lead, fmtMoney2)}
                </td>
                <td className="px-3 py-3 text-right num">
                  {safeFmt(r.cost_per_appointment, fmtMoney2)}
                </td>
                <td className="px-3 py-3 text-right num">
                  {safeFmt(r.cost_per_sale, fmtMoney2)}
                </td>
                <td className="px-5 py-3 text-right num font-medium">
                  {safeFmt(r.roas, fmtRatio)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-5 py-8 text-center text-muted">
                  No campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
