'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';

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
  if (row?.role === 'client') throw new Error('Client accounts cannot access the confirmation queue');
  return { user };
}

export async function markConfirmed(appointmentId: string) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();

  const now = new Date().toISOString();

  const { error } = await admin
    .from('appointments')
    .update({ confirmed_at: now })
    .eq('id', appointmentId);
  if (error) throw error;

  // Record a "confirmed" attempt so the history is complete
  await admin.from('confirmation_attempts').insert({
    appointment_id: appointmentId,
    method: 'confirmed',
    notes: null,
    attempted_by: user.id,
  });

  revalidatePath('/confirmations');
}

export async function logAttempt(formData: FormData) {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();

  const appointmentId = formData.get('appointment_id') as string;
  const method = formData.get('method') as string;
  const notes = (formData.get('notes') as string) || null;

  if (!appointmentId || !method) throw new Error('Missing required fields');

  const { error } = await admin.from('confirmation_attempts').insert({
    appointment_id: appointmentId,
    method,
    notes,
    attempted_by: user.id,
  });
  if (error) throw error;

  revalidatePath('/confirmations');
}
