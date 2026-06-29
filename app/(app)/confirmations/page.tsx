import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Confirmations' };

import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import type { ConfirmationAppointment, ConfirmationAttempt } from '@/lib/types';
import { ConfirmationsClient } from './ConfirmationsClient';

export const dynamic = 'force-dynamic';

export default async function ConfirmationsPage() {
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

  // Load upcoming booked appointments, soonest first.
  // Join leads (name, phone, address) and clients (company name).
  const now = new Date().toISOString();

  const { data: rawAppts, error } = await admin
    .from('appointments')
    .select(`
      id, client_id, lead_id, appt_date, setter, outcome, confirmed_at,
      leads ( name, phone, address ),
      clients ( company )
    `)
    .eq('outcome', 'booked')
    .gt('appt_date', now)
    .order('appt_date', { ascending: true });

  if (error) throw error;

  const apptIds = (rawAppts ?? []).map((a: Record<string, unknown>) => a.id as string);

  // Load confirmation attempts for these appointments
  let attemptsMap = new Map<string, ConfirmationAttempt[]>();
  if (apptIds.length > 0) {
    const { data: attempts } = await admin
      .from('confirmation_attempts')
      .select('id, appointment_id, method, notes, attempted_by, created_at')
      .in('appointment_id', apptIds)
      .order('created_at', { ascending: true });
    for (const a of attempts ?? []) {
      const arr = attemptsMap.get(a.appointment_id) ?? [];
      arr.push(a as ConfirmationAttempt);
      attemptsMap.set(a.appointment_id, arr);
    }
  }

  const appointments: ConfirmationAppointment[] = (rawAppts ?? []).map((a: Record<string, unknown>) => {
    const lead = a.leads as { name?: string | null; phone?: string | null; address?: string | null } | null;
    const client = a.clients as { company?: string | null } | null;
    return {
      id: a.id as string,
      client_id: a.client_id as string,
      lead_id: a.lead_id as string,
      appt_date: a.appt_date as string,
      setter: (a.setter as string | null) ?? null,
      outcome: a.outcome as ConfirmationAppointment['outcome'],
      confirmed_at: (a.confirmed_at as string | null) ?? null,
      lead_name: lead?.name ?? null,
      lead_phone: lead?.phone ?? null,
      lead_address: lead?.address ?? null,
      client_company: client?.company ?? 'Unknown client',
      attempts: attemptsMap.get(a.id as string) ?? [],
    };
  });

  const needsConfirmingCount = appointments.filter((a) => {
    if (a.confirmed_at) return false;
    const diff = new Date(a.appt_date).getTime() - Date.now();
    return diff <= 48 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Confirmations
        </h1>
        <p className="text-muted text-sm mt-1">
          Upcoming booked appointments, soonest first. Call to confirm ~48h before — it lifts show-rate.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="num px-2 py-1 rounded-md bg-hairline/40 text-ink">
            {appointments.length} upcoming
          </span>
          {needsConfirmingCount > 0 && (
            <span className="num px-2 py-1 rounded-md bg-amber/10 text-amber border border-amber/30 font-semibold">
              {needsConfirmingCount} need confirming now
            </span>
          )}
        </div>
      </header>

      <ConfirmationsClient appointments={appointments} />
    </div>
  );
}
