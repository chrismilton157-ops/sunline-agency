import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { computeSetterOutput, initialsFromEmail } from '@/lib/setter-metrics';
import type { SetterRow, DispositionRow, ApptRow } from '@/lib/setter-metrics';
import { LeaderboardClient } from './LeaderboardClient';

export const dynamic = 'force-dynamic';

export default async function LeaderboardPage() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (userRow?.role === 'client') redirect('/portal');
  if (!userRow?.role) redirect('/login');

  const admin = getServerAdmin();

  // All setter + owner accounts appear on the leaderboard
  const [settersRes, dispsRes, apptsRes] = await Promise.all([
    admin.from('users').select('id, email, avatar_url').in('role', ['setter', 'owner']),
    admin.from('call_dispositions')
      .select('id, lead_id, disposition, disqual_reason, created_by, created_at'),
    admin.from('appointments')
      .select('id, setter_id, setter, outcome, quality_rating, quality_reason, confirmed_at, appt_date'),
  ]);

  if (settersRes.error) throw settersRes.error;
  if (dispsRes.error) throw dispsRes.error;
  if (apptsRes.error) throw apptsRes.error;

  const setters = (settersRes.data ?? []) as SetterRow[];
  const disps = (dispsRes.data ?? []) as DispositionRow[];
  const appts = (apptsRes.data ?? []) as ApptRow[];

  const byRange = {
    today: computeSetterOutput(setters, disps, appts, 'today'),
    week: computeSetterOutput(setters, disps, appts, 'week'),
    month: computeSetterOutput(setters, disps, appts, 'month'),
  };

  const myRow = setters.find((s) => s.id === user.id);
  const myInitials = myRow ? initialsFromEmail(myRow.email) : '??';
  const myAvatarUrl = myRow?.avatar_url ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Leaderboard
        </h1>
        <p className="text-muted text-sm mt-1">
          Your stats and how you rank against the team.
        </p>
      </header>

      <LeaderboardClient
        byRange={byRange}
        myId={user.id}
        myInitials={myInitials}
        myAvatarUrl={myAvatarUrl}
      />
    </div>
  );
}
