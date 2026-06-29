import Link from 'next/link';
import { getServerAdmin } from '@/lib/supabase/admin';
import { loadAll, loadOwnerInvoices } from '@/lib/data';
import {
  clientMetrics,
  MONTHLY_OVERHEAD,
  portfolio,
} from '@/lib/metrics';
import { computeChurnRisk } from '@/lib/churn-risk';
import { fmtMoney2, fmtPct } from '@/lib/format';
import { clearFlag } from '@/app/(confirmer)/cockpit/actions';

import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Today' };

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Data loader — all reads via service-role admin so we see full data.
// ---------------------------------------------------------------------------

type FlaggedAppt = {
  id: string;
  appt_date: string;
  flagged_reason: string | null;
  flagged_at: string | null;
  lead_name: string | null;
  lead_phone: string | null;
};

async function loadFlaggedAppointments(): Promise<FlaggedAppt[]> {
  const admin = getServerAdmin();
  const { data } = await admin
    .from('appointments')
    .select('id, appt_date, flagged_reason, flagged_at, leads(name, phone)')
    .eq('flagged', true)
    .order('flagged_at', { ascending: false })
    .limit(20);
  return (data ?? []).map((a: Record<string, unknown>) => {
    const lead = a.leads as { name?: string | null; phone?: string | null } | null;
    return {
      id: a.id as string,
      appt_date: a.appt_date as string,
      flagged_reason: (a.flagged_reason as string | null) ?? null,
      flagged_at: (a.flagged_at as string | null) ?? null,
      lead_name: lead?.name ?? null,
      lead_phone: lead?.phone ?? null,
    };
  });
}

async function loadTodayData() {
  const admin = getServerAdmin();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [
    { clients, appointments, leads },
    { invoices },
    newLeadsRes,
    confirmRes,
    leadsCreatedTodayRes,
    apptsBookedTodayRes,
    sitsTodayRes,
  ] = await Promise.all([
    loadAll(),
    loadOwnerInvoices(),
    // Leads that are new + consented (unworked queue entries)
    admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('consent', true)
      .eq('status', 'new'),
    // Booked appointments within 48h that aren't yet confirmed
    admin
      .from('appointments')
      .select('id, appt_date, confirmed_at')
      .eq('outcome', 'booked')
      .gt('appt_date', now.toISOString()),
    // Leads created today
    admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayIso),
    // Appointments booked today (outcome = booked, created today)
    admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('outcome', 'booked')
      .gte('created_at', todayIso),
    // Sits today (outcome sat or sold, appt_date today)
    admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .in('outcome', ['sat', 'sold'])
      .gte('appt_date', todayIso)
      .lt('appt_date', new Date(todayStart.getTime() + 86400000).toISOString()),
  ]);

  // Appointments needing confirmation (within 48h, not confirmed)
  const h48 = now.getTime() + 48 * 60 * 60 * 1000;
  const needsConfirming = (confirmRes.data ?? []).filter((a) => {
    if (a.confirmed_at) return false;
    return new Date(a.appt_date).getTime() <= h48;
  }).length;

  // Draft invoices
  const draftCount = invoices.filter((i) => i.status === 'draft').length;

  // Portfolio-level alerts (same logic as Overview)
  const sitsTotal = appointments.filter(
    (a) => a.outcome === 'sat' || a.outcome === 'sold',
  ).length;
  const perClient = clients.map((c) =>
    clientMetrics(
      c,
      appointments.filter((a) => a.client_id === c.id),
      leads.filter((l) => l.client_id === c.id),
      { monthlyOverhead: MONTHLY_OVERHEAD, totalSitsAcrossPortfolio: sitsTotal },
    ),
  );
  const pf = portfolio(clients, perClient, appointments, leads, MONTHLY_OVERHEAD);

  const alerts: { kind: 'bad' | 'amber'; text: string }[] = [];
  for (const m of perClient) {
    if (m.marginPerSit != null && m.marginPerSit < 0) {
      alerts.push({
        kind: 'bad',
        text: `${m.client.company}: margin per sit is negative (${fmtMoney2(m.marginPerSit)}).`,
      });
    }
  }
  if (pf.revenueConcentration != null && pf.revenueConcentration > 0.4) {
    alerts.push({
      kind: 'amber',
      text: `Revenue concentration is ${fmtPct(pf.revenueConcentration)} — one client carries more than 40% of total revenue.`,
    });
  }

  // Churn risk: count of active clients flagged At risk or Watch
  const admin2 = getServerAdmin();
  const { data: loginRows } = await admin2
    .from('portal_activity')
    .select('client_id, occurred_at')
    .eq('event_type', 'login');
  const loginsByClient = new Map<string, { occurred_at: string }[]>();
  for (const row of loginRows ?? []) {
    const arr = loginsByClient.get(row.client_id) ?? [];
    arr.push({ occurred_at: row.occurred_at });
    loginsByClient.set(row.client_id, arr);
  }
  const activeClients = clients.filter((c) => c.status === 'active');
  const churnResults = activeClients.map((c) =>
    computeChurnRisk(
      c,
      appointments.filter((a) => a.client_id === c.id),
      leads
        .filter((l) => l.client_id === c.id)
        .map((l) => ({ client_id: c.id, created_at: l.created_at })),
      loginsByClient.get(c.id) ?? [],
    ),
  );
  const atRiskCount = churnResults.filter((r) => r.band === 'At risk').length;
  const watchCount = churnResults.filter((r) => r.band === 'Watch').length;

  return {
    newLeads: newLeadsRes.count ?? 0,
    needsConfirming,
    alerts,
    draftCount,
    leadsToday: leadsCreatedTodayRes.count ?? 0,
    apptsBookedToday: apptsBookedTodayRes.count ?? 0,
    sitsToday: sitsTodayRes.count ?? 0,
    atRiskCount,
    watchCount,
  };
}

