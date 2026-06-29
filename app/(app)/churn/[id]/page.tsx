import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerAdmin } from '@/lib/supabase/admin';
import { loadClient } from '@/lib/data';
import { computeChurnRisk } from '@/lib/churn-risk';
import type { ChurnBand } from '@/lib/churn-risk';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  return { title: 'Churn Risk Detail' };
}

function fmt(v: number | null, unit: 'pct' | 'x' | 'days' | 'count'): string {
  if (v == null) return '—';
  if (unit === 'pct') return `${Math.round(v * 100)}%`;
  if (unit === 'x') return `${v.toFixed(1)}×`;
  if (unit === 'days') return `${v} day${v !== 1 ? 's' : ''}`;
  return String(Math.round(v));
}

function bandClasses(band: ChurnBand): { pill: string; border: string; bar: string } {
  switch (band) {
    case 'At risk':
      return { pill: 'bg-red-100 text-red-700', border: 'border-bad', bar: 'bg-red-500' };
    case 'Watch':
      return { pill: 'bg-amber-100 text-amber-700', border: 'border-amber', bar: 'bg-amber-400' };
    case 'Too new':
      return { pill: 'bg-zinc-100 text-zinc-500', border: 'border-hairline', bar: 'bg-zinc-400' };
    default:
      return { pill: 'bg-green-100 text-green-700', border: 'border-good', bar: 'bg-green-500' };
  }
}

export default async function ChurnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let clientData: Awaited<ReturnType<typeof loadClient>>;
  try {
    clientData = await loadClient(id);
  } catch {
    notFound();
  }

  const { client, appointments, leads } = clientData;

  const admin = getServerAdmin();
  const { data: loginRows } = await admin
    .from('portal_activity')
    .select('occurred_at')
    .eq('client_id', id)
    .eq('event_type', 'login')
    .order('occurred_at', { ascending: false });

  const logins = (loginRows ?? []) as { occurred_at: string }[];

  const clientLeads = leads.map((l) => ({
    client_id: id,
    created_at: l.created_at,
  }));

  const result = computeChurnRisk(client, appointments, clientLeads, logins);
  const cls = bandClasses(result.band);

  const lastLogin =
    logins.length > 0
      ? new Date(logins[0].occurred_at).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null;

  return (
    <div className="space-y-8">
      {/* Back + header */}
      <div>
        <Link
          href="/churn"
          className="text-xs text-muted hover:text-amber transition-colors mb-4 inline-block"
        >
          ← Back to Churn Risk
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {client.company}
            </h1>
            <p className="text-muted text-sm mt-1">Churn risk breakdown</p>
          </div>
          <div className="flex items-center gap-3">
            {result.sufficient_data && (
              <span className="num text-3xl font-semibold tabular-nums text-ink">
                {result.score}
              </span>
            )}
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium border ${cls.pill} ${cls.border}`}
            >
              {result.band}
            </span>
          </div>
        </div>

        {/* Score bar */}
        {result.sufficient_data && (
          <div className="mt-4 h-2 rounded-full bg-hairline overflow-hidden max-w-xs">
            <div
              className={`h-full rounded-full ${cls.bar} transition-all`}
              style={{ width: `${result.score}%` }}
            />
          </div>
        )}
      </div>

      {/* Reasons */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline">
          <h2 className="font-semibold">
            {result.reasons.length === 0 && result.sufficient_data
              ? 'No risk signals'
              : 'Why this band'}
          </h2>
        </header>
        {result.reasons.length === 0 ? (
          <div className="px-5 py-5 text-sm text-muted">
            {result.sufficient_data
              ? 'No risk signals detected. All indicators are within healthy range.'
              : result.reasons[0]}
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {result.reasons.map((reason, i) => (
              <li key={i} className="px-5 py-3.5 flex items-start gap-3 text-sm">
                <span
                  className={`mt-0.5 shrink-0 font-bold ${
                    result.band === 'At risk'
                      ? 'text-red-500'
                      : result.band === 'Watch'
                        ? 'text-amber'
                        : 'text-zinc-400'
                  }`}
                >
                  ›
                </span>
                <span className="text-ink">{reason}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Raw inputs — transparency table */}
      {result.sufficient_data && (
        <section className="card">
          <header className="px-5 py-4 border-b border-hairline">
            <h2 className="font-semibold">Score inputs</h2>
            <p className="text-xs text-muted mt-0.5">
              Raw data behind the score — sanity-check it here
            </p>
          </header>
          <div className="divide-y divide-hairline">
            {[
              {
                label: 'Weeks active',
                value: fmt(result.inputs.weeks_active, 'count'),
                note: 'Total weeks since joining',
              },
              {
                label: 'Total sits',
                value: fmt(result.inputs.total_sits, 'count'),
                note: 'All sat + sold appointments',
              },
              {
                label: 'Close rate — last 4 weeks',
                value: fmt(result.inputs.close_rate_recent, 'pct'),
                note: 'Sold ÷ sits in the most recent 4-week window',
              },
              {
                label: 'Close rate — prior 4 weeks',
                value: fmt(result.inputs.close_rate_prior, 'pct'),
                note: 'Sold ÷ sits in the 4–8 weeks ago window',
              },
              {
                label: 'No-show rate — last 4 weeks',
                value: fmt(result.inputs.no_show_rate_recent, 'pct'),
                note: 'No-shows ÷ occurred appointments',
              },
              {
                label: 'Delivery — last 4 weeks',
                value:
                  result.inputs.delivery_pct_recent != null
                    ? fmt(result.inputs.delivery_pct_recent, 'pct')
                    : 'No weekly promise set',
                note: 'Leads delivered ÷ weekly promise × 4',
              },
              {
                label: 'Days since portal login',
                value:
                  result.inputs.days_since_portal_login != null
                    ? fmt(result.inputs.days_since_portal_login, 'days')
                    : 'No logins recorded',
                note: lastLogin ? `Last login: ${lastLogin}` : 'Client has not visited the portal',
              },
              {
                label: 'Down-rated appointments — last 4 weeks',
                value: `${result.inputs.flagged_recent} of ${result.inputs.occurred_recent}`,
                note: 'Quality rating = down',
              },
              {
                label: 'Overall ROI',
                value: fmt(result.inputs.roi_overall, 'x'),
                note: 'Revenue generated ÷ total fees paid',
              },
            ].map((row) => (
              <div
                key={row.label}
                className="px-5 py-3 grid grid-cols-[1fr_auto] gap-4 items-baseline"
              >
                <div>
                  <div className="text-sm text-ink">{row.label}</div>
                  <div className="text-xs text-muted mt-0.5">{row.note}</div>
                </div>
                <div className="num text-sm font-medium tabular-nums text-ink text-right shrink-0">
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Link to client detail */}
      <div className="flex justify-end">
        <Link
          href={`/clients/${client.id}`}
          className="text-sm text-muted hover:text-amber transition-colors"
        >
          Open full client profile →
        </Link>
      </div>
    </div>
  );
}
