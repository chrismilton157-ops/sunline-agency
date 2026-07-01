'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import {
  computeNextAvailableAt,
  effectiveDailyAttempts,
  toUKDateString,
} from '@/lib/setter-cadence';
import type { Pipeline } from '@/lib/types';

// Stale claim threshold: 30 minutes
const STALE_MS = 30 * 60 * 1_000;

// Parse a best-effort talk-time value from a form field. Returns null unless a
// sane positive integer of seconds (capped at 4h to ignore runaway timers).
function parseTalkTime(raw: FormDataEntryValue | null): number | null {
  if (raw == null) return null;
  const n = parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 4 * 60 * 60);
}

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

// ---------------------------------------------------------------------------
// Auto-serve: atomically claim the next eligible lead for this setter.
// Returns the lead id, or null if no eligible lead exists.
// p_pipeline: null = auto (P1→P2→P3), 1/2/3 = prefer that pipeline.
// ---------------------------------------------------------------------------
export async function serveNextLead(preferredPipeline: Pipeline | null = null) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();

  // Don't double-serve: if setter already has a fresh claim, leave it
  const staleAt = new Date(Date.now() - STALE_MS).toISOString();
  const { data: existing } = await admin
    .from('leads')
    .select('id')
    .eq('queue_claimed_by', user.id)
    .gt('queue_claimed_at', staleAt)
    .single();

  if (existing?.id) {
    revalidatePath('/queue');
    return existing.id as string;
  }

  // Try preferred pipeline; if none found and pipeline was specified, fall
  // through to auto so the setter is never idle while other leads exist.
  let leadId: string | null = null;

  const { data: id1 } = await admin.rpc('serve_next_lead', {
    p_setter_id: user.id,
    p_pipeline: preferredPipeline ?? null,
  });
  leadId = (id1 as string | null) ?? null;

  if (!leadId && preferredPipeline !== null) {
    // Auto-drop: try again with no pipeline filter
    const { data: id2 } = await admin.rpc('serve_next_lead', {
      p_setter_id: user.id,
      p_pipeline: null,
    });
    leadId = (id2 as string | null) ?? null;
  }

  // Record first-ever claim for this lead (response-time metric)
  if (leadId) {
    const now = new Date().toISOString();
    const { data: leadMeta } = await admin
      .from('leads')
      .select('first_claimed_at')
      .eq('id', leadId)
      .single();

    if (!leadMeta?.first_claimed_at) {
      await admin
        .from('leads')
        .update({ first_claimed_by: user.id, first_claimed_at: now })
        .eq('id', leadId)
        .is('first_claimed_at', null);

      await writeAudit({
        actor_id: user.id,
        actor_role: 'setter',
        action_type: 'lead.served',
        entity_type: 'lead',
        entity_id: leadId,
        description: `Lead first served to setter (${user.email ?? user.id})`,
        metadata: { setter_id: user.id, preferred_pipeline: preferredPipeline },
      });
    }
  }

  revalidatePath('/queue');
  return leadId;
}

// ---------------------------------------------------------------------------
// Set pipeline preference for the current setter (or for another setter if
// called from an owner action — owner passes target_setter_id).
// ---------------------------------------------------------------------------
export async function setPipelinePref(
  pipeline: Pipeline | null,
  targetSetterId?: string,
) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();
  const subjectId = targetSetterId ?? user.id;

  await admin
    .from('users')
    .update({ queue_pipeline_pref: pipeline })
    .eq('id', subjectId);

  if (targetSetterId && targetSetterId !== user.id) {
    await writeAudit({
      actor_id: user.id,
      actor_role: 'owner',
      action_type: 'queue.pipeline_directed',
      entity_type: 'user',
      entity_id: targetSetterId,
      description: `Owner directed setter to pipeline ${pipeline ?? 'auto'}`,
      metadata: { pipeline, directed_by: user.id },
    });
  }

  revalidatePath('/queue');
  revalidatePath('/pipelines');
}

