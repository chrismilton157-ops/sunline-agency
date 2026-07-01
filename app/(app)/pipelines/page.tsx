import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Pipelines' };

import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { computePipeline, PIPELINE_LABEL } from '@/lib/setter-cadence';
import type { Pipeline } from '@/lib/types';
import { PipelinesClient } from './PipelinesClient';

export const dynamic = 'force-dynamic';

type PipelineRow = {
  pipeline: Pipeline;
  total: number;
  servable: number;
  callback_count: number;
};

type ActiveSetter = {
  setter_id: string;
  setter_email: string;
  lead_id: string;
  lead_name: string | null;
  lead_pipeline: Pipeline;
  no_answer_count: number;
  claimed_at: string;
  pipeline_pref: Pipeline | null;
};

type SetterPref = {
  id: string;
  email: string;
  queue_pipeline_pref: Pipeline | null;
};

export default async function PipelinesPage() {
  const { user, role } = await requireOwner();
  if (!user) redirect('/login');
  if (role !== 'owner') redirect('/queue');

  const admin = getServerAdmin();
  const now = new Date();

  // Load all servable leads for pipeline counts
  const { data: rawLeads } = await admin
    .from('leads')
    .select('id, created_at, no_answer_count, next_available_at, daily_attempts, daily_attempts_date, queue_claimed_by, callback_setter_id, callback_at')
    .eq('consent', true)
    .not('status', 'in', '("booked","disqualified")')
    .order('created_at', { ascending: false });

  const leads = (rawLeads ?? []) as Array<{
    id: string;
    created_at: string;
    no_answer_count: number;
    next_available_at: string | null;
    daily_attempts: number;
    daily_attempts_date: string | null;
    queue_claimed_by: string | null;
    callback_setter_id: string | null;
    callback_at: string | null;
  }>;

  // Today UK date
  const todayUK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now);

  // Compute pipeline stats
  const pipelineMap: Record<Pipeline, { total: number; servable: number; callback_count: number }> = {
    1: { total: 0, servable: 0, callback_count: 0 },
    2: { total: 0, servable: 0, callback_count: 0 },
    3: { total: 0, servable: 0, callback_count: 0 },
  };

  for (const lead of leads) {
    const p = computePipeline(new Date(lead.created_at), lead.no_answer_count);
    pipelineMap[p].total += 1;
    if (lead.callback_setter_id) {
      pipelineMap[p].callback_count += 1;
    }
    // Servable: not locked, not in gap, daily cap not hit, not a pending personal callback
    const notInGap = !lead.next_available_at || new Date(lead.next_available_at) <= now;
    const dailyDate = lead.daily_attempts_date;
    const underCap = !dailyDate || dailyDate < todayUK || lead.daily_attempts < 4;
    const notLocked = !lead.queue_claimed_by;
    const notPersonalCallback = !lead.callback_setter_id;
    if (notInGap && underCap && notLocked && notPersonalCallback) {
      pipelineMap[p].servable += 1;
    }
  }

  const pipelines: PipelineRow[] = ([1, 2, 3] as Pipeline[]).map((p) => ({
    pipeline: p,
    ...pipelineMap[p],
  }));

  // Active setters (non-stale claims in the last 30 min)
  const staleAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const activeClaims = leads.filter(
    (l) => l.queue_claimed_by && (!l.next_available_at || new Date(l.next_available_at) <= now),
  );

  // Load setter emails
  const { data: setterRows } = await admin
    .from('users')
    .select('id, email, queue_pipeline_pref')
    .in('role', ['setter', 'owner']);

  const setterMap = new Map(
    (setterRows ?? []).map((s: { id: string; email: string; queue_pipeline_pref: Pipeline | null }) => [
      s.id,
      s,
    ]),
  );

  // Get active-lead details
  const activeLeadMap = new Map(leads.map((l) => [l.id, l]));
  const { data: rawActiveClaims } = await admin
    .from('leads')
    .select('id, name, no_answer_count, created_at, queue_claimed_by, queue_claimed_at')
    .eq('consent', true)
    .not('status', 'in', '("booked","disqualified")')
    .not('queue_claimed_by', 'is', null)
    .gt('queue_claimed_at', staleAt);

  const activeSetters: ActiveSetter[] = (rawActiveClaims ?? [])
    .map((l: { id: string; name: string | null; no_answer_count: number; created_at: string; queue_claimed_by: string; queue_claimed_at: string }) => {
      const setter = setterMap.get(l.queue_claimed_by);
      if (!setter) return null;
      return {
        setter_id: l.queue_claimed_by,
        setter_email: setter.email,
        lead_id: l.id,
        lead_name: l.name,
        lead_pipeline: computePipeline(new Date(l.created_at), l.no_answer_count),
        no_answer_count: l.no_answer_count,
        claimed_at: l.queue_claimed_at,
        pipeline_pref: setter.queue_pipeline_pref as Pipeline | null,
      };
    })
    .filter(Boolean) as ActiveSetter[];

  // All setter pipeline prefs
  const setterPrefs: SetterPref[] = (setterRows ?? [])
    .filter((s: { id: string; email: string; queue_pipeline_pref: Pipeline | null }) =>
      s.id !== user.id)
    .map((s: { id: string; email: string; queue_pipeline_pref: Pipeline | null }) => ({
      id: s.id,
      email: s.email,
      queue_pipeline_pref: s.queue_pipeline_pref as Pipeline | null,
    }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Pipelines</h1>
        <p className="text-muted text-sm mt-1">
          Three pools of leads. System auto-serves setters freshest-first. P1 is speed-to-lead.
        </p>
      </header>

      <PipelinesClient
        pipelines={pipelines}
        activeSetters={activeSetters}
        setterPrefs={setterPrefs}
      />
    </div>
  );
}
