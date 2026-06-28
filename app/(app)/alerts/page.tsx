import Link from 'next/link';
import { getServerAdmin } from '@/lib/supabase/admin';
import { loadAll, loadAllocationView } from '@/lib/data';
import { clientMetrics, MONTHLY_OVERHEAD, portfolio } from '@/lib/metrics';
import { ymUTC, previousYM } from '@/lib/billing';
import { computeAlerts, type Alert, type AlertSeverity } from '@/lib/alerts';
import { fmtMoney2 } from '@/lib/format';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Data loader
// ---------------------------------------------------------------------------

async function loadAlertsData() {
  const admin = getServerAdmin();
  const now = new Date();

  const [{ clients, appointments, leads }, confirmRes] = await Promise.all([
    loadAll(),
    // Booked future appointments not yet confirmed
    admin
      .from('appointments')
      .select('id, appt_date, confirmed_at')
      .eq('outcome', 'booked')
      .gt('appt_date', now.toISOString()),
  ]);

  // Appointments needing confirmation within 48 h
  const h48 = now.getTime() + 48 * 60 * 60 * 1000;
  const needsConfirmingCount = (confirmRes.data ?? []).filter((a) => {
    if (a.confirmed_at) return false;
    return new Date(a.appt_date).getTime() <= h48;
  }).length;

  // Metrics
  const sitsTotal = appointments.filter(
    (a) => a.outcome === 'sat' || a.outcome === 'sold',
  ).length;
  const perClient = clients.map((c) =>
    clientMetrics(
      c,
      appointments.filter((a) => a.client_id === c.id),
      leads.filter((l) => l.client_id === c.id),
      { monthlyOverhead: MONTHLY_OVERHEAD, totalSitsAcrossPortfolio: sitsTotal },
      now,
    ),
  );
  const pf = portfolio(clients, perClient, appointments, leads, MONTHLY_OVERHEAD, now);

  // Unallocated spend from current month's allocation
  const currentPeriod = ymUTC(now);
  const prevPeriod = previousYM(currentPeriod);
  // Check both current and previous period; use whichever has recorded spend
  const [allocCurrent, allocPrev] = await Promise.all([
    loadAllocationView(currentPeriod),
    loadAllocationView(prevPeriod),
  ]);
  // Prefer current period if it has any recorded spend, otherwise last month
  const allocView =
    allocCurrent.totalRecorded > 0 ? allocCurrent : allocPrev;
  const unallocatedSpend = allocView.totalUnallocated;
  const unallocatedPeriod =
    allocCurrent.totalRecorded > 0 ? currentPeriod : prevPeriod;

  const baseAlerts = computeAlerts({
    clients,
    appointments,
    leads,
    perClient,
    pf,
    needsConfirmingCount,
    now,
  });

  // Inject unallocated-spend alert (done here so allocation deps stay out of lib/alerts.ts)
  const alerts: Alert[] = [...baseAlerts];
  if (unallocatedSpend > 0) {
    alerts.push({
      severity: 'warning',
      title: `${fmtMoney2(unallocatedSpend)} of campaign spend unallocated in ${unallocatedPeriod}`,
      detail:
        'Spend has been recorded for a campaign but no leads were delivered from it, so it cannot be split across clients. Check the allocation screen.',
      actionHref: `/allocation?period=${unallocatedPeriod}`,
      actionLabel: 'Go to Allocation →',
    });
    // Re-sort after injecting
    const ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  }

  return { alerts };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info',
};

const SEVERITY_CLASSES: Record<AlertSeverity, { card: string; badge: string; icon: string }> = {
  critical: {
    card: 'border-bad/30 bg-bad/5',
    badge: 'bg-bad/10 text-bad border-bad/20',
    icon: 'text-bad',
  },
  warning: {
    card: 'border-amber/30 bg-amber/5',
    badge: 'bg-amber/10 text-amber border-amber/20',
    icon: 'text-amber',
  },
  info: {
    card: 'border-hairline bg-card',
    badge: 'bg-muted/10 text-muted border-hairline',
    icon: 'text-muted',
  },
};

