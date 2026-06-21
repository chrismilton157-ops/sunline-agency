import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { requireOwner } from '@/lib/data';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await requireOwner();
  if (!user) redirect('/login');
  if (role === 'client') redirect('/portal');
  if (role !== 'owner') redirect('/login?error=Owner+access+only');

  return (
    <div className="md:flex">
      <Sidebar email={user.email ?? ''} />
      <main className="flex-1 min-h-screen px-4 py-6 md:px-10 md:py-8 max-w-[1300px] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
