'use server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/data';
import { deleteLeadHard } from '@/lib/leads';

// GDPR right-to-erasure entry point. Owner-only at every layer:
// 1. requireOwner re-confirms the cookie identity is an owner.
// 2. deleteLeadHard uses the service-role client (bypasses RLS), so we
//    re-verify the caller's role here before invoking it.
//
// Cascade-deletes any appointments referencing this lead per the FK
// definition in migration 0001 — full erasure of the homeowner's data.

export async function deleteLead(formData: FormData) {
  const { role } = await requireOwner();
  if (role !== 'owner') throw new Error('Forbidden');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) throw new Error('Missing lead id');

  await deleteLeadHard(id);

  revalidatePath('/leads');
  revalidatePath('/overview');
  revalidatePath('/clients');
}
