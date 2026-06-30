import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import type { LeadQueue, CallDisposition } from '@/lib/types';
import { QueueClient } from './QueueClient';
import { TourManager } from '@/components/onboarding/TourManager';

import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Call queue' };

export const dynamic = 'force-dynamic';

const STALE_MS = 30 * 60 * 1000;

export default async function QueuePage() {
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
  // Cast via unknown to LeadQueue[] — the admin client is untyped (no DB
  // codegen), so TypeScript sees a union that includes GenericStringError
  // when the select string is built at runtime.
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
  let dispositionsMap = new Map<string, CallDisposition[]>();
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

  const totalConsented = leads.length;
  const uncalled = leads.filter((l) => l.status === 'new').length;
  const contacted = leads.filter((l) => l.status === 'contacted').length;
  const booked = leads.filter((l) => l.status === 'booked').length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Call queue
        </h1>
        <p className="text-muted text-sm mt-1">
          Newest leads first. Claim a lead, dial, then record the outcome.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="num px-2 py-1 rounded-md bg-hairline/40 text-ink">
            {totalConsented} with consent
          </span>
          {uncalled > 0 && (
            <span className="num px-2 py-1 rounded-md bg-amber/10 text-amber border border-amber/30">
              {uncalled} uncalled
            </span>
          )}
          {contacted > 0 && (
            <span className="num px-2 py-1 rounded-md bg-hairline/40 text-ink border border-hairline">
              {contacted} contacted
            </span>
          )}
          {booked > 0 && (
            <span className="num px-2 py-1 rounded-md bg-good/10 text-good border border-good/30">
              {booked} booked
            </span>
          )}
        </div>
      </header>

      <QueueClient leads={leads} userId={user.id} />
      <TourManager role="setter" userId={user.id} />
    </div>
  );
}
