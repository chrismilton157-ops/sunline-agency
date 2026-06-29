import { redirect } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { requireOwner } from '@/lib/data';

export default async function ConfirmerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await requireOwner();
  if (!user) redirect('/login');
  if (role === 'client') redirect('/portal');
  if (role === 'owner') redirect('/today');
  if (role === 'setter') redirect('/queue');
  // Any other unknown role → login (no redirect loop because /cockpit is the confirmer's home)
  if (role !== 'confirmer') redirect('/login?error=Confirmer+access+only');

  return (
    <div className="md:flex">
      <Sidebar email={user.email ?? ''} role="confirmer" />
      <main className="flex-1 min-h-screen px-4 py-6 md:px-10 md:py-8 max-w-[900px] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
