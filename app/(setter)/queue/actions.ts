'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

// Stale claim threshold: 30 minutes
const STALE_MS = 30 * 60 * 1000;

async function getStaffUser() {
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
  if (row?.role === 'client') throw new Error('Client accounts cannot access the calling queue');
  return { user, supabase };
}

export async function claimLead(leadId: string) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
  const now = new Date().toISOString();

  // Claim only if: unclaimed, or stale claim, or already claimed by this user
  await admin
    .from('leads')
    .update({ queue_claimed_by: user.id, queue_claimed_at: now })
    .eq('id', leadId)
    .or(
      `queue_claimed_by.is.null,queue_claimed_at.lt.${staleThreshold},queue_claimed_by.eq.${user.id}`,
    );

  // Record first-ever claim permanently (only writes if not already set)
  const { data: wasClaimed } = await admin
    .from('leads')
    .select('first_claimed_at')
    .eq('id', leadId)
    .single();

  await admin
    .from('leads')
    .update({ first_claimed_by: user.id, first_claimed_at: now })
    .eq('id', leadId)
    .is('first_claimed_at', null);

  if (!wasClaimed?.first_claimed_at) {
    await writeAudit({
      actor_id: user.id,
      actor_role: 'setter',
      action_type: 'lead.claimed',
      entity_type: 'lead',
      entity_id: leadId,
      description: `Lead first claimed by setter (${user.email ?? user.id})`,
      metadata: { setter_id: user.id, claimed_at: now },
    });
  }

  revalidatePath('/queue');
}

export async function releaseLead(leadId: string) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();

  await admin
    .from('leads')
    .update({ queue_claimed_by: null, queue_claimed_at: null })
    .eq('id', leadId)
    .eq('queue_claimed_by', user.id);

  revalidatePath('/queue');
}

export async function submitDisposition(formData: FormData) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();

  const leadId = formData.get('lead_id') as string;
  const disposition = formData.get('disposition') as string;
  const callbackAt = (formData.get('callback_at') as string) || null;
  const disqualReason = (formData.get('disqual_reason') as string) || null;
  const notes = (formData.get('notes') as string) || null;

  if (!leadId || !disposition) throw new Error('Missing required fields');

  // 1) Record the disposition
  const { error: dispErr } = await admin.from('call_dispositions').insert({
    lead_id: leadId,
    disposition,
    callback_at: callbackAt,
    disqual_reason: disqualReason,
    notes,
    created_by: user.id,
  });
  if (dispErr) throw dispErr;

  // 2) Update lead: release claim + update status + increment no_answer_count
  const { data: currentLead } = await admin
    .from('leads')
    .select('no_answer_count, client_id')
    .eq('id', leadId)
    .single();

  const updates: Record<string, unknown> = {
    queue_claimed_by: null,
    queue_claimed_at: null,
  };

  if (disposition === 'no_answer') {
    updates.no_answer_count = (currentLead?.no_answer_count ?? 0) + 1;
    updates.status = 'contacted';
  } else if (disposition === 'booked') {
    updates.status = 'booked';
  } else if (disposition === 'disqualified' || disposition === 'not_interested') {
    updates.status = 'disqualified';
  } else {
    updates.status = 'contacted';
  }

  const { error: leadErr } = await admin
    .from('leads')
    .update(updates)
    .eq('id', leadId);
  if (leadErr) throw leadErr;

  // 3) If booked, create the appointment
  let newApptId: string | null = null;
  if (disposition === 'booked') {
    const apptDate = formData.get('appt_date') as string;
    const clientId = currentLead?.client_id as string | null;
    if (apptDate && clientId) {
      const { data: apptRow, error: apptErr } = await admin.from('appointments').insert({
        lead_id: leadId,
        client_id: clientId,
        appt_date: new Date(apptDate).toISOString(),
        setter: user.email,
        setter_id: user.id,
        outcome: 'booked',
      }).select('id').single();
      if (apptErr) throw apptErr;
      newApptId = apptRow?.id ?? null;
    }
  }

  await writeAudit({
    actor_id: user.id,
    actor_role: 'setter',
    action_type: 'lead.disposition_recorded',
    entity_type: 'lead',
    entity_id: leadId,
    description: `Setter disposition recorded: ${disposition}${disqualReason ? ` (${disqualReason})` : ''}`,
    metadata: { disposition, callback_at: callbackAt, disqual_reason: disqualReason, appointment_id: newApptId },
  });

  if (newApptId) {
    await writeAudit({
      actor_id: user.id,
      actor_role: 'setter',
      action_type: 'appointment.booked',
      entity_type: 'appointment',
      entity_id: newApptId,
      description: `Appointment booked by setter (${user.email ?? user.id})`,
      metadata: { lead_id: leadId, setter_id: user.id, setter_email: user.email },
    });
  }

  revalidatePath('/queue');
}

