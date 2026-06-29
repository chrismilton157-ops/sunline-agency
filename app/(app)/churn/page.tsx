import Link from 'next/link';
import { getServerAdmin } from '@/lib/supabase/admin';
import { loadAll, groupByClientId } from '@/lib/data';
import { computeChurnRisk } from '@/lib/churn-risk';
import type { ChurnBand, ChurnRiskResult } from '@/lib/churn-risk';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Churn Risk' };
export const dynamic = 'force-dynamic';

async function loadChurnData() {
  const admin = getServerAdmin();
  const { clients, appointments, leads } = await loadAll();

  // Only active clients are relevant for churn
  const activeClients = clients.filter((c) => c.status === 'active');

  // Fetch portal login activity (owner-only table)
  const { data: loginRows } = await admin
    .from('portal_activity')
    .select('client_id, occurred_at')
    .eq('event_type', 'login');

  const loginsByClient = new Map<string, { occurred_at: string }[]>();
  for (const row of loginRows ?? []) {
    const arr = loginsByClient.get(row.client_id) ?? [];
    arr.push({ occurred_at: row.occurred_at });
    loginsByClient.set(row.client_id, arr);
  }

  const apptsByClient = groupByClientId(appointments);
  const leadsByClient = groupByClientId(leads);

  const results: ChurnRiskResult[] = activeClients.map((client) => {
    const clientAppts = apptsByClient.get(client.id) ?? [];
    const clientLeads = (leadsByClient.get(client.id) ?? []).map((l) => ({
      client_id: client.id,
      created_at: l.created_at,
    }));
    const logins = loginsByClient.get(client.id) ?? [];
    return computeChurnRisk(client, clientAppts, clientLeads, logins);
  });

  // Sort: At risk first, then Watch, then Healthy, then Too new. Within band, by score desc.
  const bandOrder: Record<ChurnBand, number> = {
    'At risk': 0,
    Watch: 1,
    Healthy: 2,
    'Too new': 3,
  };
  results.sort((a, b) => {
    const bo = bandOrder[a.band] - bandOrder[b.band];
    if (bo !== 0) return bo;
    return b.score - a.score;
  });

  return results;
}

function bandClasses(band: ChurnBand): { pill: string; border: string; dot: string } {
  switch (band) {
    case 'At risk':
      return {
        pill: 'bg-red-100 text-red-700',
        border: 'border-l-bad',
        dot: 'bg-red-500',
      };
    case 'Watch':
      return {
        pill: 'bg-amber-100 text-amber-700',
        border: 'border-l-amber',
        dot: 'bg-amber-500',
      };
    case 'Too new':
      return {
        pill: 'bg-zinc-100 text-zinc-500',
        border: 'border-l-hairline',
        dot: 'bg-zinc-400',
      };
    default:
      return {
        pill: 'bg-green-100 text-green-700',
        border: 'border-l-good',
        dot: 'bg-green-500',
      };
  }
}

