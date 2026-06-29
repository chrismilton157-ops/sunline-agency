'use server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';

export async function updateDataRequest(formData: FormData) {
  const { role } = await requireOwner();
  if (role !== 'owner') throw new Error('Forbidden');

  const id     = String(formData.get('id')     ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const notes  = String(formData.get('notes')  ?? '').trim() || null;

  const valid = ['new', 'in_progress', 'completed'];
  if (!id || !valid.includes(status)) throw new Error('Invalid input');

  const admin = getServerAdmin();
  const { error } = await admin
    .from('data_requests')
    .update({ status, owner_notes: notes, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/data-requests');
}
