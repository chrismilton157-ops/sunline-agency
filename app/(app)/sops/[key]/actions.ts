'use server';

import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';

export async function saveSOPContent(id: string, content: string) {
  const { role } = await requireOwner();
  if (role !== 'owner') return { ok: false };

  const admin = getServerAdmin();
  const { data, error } = await admin
    .from('sop_documents')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('updated_at')
    .single();

  if (error) return { ok: false };
  return { ok: true, updatedAt: data.updated_at };
}

export async function resetSOPContent(id: string, defaultContent: string) {
  const { role } = await requireOwner();
  if (role !== 'owner') return { ok: false };

  const admin = getServerAdmin();
  const { data, error } = await admin
    .from('sop_documents')
    .update({ content: defaultContent, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('updated_at')
    .single();

  if (error) return { ok: false };
  return { ok: true, updatedAt: data.updated_at };
}