function AlertCard({ alert }: { alert: Alert }) {
  const cls = SEVERITY_CLASSES[alert.severity];
  return (
    <div className={`rounded-lg border px-5 py-4 flex gap-4 items-start ${cls.card}`}>
      <span className={`mt-0.5 shrink-0 text-lg leading-none ${cls.icon}`}>⚠</span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cls.badge}`}
          >
            {SEVERITY_LABELS[alert.severity]}
          </span>
          {alert.entity && (
            <span className="text-xs text-muted truncate">{alert.entity}</span>
          )}
        </div>
        <p className="text-sm font-medium text-ink">{alert.title}</p>
        {alert.detail && (
          <p className="text-xs text-muted leading-relaxed">{alert.detail}</p>
        )}
        <Link
          href={alert.actionHref}
          className="inline-block text-xs text-amber hover:underline mt-1"
        >
          {alert.actionLabel}
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AlertsPage() {
  const { alerts } = await loadAlertsData();

  const criticals = alerts.filter((a) => a.severity === 'critical');
  const warnings = alerts.filter((a) => a.severity === 'warning');
  const infos = alerts.filter((a) => a.severity === 'info');

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Alerts
        </h1>
        <p className="text-muted text-sm mt-1">
          Active failsafe alerts across the portfolio — derived live from current data.
          They clear themselves once the underlying problem is resolved.
        </p>
      </header>

      {alerts.length === 0 ? (
        <div className="card px-8 py-14 flex flex-col items-center text-center gap-3">
          <div className="text-3xl">✓</div>
          <p className="font-semibold text-ink">All clear — no active alerts</p>
          <p className="text-sm text-muted max-w-sm">
            Margins are healthy, revenue is well-spread, confirmations are on track,
            and all clients are receiving leads.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary strip */}
          <div className="flex flex-wrap gap-3 text-sm">
            {criticals.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-bad/10 text-bad border border-bad/20 font-medium num">
                {criticals.length} critical
              </span>
            )}
            {warnings.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-amber/10 text-amber border border-amber/20 font-medium num">
                {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
              </span>
            )}
            {infos.length > 0 && (
              <span className="px-3 py-1 rounded-full bg-muted/10 text-muted border border-hairline font-medium num">
                {infos.length} info
              </span>
            )}
          </div>

          {/* Critical group */}
          {criticals.length > 0 && (
            <section className="space-y-3">
              <h2 className="label">Critical</h2>
              {criticals.map((a, i) => (
                <AlertCard key={i} alert={a} />
              ))}
            </section>
          )}

          {/* Warning group */}
          {warnings.length > 0 && (
            <section className="space-y-3">
              <h2 className="label">Warnings</h2>
              {warnings.map((a, i) => (
                <AlertCard key={i} alert={a} />
              ))}
            </section>
          )}

          {/* Info group */}
          {infos.length > 0 && (
            <section className="space-y-3">
              <h2 className="label">Info</h2>
              {infos.map((a, i) => (
                <AlertCard key={i} alert={a} />
              ))}
            </section>
          )}
        </div>
      )}

      {/* Speed-to-lead placeholder — dormant until webhook timestamps are confirmed */}
      <section className="card px-5 py-4 border-dashed opacity-60">
        <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">
          Placeholder — not yet active
        </p>
        <p className="text-sm text-ink font-medium">Speed-to-lead monitor</p>
        <p className="text-xs text-muted mt-1">
          Will fire when median lead response time exceeds the threshold. Requires
          <code className="mx-1 px-1 bg-bg rounded text-[11px]">response_mins</code>
          to be populated reliably via the speed-to-lead webhook. Wire up in{' '}
          <code className="px-1 bg-bg rounded text-[11px]">lib/alerts.ts</code>{' '}
          once confirmed.
        </p>
      </section>
    </div>
  );
}
