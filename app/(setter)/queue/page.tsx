import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import type { LeadQueue, CallDisposition } from '@/lib/types';
import { QueueClient } from './QueueClient';
import { TourManager } from '@/components/onboarding/TourManager';

import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Call queue' };

export const dynamic = 'force-dynamic';

const STALE_MS = 30 * 60 * 1_000;

export default async function QueuePage() {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users')
    .select('role, queue_pipeline_pref')
    .eq('id', user.id)
    .single();
  if (userRow?.role === 'client') redirect('/portal');
  if (!userRow?.role) redirect('/login');

  const admin = getServerAdmin();

  // Auto-release stale claims before loading queue
  const staleAt = new Date(Date.now() - STALE_MS).toISOString();
  await admin
    .from('leads')
    .update({ queue_claimed_by: null, queue_claimed_at: null })
    .not('queue_claimed_by', 'is', null)
    .lt('queue_claimed_at', staleAt);

  // Load queue: consented leads that aren't disqualified, newest first.
  const { data: rawLeads, error } = await admin
    .from('leads')
    .select('*')
    .eq('consent', true)
    .neq('status', 'disqualified')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const typedLeads = (rawLeads ?? []) as unknown as LeadQueue[];

  // Load dispositions for these leads
  const leadIds = typedLeads.map((l) => l.id);
  const dispositionsMap = new Map<string, CallDisposition[]>();
  if (leadIds.length > 0) {
    const { data: disps } = await admin
      .from('call_dispositions')
      .select('id, lead_id, disposition, callback_at, disqual_reason, notes, created_by, created_at')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: true });
    for (const d of disps ?? []) {
      const arr = dispositionsMap.get(d.lead_id) ?? [];
      arr.push(d as CallDisposition);
      dispositionsMap.set(d.lead_id, arr);
    }
  }

  const leads: LeadQueue[] = typedLeads.map((l) => ({
    ...l,
    dispositions: dispositionsMap.get(l.id) ?? [],
  }));

  const pipelinePref = (userRow?.queue_pipeline_pref as 1 | 2 | 3 | null) ?? null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Call queue
        </h1>
        <p className="text-muted text-sm mt-1">
          Leads are served to you automatically — finish one, the next appears right away.
        </p>
      </header>

      <QueueClient
        leads={leads}
        userId={user.id}
        initialPipelinePref={pipelinePref}
      />
      <TourManager role="setter" userId={user.id} />
    </div>
  );
}
