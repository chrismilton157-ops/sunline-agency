'use server';
import { revalidatePath } from 'next/cache';
import { getServerAdmin } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/data';

export async function addSetter(formData: FormData) {
  const { role } = await requireOwner();
  if (role !== 'owner') throw new Error('Owner access only');

  const email = (formData.get('email') as string)?.trim().toLowerCase();
  const password = formData.get('password') as string;

  if (!email || !password) throw new Error('Email and password are required');
  if (password.length < 8) throw new Error('Password must be at least 8 characters');

  const admin = getServerAdmin();

  // Create auth user
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (cErr || !created.user) throw cErr ?? new Error('Failed to create user');

  // Insert users row with setter role
  const { error: uErr } = await admin.from('users').insert({
    id: created.user.id,
    email,
    role: 'setter',
    client_id: null,
  });
  if (uErr) {
    // Clean up auth user if users row insert fails
    await admin.auth.admin.deleteUser(created.user.id);
    throw uErr;
  }

  revalidatePath('/setters');
}

export async function removeSetter(userId: string) {
  const { role } = await requireOwner();
  if (role !== 'owner') throw new Error('Owner access only');

  const admin = getServerAdmin();
  await admin.from('users').delete().eq('id', userId).eq('role', 'setter');
  await admin.auth.admin.deleteUser(userId);
  revalidatePath('/setters');
}
