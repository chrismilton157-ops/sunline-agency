import { redirect } from 'next/navigation';
import { PortalSidebar } from '@/components/PortalSidebar';
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

  // Sidebar needs the company name. Reuse the portal loader (single
  // round-trip per request; subpages can re-call it freely).
  const { client } = await loadPortalForClient(clientId);

  return (
    <div className="md:flex">
      <PortalSidebar company={client.company} />
      <main className="flex-1 min-h-screen px-4 py-6 md:px-10 md:py-8 max-w-[1100px] mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
