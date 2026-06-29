import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Confirmations' };

import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import type { ConfirmationAppointment, ConfirmationAttempt } from '@/lib/types';
import { ConfirmationsClient } from './ConfirmationsClient';
import { computeConfirmerStats } from '@/lib/confirmer-metrics';
import { CANCELLATION_REASONS } from '@/lib/confirmer-config';

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

  // Load confirmer performance stats
  let confirmerStats: Awaited<ReturnType<typeof computeConfirmerStats>> = [];
  try {
    confirmerStats = await computeConfirmerStats();
  } catch {
    // Non-critical — page works without stats
  }

  const reasonLabel = (v: string) =>
    CANCELLATION_REASONS.find((r) => r.value === v)?.label ?? v;

  return (
    <div className="space-y-8">
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

      {/* Confirmer performance */}
      {confirmerStats.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-ink">Confirmer performance</h2>
          <div className="space-y-4">
            {confirmerStats.map((s) => (
              <div key={s.confirmer_id} className="rounded-xl border border-hairline bg-white p-5 space-y-4">
                <div className="font-medium text-ink text-sm">{s.confirmer_email}</div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Show-rate', value: s.show_rate !== null ? `${s.show_rate}%` : '—', sub: 'confirmed → sat' },
                    { label: 'Save rate', value: s.save_rate !== null ? `${s.save_rate}%` : '—', sub: 'would-be cancels saved' },
                    { label: 'Confirmed', value: String(s.confirmed_count), sub: s.confirmation_rate !== null ? `${s.confirmation_rate}% rate` : undefined },
                    { label: 'Inbound calls', value: String(s.inbound_calls), sub: `${s.reschedules} rescheduled` },
                  ].map((c) => (
                    <div key={c.label} className="rounded-lg border border-hairline bg-hairline/10 px-3 py-2.5 text-center">
                      <div className="num text-xl font-bold text-ink">{c.value}</div>
                      <div className="text-xs font-medium text-ink mt-0.5">{c.label}</div>
                      {c.sub && <div className="text-xs text-muted">{c.sub}</div>}
                    </div>
                  ))}
                </div>

                {s.cancellations > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted mb-1.5">
                      Cancellation reasons ({s.cancellations} total)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(s.cancellation_reasons).map(([r, count]) => (
                        <span key={r} className="px-2 py-0.5 rounded-full text-xs bg-hairline/30 border border-hairline text-ink">
                          {reasonLabel(r)}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
