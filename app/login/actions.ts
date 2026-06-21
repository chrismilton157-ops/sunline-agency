'use server';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    redirect('/login?error=Missing+email+or+password');
  }

  const supabase = getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  // Verify the user is an owner — the agency app is owner-only.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: row } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (row?.role !== 'owner') {
      await supabase.auth.signOut();
      redirect('/login?error=This+sign-in+is+for+the+agency+owner.');
    }
  }

  redirect('/overview');
}

export async function logout() {
  const supabase = getServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
