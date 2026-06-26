'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';

const STALE_MS = 30 * 60 * 1000;

async function getSetterUser() {
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
  if (row?.role !== 'setter') throw new Error('Setter access only');
  return { user };
}

export async function setterClaimLead(leadId: string) {
  const { user } = await getSetterUser();
  const admin = getServerAdmin();
  const staleThreshold = new Date(Date.now() - STALE_MS).toISOString();
  const now = new Date().toISOString();

  await admin
    .from('leads')
    .update({ queue_claimed_by: user.id, queue_claimed_at: now })
    .eq('id', leadId)
    .or(
      `queue_claimed_by.is.null,queue_claimed_at.lt.${staleThreshold},queue_claimed_by.eq.${user.id}`,
    );

  revalidatePath('/setter');
}

export async function setterReleaseLead(leadId: string) {
  const { user } = await getSetterUser();
  const admin = getServerAdmin();

  await admin
    .from('leads')
    .update({ queue_claimed_by: null, queue_claimed_at: null })
    .eq('id', leadId)
    .eq('queue_claimed_by', user.id);

  revalidatePath('/setter');
}

export async function setterSubmitDisposition(formData: FormData) {
  const { user } = await getSetterUser();
  const admin = getServerAdmin();

  const leadId = formData.get('lead_id') as string;
  const disposition = formData.get('disposition') as string;
  const callbackAt = (formData.get('callback_at') as string) || null;
  const notes = (formData.get('notes') as string) || null;

  if (!leadId || !disposition) throw new Error('Missing required fields');

  const { error: dispErr } = await admin.from('call_dispositions').insert({
    lead_id: leadId,
    disposition,
    callback_at: callbackAt,
    notes,
    created_by: user.id,
  });
  if (dispErr) throw dispErr;

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
  } else if (disposition === 'not_interested' || disposition === 'wrong_number') {
    updates.status = 'disqualified';
  } else {
    updates.status = 'contacted';
  }

  const { error: leadErr } = await admin
    .from('leads')
    .update(updates)
    .eq('id', leadId);
  if (leadErr) throw leadErr;

  if (disposition === 'booked') {
    const apptDate = formData.get('appt_date') as string;
    const clientId = currentLead?.client_id as string | null;
    if (apptDate && clientId) {
      const { error: apptErr } = await admin.from('appointments').insert({
        lead_id: leadId,
        client_id: clientId,
        appt_date: new Date(apptDate).toISOString(),
        setter: user.email,
        outcome: 'booked',
      });
      if (apptErr) throw apptErr;
    }
  }

  revalidatePath('/setter');
}
