import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Cockpit — Sunline' };

import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { computeConfirmerStats } from '@/lib/confirmer-metrics';
import type { CockpitAppointment, AppointmentEvent, SmsTemplate, ConfirmerStatsRich } from '@/lib/types';
import { CockpitClient } from './CockpitClient';

export const dynamic = 'force-dynamic';

export default async function CockpitPage() {
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

  const role = userRow?.role;
  if (role !== 'confirmer' && role !== 'owner') redirect('/login');

  const isOwner = role === 'owner';
  const admin = getServerAdmin();
  const now = new Date();
  const nowIso = now.toISOString();
  // Callbacks appearing soon (within next 1h)
  const callbackWindowIso = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  // Load upcoming booked appointments + flagged + callbacks due
  const { data: rawAppts, error } = await admin
    .from('appointments')
    .select(`
      id, client_id, lead_id, appt_date, setter, outcome, confirmed_at,
      callback_at, callback_set_by, snooze_until, notes, decision_makers_present,
      confirmation_strength, flagged, flagged_reason, flagged_at,
      leads ( name, phone, address ),
      clients ( company )
    `)
    .or(`outcome.eq.booked,and(flagged.eq.true,outcome.neq.cancelled)`)
    .gt('appt_date', nowIso)
    .order('appt_date', { ascending: true })
    .limit(80);

  if (error) throw error;

  // Also load appointments with callbacks due soon (may overlap with above)
  const { data: callbackAppts } = await admin
    .from('appointments')
    .select(`
      id, client_id, lead_id, appt_date, setter, outcome, confirmed_at,
      callback_at, callback_set_by, snooze_until, notes, decision_makers_present,
      confirmation_strength, flagged, flagged_reason, flagged_at,
      leads ( name, phone, address ),
      clients ( company )
    `)
    .not('callback_at', 'is', null)
    .lte('callback_at', callbackWindowIso)
    .limit(20);

  // Merge, deduplicate by id
  const seen = new Set<string>();
  const allRaw: Record<string, unknown>[] = [];
  for (const a of [...(rawAppts ?? []), ...(callbackAppts ?? [])]) {
    const id = (a as Record<string, unknown>).id as string;
    if (!seen.has(id)) {
      seen.add(id);
      allRaw.push(a as Record<string, unknown>);
    }
  }

  const apptIds = allRaw.map((a) => a.id as string);

  // Load appointment_events for queue appointments
  const eventsMap = new Map<string, AppointmentEvent[]>();
  const attemptCountMap = new Map<string, number>();
  const lastAttemptMap = new Map<string, string>();

  if (apptIds.length > 0) {
    const { data: events } = await admin
      .from('appointment_events')
      .select('*')
      .in('appointment_id', apptIds)
      .order('created_at', { ascending: true });

    for (const ev of events ?? []) {
      const arr = eventsMap.get(ev.appointment_id as string) ?? [];
      arr.push(ev as AppointmentEvent);
      eventsMap.set(ev.appointment_id as string, arr);
    }

    // Also pull legacy confirmation_attempts for attempt counts
    const { data: attempts } = await admin
      .from('confirmation_attempts')
      .select('appointment_id, created_at')
      .in('appointment_id', apptIds)
      .order('created_at', { ascending: false });

    for (const att of attempts ?? []) {
      const id = att.appointment_id as string;
      attemptCountMap.set(id, (attemptCountMap.get(id) ?? 0) + 1);
      if (!lastAttemptMap.has(id)) {
        lastAttemptMap.set(id, att.created_at as string);
      }
    }
  }

  function mapAppt(a: Record<string, unknown>): CockpitAppointment {
    const lead = a.leads as { name?: string | null; phone?: string | null; address?: string | null } | null;
    const client = a.clients as { company?: string | null } | null;
    const id = a.id as string;
    const evs = eventsMap.get(id) ?? [];
    const evtAttempts = evs.filter((e) => e.event_type === 'attempt').length;
    const legacyCount = attemptCountMap.get(id) ?? 0;
    const totalAttempts = Math.max(evtAttempts, legacyCount);
    return {
      id,
      client_id: a.client_id as string,
      lead_id: a.lead_id as string,
      appt_date: a.appt_date as string,
      setter: (a.setter as string | null) ?? null,
      outcome: a.outcome as string,
      confirmed_at: (a.confirmed_at as string | null) ?? null,
      lead_name: lead?.name ?? null,
      lead_phone: lead?.phone ?? null,
      lead_address: lead?.address ?? null,
      client_company: client?.company ?? 'Unknown client',
      events: evs,
      attempt_count: totalAttempts,
      last_attempt_at: lastAttemptMap.get(id) ?? null,
      callback_at: (a.callback_at as string | null) ?? null,
      callback_set_by: (a.callback_set_by as string | null) ?? null,
      snooze_until: (a.snooze_until as string | null) ?? null,
      notes: (a.notes as string | null) ?? null,
      decision_makers_present: (a.decision_makers_present as boolean | null) ?? null,
      confirmation_strength: (a.confirmation_strength as string | null) ?? null,
      flagged: (a.flagged as boolean) ?? false,
      flagged_reason: (a.flagged_reason as string | null) ?? null,
      flagged_at: (a.flagged_at as string | null) ?? null,
    };
  }

  const appointments: CockpitAppointment[] = allRaw.map(mapAppt);

  // Load SMS templates
  const { data: rawTemplates } = await admin
    .from('sms_templates')
    .select('id, name, body')
    .order('name');
  const smsTemplates: SmsTemplate[] = (rawTemplates ?? []) as SmsTemplate[];

  // Load confirmer stats
  let myStats: ConfirmerStatsRich | null = null;
  let allConfirmerStats: ConfirmerStatsRich[] = [];
  try {
    const allStats = await computeConfirmerStats();
    myStats = allStats.find((s) => s.confirmer_id === user.id) ?? null;
    if (isOwner) {
      allConfirmerStats = allStats;
    }
  } catch {
    // Stats are non-critical — cockpit still works without them
  }

  return (
    <CockpitClient
      appointments={appointments}
      smsTemplates={smsTemplates}
      myStats={myStats}
      allConfirmerStats={allConfirmerStats}
      currentUserId={user.id}
      isOwner={isOwner}
    />
  );
}