export async function submitWrapUp(formData: FormData) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();

  const leadId = formData.get('lead_id') as string;
  const disqualReason = (formData.get('wrap_disqual_reason') as string) || null;
  const isDisqualified = !!disqualReason;
  const notes = (formData.get('notes') as string) || null;

  if (!leadId) throw new Error('Missing lead_id');

  const { data: currentLead } = await admin
    .from('leads')
    .select('client_id')
    .eq('id', leadId)
    .single();

  // Record the disposition
  const { error: dispErr } = await admin.from('call_dispositions').insert({
    lead_id: leadId,
    disposition: isDisqualified ? 'disqualified' : 'booked',
    disqual_reason: disqualReason,
    notes,
    created_by: user.id,
  });
  if (dispErr) throw dispErr;

  // Helpers to read nullable typed fields from FormData
  const str = (key: string) => (formData.get(key) as string) || null;
  const bool = (key: string): boolean | null => {
    const v = formData.get(key);
    if (v === null || v === '') return null;
    return v === 'true';
  };
  const num = (key: string): number | null => {
    const v = formData.get(key) as string;
    if (!v) return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  };

  // Update lead: qualifying fields + status + release claim
  const { error: leadErr } = await admin.from('leads').update({
    is_homeowner:                bool('is_homeowner'),
    already_has_solar:           bool('already_has_solar'),
    existing_system_size_kw:     num('existing_system_size_kw'),
    existing_system_age_years:   num('existing_system_age_years'),
    solar_intention:             str('solar_intention'),
    monthly_bill_band:           str('monthly_bill_band'),
    income_status:               str('income_status'),
    all_decision_makers_present: bool('all_decision_makers_present'),
    co_owner_available:          bool('co_owner_available'),
    roof_type:                   str('roof_type'),
    credit_status:               str('credit_status'),
    wrap_disqual_reason:         disqualReason,
    wrap_up_completed_at:        new Date().toISOString(),
    queue_claimed_by:            null,
    queue_claimed_at:            null,
    status:                      isDisqualified ? 'disqualified' : 'booked',
  }).eq('id', leadId);
  if (leadErr) throw leadErr;

  // Create appointment only when qualified
  let wrapApptId: string | null = null;
  if (!isDisqualified) {
    const apptDate = formData.get('appt_date') as string;
    const clientId = currentLead?.client_id as string | null;
    if (apptDate && clientId) {
      const { data: wrapAppt, error: apptErr } = await admin.from('appointments').insert({
        lead_id: leadId,
        client_id: clientId,
        appt_date: new Date(apptDate).toISOString(),
        setter: user.email,
        setter_id: user.id,
        outcome: 'booked',
      }).select('id').single();
      if (apptErr) throw apptErr;
      wrapApptId = wrapAppt?.id ?? null;
    }
  }

  await writeAudit({
    actor_id: user.id,
    actor_role: 'setter',
    action_type: 'lead.disposition_recorded',
    entity_type: 'lead',
    entity_id: leadId,
    description: `Setter wrap-up: ${isDisqualified ? `disqualified (${disqualReason})` : 'booked'}`,
    metadata: { disqual_reason: disqualReason, appointment_id: wrapApptId },
  });

  if (wrapApptId) {
    await writeAudit({
      actor_id: user.id,
      actor_role: 'setter',
      action_type: 'appointment.booked',
      entity_type: 'appointment',
      entity_id: wrapApptId,
      description: `Appointment booked via qualifying wrap-up by setter (${user.email ?? user.id})`,
      metadata: { lead_id: leadId, setter_id: user.id },
    });
  }

  revalidatePath('/queue');
}
