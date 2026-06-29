'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import type { CancellationReasonValue } from '@/lib/confirmer-config';

async function getConfirmerUser() {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (row?.role !== 'confirmer' && row?.role !== 'owner') {
    throw new Error('Confirmer or owner access required');
  }
  return { user, role: row.role as string };
}

export async function confirmAppointment(appointmentId: string) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();
  const now = new Date().toISOString();

  await admin
    .from('appointments')
    .update({ confirmed_at: now })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'confirmed',
    actor_id: user.id,
  });

  // Also write to legacy confirmation_attempts for owner confirmations view
  await admin.from('confirmation_attempts').insert({
    appointment_id: appointmentId,
    method: 'confirmed',
    notes: null,
    attempted_by: user.id,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.confirmed',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: 'Appointment confirmed with homeowner',
  });

  revalidatePath('/cockpit');
}

export async function logAttempt(
  appointmentId: string,
  method: string,
  notes?: string,
) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'attempt',
    actor_id: user.id,
    attempt_method: method,
    notes: notes ?? null,
  });

  // Also write to legacy confirmation_attempts
  await admin.from('confirmation_attempts').insert({
    appointment_id: appointmentId,
    method,
    notes: notes ?? null,
    attempted_by: user.id,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.attempt',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Confirmation attempt logged: ${method}`,
    metadata: { method, notes: notes ?? null },
  });

  revalidatePath('/cockpit');
}

export async function rescheduleAppointment(
  appointmentId: string,
  oldDate: string,
  newDate: string,
  source: 'inbound' | 'outbound',
  notes?: string,
) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin
    .from('appointments')
    .update({ appt_date: newDate, confirmed_at: null })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'rescheduled',
    actor_id: user.id,
    old_appt_date: oldDate,
    new_appt_date: newDate,
    reschedule_source: source,
    notes: notes ?? null,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.rescheduled',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Appointment rescheduled (${source}) from ${oldDate} to ${newDate}`,
    metadata: { old_appt_date: oldDate, new_appt_date: newDate, source, notes: notes ?? null },
  });

  revalidatePath('/cockpit');
}

export async function cancelAppointment(
  appointmentId: string,
  reason: CancellationReasonValue,
  note?: string,
) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin
    .from('appointments')
    .update({ outcome: 'cancelled' as never })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'cancelled',
    actor_id: user.id,
    cancellation_reason: reason,
    cancellation_note: note ?? null,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.cancelled',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Appointment cancelled: ${reason}`,
    metadata: { reason, note: note ?? null },
  });

  revalidatePath('/cockpit');
}

export async function logInboundCall(
  appointmentId: string,
  outcome: 'rescheduled' | 'cancelled' | 'no_change',
  notes?: string,
) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'inbound_call',
    actor_id: user.id,
    inbound_outcome: outcome,
    notes: notes ?? null,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.inbound_call',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Inbound call handled — outcome: ${outcome}`,
    metadata: { outcome, notes: notes ?? null },
  });

  revalidatePath('/cockpit');
}

export async function searchAppointments(query: string) {
  const { user } = await getConfirmerUser();
  void user;
  const admin = getServerAdmin();

  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Search leads by name or phone, then get their upcoming/recent appointments
  const { data: leads } = await admin
    .from('leads')
    .select('id, name, phone, address')
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(20);

  if (!leads || leads.length === 0) return [];

  const leadIds = leads.map((l) => l.id as string);
  const { data: appts } = await admin
    .from('appointments')
    .select(`
      id, client_id, lead_id, appt_date, setter, outcome, confirmed_at,
      leads ( name, phone, address ),
      clients ( company )
    `)
    .in('lead_id', leadIds)
    .in('outcome', ['booked', 'sat', 'sold', 'no_show', 'cancelled'])
    .order('appt_date', { ascending: false })
    .limit(10);

  if (!appts) return [];

  return appts.map((a: Record<string, unknown>) => {
    const lead = a.leads as { name?: string | null; phone?: string | null; address?: string | null } | null;
    const client = a.clients as { company?: string | null } | null;
    return {
      id: a.id as string,
      lead_id: a.lead_id as string,
      client_id: a.client_id as string,
      appt_date: a.appt_date as string,
      setter: (a.setter as string | null) ?? null,
      outcome: a.outcome as string,
      confirmed_at: (a.confirmed_at as string | null) ?? null,
      lead_name: lead?.name ?? null,
      lead_phone: lead?.phone ?? null,
      lead_address: lead?.address ?? null,
      client_company: client?.company ?? 'Unknown client',
      events: [],
      attempt_count: 0,
      last_attempt_at: null,
    };
  });
}
