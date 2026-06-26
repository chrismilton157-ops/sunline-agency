import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { SetterHeader } from './SetterHeader';

export default async function SetterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: row } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (row?.role === 'owner') redirect('/overview');
  if (row?.role === 'client') redirect('/portal');
  if (row?.role !== 'setter') redirect('/login');

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <SetterHeader email={user.email ?? ''} />
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
