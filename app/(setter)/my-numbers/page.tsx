import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'My Numbers' };

import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import {
  computeSetterOutput,
  computeSetterActivity,
  computeSetterFunnel,
  leaderboardRank,
  displayName,
  initialsFromEmail,
} from '@/lib/setter-metrics';
import type { SetterRow, DispositionRow, ApptRow } from '@/lib/setter-metrics';
import { computeDialerTotals, todayBoundsUTC } from '@/lib/setter-sessions';
import type { SessionRow } from '@/lib/setter-sessions';
import { MyNumbersClient } from './MyNumbersClient';

export const dynamic = 'force-dynamic';

type Range = 'today' | 'week' | 'month';
const RANGES: Range[] = ['today', 'week', 'month'];

export default async function MyNumbersPage() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (userRow?.role === 'client') redirect('/portal');
  if (!userRow?.role) redirect('/login');

  const admin = getServerAdmin();

  // Only two days of this setter's sessions are needed for "today".
  const sinceSessions = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  const [settersRes, dispsRes, apptsRes, sessionsRes] = await Promise.all([
    admin.from('users').select('id, email, avatar_url').in('role', ['setter', 'owner']),
    admin.from('call_dispositions')
      .select('id, lead_id, disposition, disqual_reason, created_by, created_at, talk_time_seconds'),
    admin.from('appointments')
      .select('id, setter_id, setter, outcome, quality_rating, quality_reason, confirmed_at, appt_date, created_at'),
    admin.from('setter_sessions')
      .select('setter_id, state, started_at, ended_at, last_heartbeat_at')
      .eq('setter_id', user.id)
      .or(`ended_at.is.null,started_at.gte.${sinceSessions}`),
  ]);

  if (settersRes.error) throw settersRes.error;
  if (dispsRes.error) throw dispsRes.error;
  if (apptsRes.error) throw apptsRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  const setters = (settersRes.data ?? []) as SetterRow[];
  const disps = (dispsRes.data ?? []) as DispositionRow[];
  const appts = (apptsRes.data ?? []) as ApptRow[];
  const sessions = (sessionsRes.data ?? []) as SessionRow[];

  const meRow = setters.find((s) => s.id === user.id);
  const email = meRow?.email ?? user.email ?? 'you';

  const byRange = Object.fromEntries(
    RANGES.map((range) => {
      const output = computeSetterOutput(setters, disps, appts, range);
      const mine = output.find((s) => s.setterId === user.id) ?? null;
      return [
        range,
        {
          output: mine,
          rank: leaderboardRank(output, user.id),
          activity: computeSetterActivity(user.id, disps, range),
          funnel: meRow
            ? computeSetterFunnel(meRow, appts, disps, range)
            : null,
        },
      ];
    }),
  );

  const { start } = todayBoundsUTC();
  const dialerToday = computeDialerTotals(sessions, user.id, start, new Date());

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">My Numbers</h1>
        <p className="text-muted text-sm mt-1">
          Your own performance — activity, your booking funnel, and how you rank.
        </p>
      </header>

      <MyNumbersClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        byRange={byRange as any}
        displayName={displayName(email)}
        initials={initialsFromEmail(email)}
        avatarUrl={meRow?.avatar_url ?? null}
        dialerToday={dialerToday}
      />
    </div>
  );
}
