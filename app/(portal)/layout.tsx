import { redirect } from 'next/navigation';
import { PortalHeader } from '@/components/PortalHeader';
import { loadPortalForClient, requireSession } from '@/lib/data';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role, clientId } = await requireSession();
  if (!user) redirect('/login');
  if (role === 'owner') redirect('/overview');
  if (role !== 'client' || !clientId) {
    redirect('/login?error=No+client+linked+to+this+account');
  }

  // Header needs the company name. Reuse the portal loader (single
  // round-trip, since the portal page also uses it — Next caches).
  const { client } = await loadPortalForClient(clientId);

  return (
    <div className="min-h-screen">
      <PortalHeader company={client.company} />
      <main className="max-w-[1100px] mx-auto px-4 md:px-8 py-6 md:py-10">
        {children}
      </main>
    </div>
  );
}
