'use server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export async function updateDataRequest(formData: FormData) {
  const { user, role } = await requireOwner();
  if (role !== 'owner') throw new Error('Forbidden');

  const id     = String(formData.get('id')     ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const notes  = String(formData.get('notes')  ?? '').trim() || null;

  const valid = ['new', 'in_progress', 'completed'];
  if (!id || !valid.includes(status)) throw new Error('Invalid input');

  const admin = getServerAdmin();

  const { data: prev } = await admin
    .from('data_requests')
    .select('status, request_type, requester_name')
    .eq('id', id)
    .single();

  const { error } = await admin
    .from('data_requests')
    .update({ status, owner_notes: notes, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(error.message);

  await writeAudit({
    actor_id: user?.id ?? null,
    actor_role: 'owner',
    action_type: `data_request.${status}`,
    entity_type: 'data_request',
    entity_id: id,
    description: `Data request (${prev?.request_type ?? '?'}) for ${prev?.requester_name ?? '?'} → ${status}`,
    metadata: { before: { status: prev?.status }, after: { status }, notes },
  });

  revalidatePath('/data-requests');
}
