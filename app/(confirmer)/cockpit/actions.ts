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

export async function confirmAppointmentRich(
  appointmentId: string,
  decisionMakersPresent: boolean,
  strength: string,
) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();
  const now = new Date().toISOString();

  await admin
    .from('appointments')
    .update({
      confirmed_at: now,
      decision_makers_present: decisionMakersPresent,
      confirmation_strength: strength as never,
    })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'confirmed',
    actor_id: user.id,
    notes: `Strength: ${strength}. Decision-makers present: ${decisionMakersPresent ? 'yes' : 'no'}`,
  });

  // Also write to legacy confirmation_attempts
  await admin.from('confirmation_attempts').insert({
    appointment_id: appointmentId,
    method: 'confirmed',
    notes: `strength=${strength}, dm_present=${decisionMakersPresent}`,
    attempted_by: user.id,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.confirmed',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Appointment confirmed — strength: ${strength}, DMs present: ${decisionMakersPresent}`,
    metadata: { strength, decisionMakersPresent },
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
  rescheduleReason?: string,
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
    reschedule_reason: (rescheduleReason ?? null) as never,
    notes: notes ?? null,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.rescheduled',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Appointment rescheduled (${source}) from ${oldDate} to ${newDate}`,
    metadata: { old_appt_date: oldDate, new_appt_date: newDate, source, notes: notes ?? null, rescheduleReason: rescheduleReason ?? null },
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

export async function setCallback(appointmentId: string, callbackAt: string) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin
    .from('appointments')
    .update({ callback_at: callbackAt, callback_set_by: user.id })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'callback_set',
    actor_id: user.id,
    callback_at: callbackAt,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.callback_set',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Callback set for ${callbackAt}`,
    metadata: { callback_at: callbackAt },
  });

  revalidatePath('/cockpit');
}

export async function snoozeAppointment(appointmentId: string, snoozeUntil: string) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin
    .from('appointments')
    .update({ snooze_until: snoozeUntil })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'snoozed',
    actor_id: user.id,
    snooze_until: snoozeUntil,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.snoozed',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Appointment snoozed until ${snoozeUntil}`,
    metadata: { snooze_until: snoozeUntil },
  });

  revalidatePath('/cockpit');
}

export async function saveNote(appointmentId: string, notes: string) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin
    .from('appointments')
    .update({ notes })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'note',
    actor_id: user.id,
    notes,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.note',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: 'Note saved on appointment',
    metadata: { notes },
  });

  revalidatePath('/cockpit');
}

export async function sendTemplateText(
  appointmentId: string,
  templateName: string,
  templateBody: string,
) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  // DORMANT — log only, do NOT call any SMS provider
  console.log(`[sms] would send to appointment ${appointmentId}: ${templateBody}`);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'text_sent',
    actor_id: user.id,
    sms_template_name: templateName,
    notes: templateBody,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.text_sent',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Text logged (simulated) — template: ${templateName}`,
    metadata: { templateName, body: templateBody },
  });

  revalidatePath('/cockpit');
}

export async function flagToOwner(
  appointmentId: string,
  flagReason: string,
  flagNote?: string,
) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();
  const now = new Date().toISOString();

  await admin
    .from('appointments')
    .update({
      flagged: true,
      flagged_reason: flagNote ? `${flagReason}: ${flagNote}` : flagReason,
      flagged_by: user.id,
      flagged_at: now,
    })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'flagged',
    actor_id: user.id,
    flag_reason: flagNote ? `${flagReason}: ${flagNote}` : flagReason,
    notes: flagNote ?? null,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.flagged',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Appointment flagged to owner — reason: ${flagReason}`,
    metadata: { flagReason, flagNote: flagNote ?? null },
  });

  revalidatePath('/cockpit');
}

export async function logOutcome(
  appointmentId: string,
  outcome: 'sat' | 'no_show',
) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin
    .from('appointments')
    .update({ outcome: outcome as never })
    .eq('id', appointmentId);

  await admin.from('appointment_events').insert({
    appointment_id: appointmentId,
    event_type: 'outcome_logged',
    actor_id: user.id,
    notes: `Outcome: ${outcome}`,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.outcome_logged',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: `Appointment outcome logged: ${outcome}`,
    metadata: { outcome },
  });

  revalidatePath('/cockpit');
}

export async function clearFlag(appointmentId: string) {
  const { user, role } = await getConfirmerUser();
  const admin = getServerAdmin();

  await admin
    .from('appointments')
    .update({ flagged: false, flagged_reason: null, flagged_by: null, flagged_at: null })
    .eq('id', appointmentId);

  await writeAudit({
    actor_id: user.id,
    actor_role: role === 'owner' ? 'owner' : 'confirmer',
    action_type: 'appointment.flag_cleared',
    entity_type: 'appointment',
    entity_id: appointmentId,
    description: 'Flag cleared on appointment',
  });

  revalidatePath('/cockpit');
  revalidatePath('/today');
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
      callback_at, callback_set_by, snooze_until, notes, decision_makers_present,
      confirmation_strength, flagged, flagged_reason, flagged_at,
      leads ( name, phone, address ),
      clients ( company )
    `)
    .in('lead_id', leadIds)
    .in('outcome', ['booked', 'sat', 'sold', 'no_show', 'cancelled'])
    .order('appt_date', { ascending: false })
    .limit(10);

  if (!appts) return [];

  // Load events for search results
  const apptIds = appts.map((a: Record<string, unknown>) => a.id as string);
  let eventsMap = new Map<string, import('@/lib/types').AppointmentEvent[]>();
  if (apptIds.length > 0) {
    const { data: events } = await admin
      .from('appointment_events')
      .select('*')
      .in('appointment_id', apptIds)
      .order('created_at', { ascending: true });
    for (const ev of events ?? []) {
      const arr = eventsMap.get(ev.appointment_id as string) ?? [];
      arr.push(ev as import('@/lib/types').AppointmentEvent);
      eventsMap.set(ev.appointment_id as string, arr);
    }
  }

  return appts.map((a: Record<string, unknown>) => {
    const lead = a.leads as { name?: string | null; phone?: string | null; address?: string | null } | null;
    const client = a.clients as { company?: string | null } | null;
    const id = a.id as string;
    const evs = eventsMap.get(id) ?? [];
    return {
      id,
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
      events: evs,
      attempt_count: evs.filter((e) => e.event_type === 'attempt').length,
      last_attempt_at: evs.filter((e) => e.event_type === 'attempt').slice(-1)[0]?.created_at ?? null,
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
  });
}