function ScoreBar({ score, band }: { score: number; band: ChurnBand }) {
  const colour =
    band === 'At risk'
      ? 'bg-red-500'
      : band === 'Watch'
        ? 'bg-amber-400'
        : 'bg-green-500';
  return (
    <div className="w-16 h-1.5 rounded-full bg-hairline overflow-hidden">
      <div
        className={`h-full rounded-full ${colour}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

export default async function ChurnPage() {
  const results = await loadChurnData();

  const atRisk = results.filter((r) => r.band === 'At risk');
  const watching = results.filter((r) => r.band === 'Watch');
  const healthy = results.filter((r) => r.band === 'Healthy');

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Churn Risk
        </h1>
        <p className="text-muted text-sm mt-1">
          Early-warning view — who to call this week, sorted by risk
        </p>
      </header>

      {/* Summary pills */}
      <div className="flex flex-wrap gap-3">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          {atRisk.length} at risk
        </span>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {watching.length} watch
        </span>
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-green-700 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          {healthy.length} healthy
        </span>
      </div>

      {/* How the score is computed — transparency for owner */}
      <details className="card text-sm">
        <summary className="px-5 py-3 cursor-pointer font-medium text-muted hover:text-ink select-none">
          How the score is computed ↓
        </summary>
        <div className="px-5 pb-4 pt-1 space-y-2 text-muted leading-relaxed border-t border-hairline">
          <p>Each active client with at least <strong>6 weeks of history</strong> and <strong>5+ sits</strong> is scored on six leading indicators. Below that threshold the client is shown as <em>Too new to assess</em> — they are never falsely flagged.</p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li><strong>Close rate trend (25 pts):</strong> close rate dropped ≥ 12 percentage points in the last 4 weeks vs the prior 4 weeks</li>
            <li><strong>Close rate low (15 pts):</strong> close rate below 25% (used when there is no prior window to compare)</li>
            <li><strong>No-show rate (20 pts):</strong> recent no-show rate above 30%</li>
            <li><strong>Delivery shortfall (20 pts):</strong> delivered less than 70% of the weekly promise over the last 4 weeks</li>
            <li><strong>Portal inactivity (8–15 pts):</strong> no portal login in 14+ days (8 pts) or 30+ days (15 pts)</li>
            <li><strong>Quality flags (10 pts):</strong> 25%+ of recent appointments rated down</li>
            <li><strong>Low ROI (10 pts):</strong> overall ROI below 1.5×</li>
          </ul>
          <p className="mt-1"><strong>Bands:</strong> 0–24 = Healthy · 25–49 = Watch · 50+ = At risk</p>
        </div>
      </details>

      {/* Client list */}
      {results.length === 0 ? (
        <div className="card px-5 py-10 text-center text-muted text-sm">
          No active clients yet.
        </div>
      ) : (
        <section className="card divide-y divide-hairline">
          <header className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center">
            <span className="label text-xs">Client</span>
            <span className="label text-xs text-right w-20">Score</span>
            <span className="label text-xs w-20">Band</span>
            <span className="label text-xs w-16" />
          </header>
          {results.map((r) => {
            const cls = bandClasses(r.band);
            return (
              <div
                key={r.client.id}
                className={`px-5 py-4 border-l-4 ${cls.border} grid grid-cols-[1fr_auto_auto_auto] gap-4 items-start`}
              >
                {/* Client name + reasons */}
                <div className="min-w-0">
                  <div className="font-semibold text-ink">{r.client.company}</div>
                  {r.reasons.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {r.reasons.slice(0, 3).map((reason, i) => (
                        <li key={i} className="text-xs text-muted flex items-start gap-1.5">
                          <span className="mt-[3px] shrink-0 text-amber">›</span>
                          {reason}
                        </li>
                      ))}
                      {r.reasons.length > 3 && (
                        <li className="text-xs text-muted ml-3.5">
                          +{r.reasons.length - 3} more reason{r.reasons.length - 3 !== 1 ? 's' : ''}
                        </li>
                      )}
                    </ul>
                  )}
                  {r.reasons.length === 0 && r.band === 'Healthy' && (
                    <p className="text-xs text-muted mt-1">No risk signals detected.</p>
                  )}
                  {!r.sufficient_data && (
                    <p className="text-xs text-muted mt-1 italic">{r.reasons[0]}</p>
                  )}
                </div>

                {/* Score + bar */}
                <div className="text-right pt-0.5 w-20">
                  {r.sufficient_data ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="num text-sm font-semibold tabular-nums text-ink">
                        {r.score}
                      </span>
                      <ScoreBar score={r.score} band={r.band} />
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </div>

                {/* Band pill */}
                <div className="w-20 pt-0.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls.pill}`}
                  >
                    {r.band}
                  </span>
                </div>

                {/* Detail link */}
                <div className="w-16 pt-0.5 text-right">
                  <Link
                    href={`/churn/${r.client.id}`}
                    className="text-xs text-muted hover:text-amber transition-colors"
                  >
                    Detail →
                  </Link>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