// ---------------------------------------------------------------------------
// Release a lead (kept for edge cases — auto-serve supersedes manual claim)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Submit a call disposition with cadence tracking.
// ---------------------------------------------------------------------------
export async function submitDisposition(formData: FormData) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();

  const leadId = formData.get('lead_id') as string;
  const disposition = formData.get('disposition') as string;
  const callbackAt = (formData.get('callback_at') as string) || null;
  const disqualReason = (formData.get('disqual_reason') as string) || null;
  const notes = (formData.get('notes') as string) || null;
  const talkTime = parseTalkTime(formData.get('talk_time_seconds'));

  if (!leadId || !disposition) throw new Error('Missing required fields');

  // 1) Record the disposition in call_dispositions
  const { error: dispErr } = await admin.from('call_dispositions').insert({
    lead_id: leadId,
    disposition,
    callback_at: callbackAt,
    disqual_reason: disqualReason,
    notes,
    talk_time_seconds: talkTime,
    created_by: user.id,
  });
  if (dispErr) throw dispErr;

  // 2) Read current cadence state
  const { data: currentLead } = await admin
    .from('leads')
    .select('no_answer_count, daily_attempts, daily_attempts_date, client_id')
    .eq('id', leadId)
    .single();

  const now = new Date();
  const todayUK = toUKDateString(now);
  const noAnswerCountBefore = currentLead?.no_answer_count ?? 0;
  const existingDailyAttempts = currentLead?.daily_attempts ?? 0;
  const existingDailyDate = currentLead?.daily_attempts_date ?? null;

  const todayAttemptsBefore = effectiveDailyAttempts(
    existingDailyAttempts,
    existingDailyDate,
    now,
  );

  // 3) Compute updates
  const updates: Record<string, unknown> = {
    queue_claimed_by: null,
    queue_claimed_at: null,
    last_attempt_at: now.toISOString(),
  };

  if (disposition === 'no_answer') {
    const dailyAttemptsAfter = todayAttemptsBefore + 1;
    updates.no_answer_count = noAnswerCountBefore + 1;
    updates.daily_attempts = dailyAttemptsAfter;
    updates.daily_attempts_date = todayUK;
    updates.next_available_at = computeNextAvailableAt(
      noAnswerCountBefore,
      dailyAttemptsAfter,
      now,
    ).toISOString();
    updates.status = 'contacted';
  } else if (disposition === 'qualified_callback') {
    // Spoke to them, they want a specific callback — tie to this setter
    if (!callbackAt) throw new Error('callback_at required for qualified_callback');
    updates.callback_at = callbackAt;
    updates.callback_setter_id = user.id;
    updates.next_available_at = callbackAt; // won't re-surface until callback time
    updates.status = 'contacted';
  } else if (disposition === 'callback') {
    // Answered, wants a different time — return to shared pool at that time
    if (callbackAt) {
      updates.next_available_at = callbackAt;
    }
    updates.status = 'contacted';
  } else if (disposition === 'booked') {
    updates.status = 'booked';
    // Clear any pending callback so the lead won't resurface
    updates.callback_at = null;
    updates.callback_setter_id = null;
    updates.next_available_at = null;
  } else if (disposition === 'disqualified' || disposition === 'not_interested') {
    updates.status = 'disqualified';
    updates.next_available_at = null;
    updates.callback_at = null;
    updates.callback_setter_id = null;
  } else {
    // wrong_number and any other outcome
    updates.status = 'contacted';
  }

  const { error: leadErr } = await admin
    .from('leads')
    .update(updates)
    .eq('id', leadId);
  if (leadErr) throw leadErr;

  // 4) Create appointment if booked
  let newApptId: string | null = null;
  if (disposition === 'booked') {
    const apptDate = formData.get('appt_date') as string;
    const clientId = currentLead?.client_id as string | null;
    if (apptDate && clientId) {
      const { data: apptRow, error: apptErr } = await admin
        .from('appointments')
        .insert({
          lead_id: leadId,
          client_id: clientId,
          appt_date: new Date(apptDate).toISOString(),
          setter: user.email,
          setter_id: user.id,
          outcome: 'booked',
        })
        .select('id')
        .single();
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
    description: `Setter disposition: ${disposition}${disqualReason ? ` (${disqualReason})` : ''}`,
    metadata: {
      disposition,
      callback_at: callbackAt,
      disqual_reason: disqualReason,
      appointment_id: newApptId,
      no_answer_count_after: disposition === 'no_answer' ? noAnswerCountBefore + 1 : noAnswerCountBefore,
    },
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

// ---------------------------------------------------------------------------
// Submit qualifying wrap-up (unchanged in logic; cadence release added)
// ---------------------------------------------------------------------------
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
    talk_time_seconds: parseTalkTime(formData.get('talk_time_seconds')),
    created_by: user.id,
  });
  if (dispErr) throw dispErr;

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
    // Clear cadence gates on terminal outcomes
    next_available_at:           isDisqualified ? null : null,
    callback_at:                 null,
    callback_setter_id:          null,
    status:                      isDisqualified ? 'disqualified' : 'booked',
  }).eq('id', leadId);
  if (leadErr) throw leadErr;

  let wrapApptId: string | null = null;
  if (!isDisqualified) {
    const apptDate = formData.get('appt_date') as string;
    const clientId = currentLead?.client_id as string | null;
    if (apptDate && clientId) {
      const { data: wrapAppt, error: apptErr } = await admin
        .from('appointments')
        .insert({
          lead_id: leadId,
          client_id: clientId,
          appt_date: new Date(apptDate).toISOString(),
          setter: user.email,
          setter_id: user.id,
          outcome: 'booked',
        })
        .select('id')
        .single();
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

// ---------------------------------------------------------------------------
// Dialer pause/resume sessions (Phase 26)
// Simple start/stop timestamps: at most one OPEN session per setter. Pausing
// closes the active stretch and opens a paused one; resuming does the reverse.
// Durations are derived in lib/setter-sessions.ts.
// ---------------------------------------------------------------------------

type DialerState = 'active' | 'paused';

async function closeOpenSessions(admin: ReturnType<typeof getServerAdmin>, setterId: string) {
  await admin
    .from('setter_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('setter_id', setterId)
    .is('ended_at', null);
}

// Ensure the setter has an open dialer session when they land on the queue.
// Returns the current state so the UI can restore the pause button correctly.
export async function startDialerSession(): Promise<DialerState> {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();
  const now = new Date().toISOString();

  const { data: open } = await admin
    .from('setter_sessions')
    .select('id, state')
    .eq('setter_id', user.id)
    .is('ended_at', null)
    .maybeSingle();

  if (open) {
    await admin
      .from('setter_sessions')
      .update({ last_heartbeat_at: now })
      .eq('id', open.id);
    return (open.state as DialerState) ?? 'active';
  }

  await admin.from('setter_sessions').insert({
    setter_id: user.id,
    state: 'active',
    started_at: now,
    last_heartbeat_at: now,
  });
  return 'active';
}

// Keep the open session alive (called from the queue's existing poll loop).
export async function heartbeatDialer(): Promise<void> {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();
  await admin
    .from('setter_sessions')
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq('setter_id', user.id)
    .is('ended_at', null);
}

async function switchDialerState(newState: DialerState): Promise<void> {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();
  const now = new Date().toISOString();

  await closeOpenSessions(admin, user.id);
  await admin.from('setter_sessions').insert({
    setter_id: user.id,
    state: newState,
    started_at: now,
    last_heartbeat_at: now,
  });

  await writeAudit({
    actor_id: user.id,
    actor_role: 'setter',
    action_type: newState === 'paused' ? 'dialer.paused' : 'dialer.resumed',
    entity_type: 'setter_session',
    entity_id: user.id,
    description: `Setter ${newState === 'paused' ? 'paused' : 'resumed'} the dialer`,
    metadata: { setter_id: user.id },
  });
}

export async function pauseDialer(): Promise<void> {
  await switchDialerState('paused');
  revalidatePath('/queue');
}

export async function resumeDialer(): Promise<void> {
  await switchDialerState('active');
  revalidatePath('/queue');
}

// End the setter's dialer session cleanly (tab close / navigate away).
export async function endDialerSession(): Promise<void> {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();
  await closeOpenSessions(admin, user.id);
}
