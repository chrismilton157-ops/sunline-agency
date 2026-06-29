import 'server-only';
import { getServerAdmin } from './supabase/admin';
import type { ConfirmerStats } from './types';

export type ConfirmerRow = {
  id: string;
  email: string;
};

// Load all confirmer user accounts.
export async function loadConfirmers(): Promise<ConfirmerRow[]> {
  const admin = getServerAdmin();
  const { data, error } = await admin
    .from('users')
    .select('id, email')
    .eq('role', 'confirmer')
    .order('email');
  if (error) throw error;
  return (data ?? []) as ConfirmerRow[];
}

// Compute performance stats for one or all confirmers.
// All reads are via the service-role admin client — agency-only data.
export async function computeConfirmerStats(
  sinceIso?: string,  // ISO string — if omitted, all time
): Promise<ConfirmerStats[]> {
  const admin = getServerAdmin();
  const since = sinceIso ?? new Date(0).toISOString();

  const [confirmersRes, eventsRes, apptsRes] = await Promise.all([
    admin.from('users').select('id, email').eq('role', 'confirmer'),
    admin
      .from('appointment_events')
      .select('*')
      .gte('created_at', since),
    admin
      .from('appointments')
      .select('id, outcome, confirmed_at, appt_date')
      .in('outcome', ['booked', 'sat', 'sold', 'no_show', 'cancelled']),
  ]);

  if (confirmersRes.error) throw confirmersRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (apptsRes.error) throw apptsRes.error;

  const allEvents = eventsRes.data ?? [];
  const allAppts = apptsRes.data ?? [];

  // Build appointment lookup
  const apptById = new Map(allAppts.map((a) => [a.id as string, a]));

  return (confirmersRes.data ?? []).map((u) => {
    const uid = u.id as string;
    const myEvents = allEvents.filter((e) => e.actor_id === uid);

    // Events by type
    const confirmed = myEvents.filter((e) => e.event_type === 'confirmed');
    const rescheduled = myEvents.filter((e) => e.event_type === 'rescheduled');
    const cancelled = myEvents.filter((e) => e.event_type === 'cancelled');
    const inbound = myEvents.filter((e) => e.event_type === 'inbound_call');

    // Confirmed appointment IDs
    const confirmedApptIds = new Set(confirmed.map((e) => e.appointment_id as string));

    // Show-rate: of appointments this confirmer confirmed, how many actually sat/sold?
    const confirmedAppts = [...confirmedApptIds]
      .map((id) => apptById.get(id))
      .filter(Boolean);
    const sittedConfirmed = confirmedAppts.filter(
      (a) => a!.outcome === 'sat' || a!.outcome === 'sold',
    ).length;
    const show_rate =
      confirmedAppts.length > 0
        ? Math.round((sittedConfirmed / confirmedAppts.length) * 100)
        : null;

    // Confirmation rate: of appointments that were due (past their date),
    // how many were confirmed by this confirmer?
    // We use all past-dated booked/sat/sold/no_show/cancelled appointments
    // that this confirmer touched (confirmed event).
    // A fair denominator: appointments that WERE booked and are now past.
    const pastAppts = allAppts.filter((a) => {
      const d = new Date(a.appt_date as string).getTime();
      return d < Date.now();
    });
    const pastApptIds = new Set(pastAppts.map((a) => a.id as string));
    const myConfirmedPast = confirmed.filter((e) =>
      pastApptIds.has(e.appointment_id as string),
    ).length;
    const confirmation_rate =
      pastAppts.length > 0
        ? Math.round((myConfirmedPast / pastAppts.length) * 100)
        : null;

    // Save rate: when a homeowner wanted to cancel (inbound_outcome='rescheduled'
    // OR a rescheduled event following a cancellation-intent inbound call),
    // how often did the confirmer convert it to a reschedule instead of a cancel?
    // Proxy: inbound calls marked 'rescheduled' vs 'cancelled' for this confirmer.
    const inboundWithOutcome = inbound.filter(
      (e) => e.inbound_outcome === 'rescheduled' || e.inbound_outcome === 'cancelled',
    );
    const saved = inboundWithOutcome.filter(
      (e) => e.inbound_outcome === 'rescheduled',
    ).length;
    const save_rate =
      inboundWithOutcome.length > 0
        ? Math.round((saved / inboundWithOutcome.length) * 100)
        : null;

    // Cancellation reason breakdown
    const cancellation_reasons: Record<string, number> = {};
    for (const e of cancelled) {
      const r = (e.cancellation_reason as string) ?? 'other';
      cancellation_reasons[r] = (cancellation_reasons[r] ?? 0) + 1;
    }

    return {
      confirmer_id: uid,
      confirmer_email: u.email as string,
      confirmation_rate,
      show_rate,
      save_rate,
      reschedules: rescheduled.length,
      cancellations: cancelled.length,
      inbound_calls: inbound.length,
      confirmed_count: confirmed.length,
      cancellation_reasons,
    } satisfies ConfirmerStats;
  });
}
