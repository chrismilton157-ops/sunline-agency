import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Setters' };

import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { computeSetterQuality, computeSetterClaimStats, displayName, initialsFromEmail } from '@/lib/setter-metrics';
import type { SetterRow, DispositionRow, ApptRow, LeadClaimRow } from '@/lib/setter-metrics';
import { computeDialerTotals, todayBoundsUTC, fmtDuration } from '@/lib/setter-sessions';
import type { SessionRow } from '@/lib/setter-sessions';
import { Avatar } from '@/components/Avatar';
import { fmtPct } from '@/lib/format';
import { SettersClient } from './SettersClient';

export const dynamic = 'force-dynamic';

export default async function SettersPage() {
  const { user, role } = await requireOwner();
  if (!user) redirect('/login');
  if (role !== 'owner') redirect('/queue');

  const admin = getServerAdmin();

  const sinceSessions = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const [settersRes, dispsRes, apptsRes, leadsRes, sessionsRes] = await Promise.all([
    admin.from('users').select('id, email, avatar_url').in('role', ['setter', 'owner']),
    admin.from('call_dispositions')
      .select('id, lead_id, disposition, disqual_reason, created_by, created_at'),
    admin.from('appointments')
      .select('id, setter_id, setter, outcome, quality_rating, quality_reason, confirmed_at, appt_date'),
    admin.from('leads')
      .select('id, first_claimed_by, first_claimed_at, created_at')
      .not('first_claimed_at', 'is', null),
    admin.from('setter_sessions')
      .select('setter_id, state, started_at, ended_at, last_heartbeat_at')
      .or(`ended_at.is.null,started_at.gte.${sinceSessions}`),
  ]);

  if (settersRes.error) throw settersRes.error;
  if (dispsRes.error) throw dispsRes.error;
  if (apptsRes.error) throw apptsRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  const setters = (settersRes.data ?? []) as SetterRow[];
  const disps = (dispsRes.data ?? []) as DispositionRow[];
  const appts = (apptsRes.data ?? []) as ApptRow[];
  const leads = (leadsRes.data ?? []) as LeadClaimRow[];
  const sessions = (sessionsRes.data ?? []) as SessionRow[];

  // Dialer time today per setter (owner management view).
  const { start: dayStart } = todayBoundsUTC();
  const now = new Date();
  const dialerToday = setters
    .map((s) => {
      const totals = computeDialerTotals(sessions, s.id, dayStart, now);
      const totalMs = totals.activeMs + totals.pausedMs;
      return {
        id: s.id,
        name: displayName(s.email),
        initials: initialsFromEmail(s.email),
        avatarUrl: s.avatar_url,
        activeMs: totals.activeMs,
        pausedMs: totals.pausedMs,
        totalMs,
        activePct: totalMs > 0 ? totals.activeMs / totalMs : null,
      };
    })
    .filter((d) => d.totalMs > 0)
    .sort((a, b) => b.activeMs - a.activeMs);

  const byRange = {
    today: computeSetterQuality(setters, disps, appts, 'today'),
    week: computeSetterQuality(setters, disps, appts, 'week'),
    month: computeSetterQuality(setters, disps, appts, 'month'),
  };

  const claimsByRange = {
    today: computeSetterClaimStats(setters, leads, 'today'),
    week: computeSetterClaimStats(setters, leads, 'week'),
    month: computeSetterClaimStats(setters, leads, 'month'),
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Setter performance
        </h1>
        <p className="text-muted text-sm mt-1">
          Output metrics (bookings, dials) plus quality layer (no-show rate, down-ratings). Owner-only.
        </p>
      </header>

      {/* Dialer time today — active vs paused per setter (management metric) */}
      <section>
        <h2 className="text-base font-semibold mb-1">Dialer time today</h2>
        <p className="text-muted text-xs mb-3">
          Active (on the dialer receiving leads) vs paused, from pause/resume tracking.
        </p>
        {dialerToday.length === 0 ? (
          <div className="rounded-xl border border-hairline p-6 text-center text-sm text-muted">
            No dialer activity recorded today yet.
          </div>
        ) : (
          <div className="rounded-xl border border-hairline overflow-hidden divide-y divide-hairline">
            {dialerToday.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar avatarUrl={d.avatarUrl} initials={d.initials} sizeCls="w-8 h-8 text-xs" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{d.name}</div>
                  <div className="h-1.5 mt-1 rounded-full bg-hairline/60 overflow-hidden flex">
                    <div className="bg-good h-full" style={{ width: `${(d.activePct ?? 0) * 100}%` }} />
                    <div className="bg-amber/50 h-full" style={{ width: `${(1 - (d.activePct ?? 0)) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right shrink-0 text-xs num">
                  <div className="text-good font-semibold">{fmtDuration(d.activeMs)} active</div>
                  <div className="text-muted">{fmtDuration(d.pausedMs)} paused</div>
                </div>
                <div className="w-12 text-right num text-sm font-semibold shrink-0">
                  {fmtPct(d.activePct)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <SettersClient byRange={byRange} claimsByRange={claimsByRange} />
    </div>
  );
}
