import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import type { LeadQueue, CallDisposition } from '@/lib/types';
import { SetterQueueClient } from './SetterQueueClient';

export const dynamic = 'force-dynamic';

const STALE_MS = 30 * 60 * 1000;

export default async function SetterPage() {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userRow?.role !== 'setter') redirect('/login');

  const admin = getServerAdmin();

  // Auto-release stale claims
  const staleAt = new Date(Date.now() - STALE_MS).toISOString();
  await admin
    .from('leads')
    .update({ queue_claimed_by: null, queue_claimed_at: null })
    .not('queue_claimed_by', 'is', null)
    .lt('queue_claimed_at', staleAt);

  // Load queue
  const { data: rawLeads, error } = await admin
    .from('leads')
    .select('*')
    .eq('consent', true)
    .neq('status', 'disqualified')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const typedLeads = (rawLeads ?? []) as unknown as LeadQueue[];

  // Load dispositions
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

  const uncalled = leads.filter((l) => l.status === 'new').length;
  const contacted = leads.filter((l) => l.status === 'contacted').length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Your call queue</h1>
        <p className="text-muted text-sm mt-0.5">
          Newest leads first. Claim one, dial, record the outcome.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {uncalled > 0 && (
            <span className="num px-2 py-1 rounded-full bg-amber/10 text-amber border border-amber/30">
              {uncalled} new
            </span>
          )}
          {contacted > 0 && (
            <span className="num px-2 py-1 rounded-full bg-hairline/40 text-ink">
              {contacted} in progress
            </span>
          )}
        </div>
      </header>

      <SetterQueueClient leads={leads} userId={user.id} />
    </div>
  );
}
