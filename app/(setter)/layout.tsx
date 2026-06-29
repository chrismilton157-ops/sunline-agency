import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { requireOwner } from '@/lib/data';

export default async function SetterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await requireOwner();
  if (!user) redirect('/login');
  if (role === 'client') redirect('/portal');
  if (role === 'confirmer') redirect('/cockpit');
  // Both owner and setter can reach queue; anything else goes to login
  if (role !== 'owner' && role !== 'setter') redirect('/login');

  return (
    <div className="md:flex">
      <Sidebar email={user.email ?? ''} role={role ?? 'setter'} />
      <main className="flex-1 min-h-screen px-4 py-6 md:px-10 md:py-8 max-w-[1300px] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