// ---------------------------------------------------------------------------
// Flagged appointments section
// ---------------------------------------------------------------------------

function FlaggedSection({ flagged }: { flagged: FlaggedAppt[] }) {
  if (flagged.length === 0) return null;

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtShort(iso: string) {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <section className="card">
      <header className="px-5 py-4 border-b border-hairline flex items-baseline justify-between">
        <h2 className="font-semibold text-red-600">🚩 Flagged by confirmer</h2>
        <span className="text-xs text-red-400">{flagged.length} active flag{flagged.length !== 1 ? 's' : ''}</span>
      </header>
      <ul className="divide-y divide-hairline">
        {flagged.map((a) => (
          <li key={a.id} className="px-5 py-3 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-ink">{a.lead_name ?? 'Unknown homeowner'}</div>
              <div className="text-xs text-muted mt-0.5">
                Appt: {fmtDate(a.appt_date)}
                {a.flagged_at && <> · Flagged {fmtShort(a.flagged_at)}</>}
              </div>
              {a.flagged_reason && (
                <div className="text-xs text-red-600 mt-1 font-medium">{a.flagged_reason}</div>
              )}
            </div>
            <form action={async () => { 'use server'; await clearFlag(a.id); }}>
              <button
                type="submit"
                className="text-xs px-3 py-1.5 rounded-lg border border-hairline bg-white text-muted hover:bg-hairline/30 transition-colors shrink-0"
              >
                Clear flag
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Card primitives
// ---------------------------------------------------------------------------

type CardStatus = 'urgent' | 'warn' | 'clear' | 'info';

function CommandCard({
  status,
  count,
  label,
  sublabel,
  href,
  children,
}: {
  status: CardStatus;
  count?: number | null;
  label: string;
  sublabel: string;
  href: string;
  children?: React.ReactNode;
}) {
  const accentClass =
    status === 'urgent'
      ? 'border-l-bad'
      : status === 'warn'
        ? 'border-l-amber'
        : status === 'clear'
          ? 'border-l-good'
          : 'border-l-hairline';

  const countClass =
    status === 'urgent'
      ? 'text-bad'
      : status === 'warn'
        ? 'text-amber'
        : status === 'clear'
          ? 'text-good'
          : 'text-ink';

  return (
    <Link
      href={href}
      className={`card p-5 border-l-4 ${accentClass} flex flex-col gap-2 hover:shadow-sm transition-shadow group`}
    >
      {count != null && (
        <div className={`num text-4xl font-semibold tracking-tight ${countClass}`}>
          {count}
        </div>
      )}
      <div>
        <div className="font-semibold text-ink group-hover:text-amber transition-colors">
          {label}
        </div>
        <div className="text-xs text-muted mt-0.5">{sublabel}</div>
      </div>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TodayPage() {
  const [
    {
      newLeads,
      needsConfirming,
      alerts,
      draftCount,
      leadsToday,
      apptsBookedToday,
      sitsToday,
      atRiskCount,
      watchCount,
    },
    flagged,
  ] = await Promise.all([loadTodayData(), loadFlaggedAppointments()]);

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Card definitions — add new cards here, one entry each.
  const cards = [
    {
      id: 'new-leads',
      status: (newLeads > 0 ? 'urgent' : 'clear') as CardStatus,
      count: newLeads,
      label: 'New leads to call',
      sublabel:
        newLeads > 0
          ? 'Consented leads waiting in the queue'
          : 'Queue is clear — nothing new to call',
      href: '/queue',
    },
    {
      id: 'confirmations',
      status: (needsConfirming > 0 ? 'warn' : 'clear') as CardStatus,
      count: needsConfirming,
      label: 'Appointments to confirm',
      sublabel:
        needsConfirming > 0
          ? 'Upcoming within 48 h and not yet confirmed'
          : 'All upcoming appointments are confirmed',
      href: '/confirmations',
    },
    {
      id: 'draft-invoices',
      status: (draftCount > 0 ? 'warn' : 'clear') as CardStatus,
      count: draftCount,
      label: 'Draft invoices',
      sublabel:
        draftCount > 0
          ? 'Awaiting review and issue'
          : 'No draft invoices — billing is up to date',
      href: '/billing',
    },
    {
      id: 'churn-risk',
      status: (atRiskCount > 0 ? 'urgent' : watchCount > 0 ? 'warn' : 'clear') as CardStatus,
      count: atRiskCount + watchCount,
      label: 'Clients to watch for churn',
      sublabel:
        atRiskCount > 0
          ? `${atRiskCount} at risk · ${watchCount} on watch — call them this week`
          : watchCount > 0
            ? `${watchCount} on watch — keep an eye on these`
            : 'All clients are healthy — no churn signals',
      href: '/churn',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Today
        </h1>
        <p className="text-muted text-sm mt-1">{today} · What needs doing right now</p>
      </header>

      {/* Action cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <CommandCard key={c.id} {...c} />
        ))}
      </section>

      {/* Alerts card */}
      <section className="card">
        <header className="px-5 py-4 border-b border-hairline flex items-baseline justify-between">
          <h2 className="font-semibold">Failsafe alerts</h2>
          {alerts.length === 0 && (
            <span className="text-xs text-good font-medium">All clear</span>
          )}
        </header>
        {alerts.length === 0 ? (
          <div className="px-5 py-6 text-sm text-muted">
            No active alerts — margins and concentration are within acceptable range.
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={`px-5 py-3 text-sm flex items-start gap-3
                  ${a.kind === 'bad' ? 'text-bad' : 'text-amber'}`}
              >
                <span className="mt-0.5 shrink-0">⚠</span>
                <span className="text-ink">{a.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
          <Link href="/alerts" className="text-xs text-muted hover:text-amber transition-colors">
            View all alerts →
          </Link>
          <Link href="/overview" className="text-xs text-muted hover:text-amber transition-colors">
            Full overview →
          </Link>
        </div>
      </section>

      {/* Flagged by confirmer */}
      <FlaggedSection flagged={flagged} />

      {/* Today's numbers row */}
      <section>
        <h2 className="label mb-3">Today&apos;s numbers</h2>
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <div className="card p-4 text-center">
            <div className="num text-3xl font-semibold text-ink">{leadsToday}</div>
            <div className="text-xs text-muted mt-1">Leads in today</div>
          </div>
          <div className="card p-4 text-center">
            <div className="num text-3xl font-semibold text-ink">{apptsBookedToday}</div>
            <div className="text-xs text-muted mt-1">Appointments booked</div>
          </div>
          <div className="card p-4 text-center">
            <div className="num text-3xl font-semibold text-ink">{sitsToday}</div>
            <div className="text-xs text-muted mt-1">Sits today</div>
          </div>
        </div>
      </section>
    </div>
  );
}
