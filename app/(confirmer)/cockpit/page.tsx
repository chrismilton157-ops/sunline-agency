import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Cockpit — Sunline' };

import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { computeConfirmerStats } from '@/lib/confirmer-metrics';
import type { CockpitAppointment, AppointmentEvent } from '@/lib/types';
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

  const admin = getServerAdmin();
  const now = new Date().toISOString();

  // Load upcoming booked appointments — soonest first.
  const { data: rawAppts, error } = await admin
    .from('appointments')
    .select(`
      id, client_id, lead_id, appt_date, setter, outcome, confirmed_at,
      leads ( name, phone, address ),
      clients ( company )
    `)
    .eq('outcome', 'booked')
    .gt('appt_date', now)
    .order('appt_date', { ascending: true })
    .limit(50);

  if (error) throw error;

  const apptIds = (rawAppts ?? []).map((a: Record<string, unknown>) => a.id as string);

  // Load appointment_events for queue appointments
  let eventsMap = new Map<string, AppointmentEvent[]>();
  let attemptCountMap = new Map<string, number>();
  let lastAttemptMap = new Map<string, string>();

  if (apptIds.length > 0) {
    const { data: events } = await admin
      .from('appointment_events')
      .select('*')
      .in('appointment_id', apptIds)
      .order('created_at', { ascending: true });

    for (const ev of events ?? []) {
      const arr = eventsMap.get(ev.appointment_id) ?? [];
      arr.push(ev as AppointmentEvent);
      eventsMap.set(ev.appointment_id, arr);
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

  const appointments: CockpitAppointment[] = (rawAppts ?? []).map(
    (a: Record<string, unknown>) => {
      const lead = a.leads as { name?: string | null; phone?: string | null; address?: string | null } | null;
      const client = a.clients as { company?: string | null } | null;
      const id = a.id as string;
      const evs = eventsMap.get(id) ?? [];
      // Count attempts from events + legacy
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
      };
    },
  );

  // Load this confirmer's own stats (or all confirmers if owner)
  let myStats = null;
  try {
    const allStats = await computeConfirmerStats();
    myStats = allStats.find((s) => s.confirmer_id === user.id) ?? null;
    if (role === 'owner' && !myStats && allStats.length > 0) {
      // Owner viewing cockpit: show aggregate would be confusing, skip
      myStats = null;
    }
  } catch {
    // Stats are non-critical — cockpit still works without them
  }

  return (
    <CockpitClient
      appointments={appointments}
      currentUserId={user.id}
      stats={myStats}
    />
  );
}
