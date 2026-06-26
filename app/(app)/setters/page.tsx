import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { redirect } from 'next/navigation';
import { AddSetterForm } from './AddSetterForm';
import { RemoveSetterButton } from './RemoveSetterButton';

export const dynamic = 'force-dynamic';

export default async function SettersPage() {
  const { user, role } = await requireOwner();
  if (!user || role !== 'owner') redirect('/login');

  const admin = getServerAdmin();
  const { data: setters } = await admin
    .from('users')
    .select('id, email, created_at')
    .eq('role', 'setter')
    .order('created_at', { ascending: true });

  return (
    <div className="space-y-8 max-w-lg">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Setters</h1>
        <p className="text-muted text-sm mt-1">
          Setter logins can see the call queue and nothing else — no money,
          no client data, no agency screens.
        </p>
      </header>

      {/* Existing setters */}
      <section className="space-y-2">
        <p className="text-xs text-muted uppercase tracking-wide font-medium">
          {setters?.length ?? 0} setter{(setters?.length ?? 0) !== 1 ? 's' : ''}
        </p>
        {(setters?.length ?? 0) === 0 && (
          <div className="card px-4 py-8 text-center text-muted text-sm">
            No setters yet — add one below.
          </div>
        )}
        {(setters ?? []).map((s) => (
          <div key={s.id} className="card px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">{s.email}</p>
              <p className="text-xs text-muted num">
                Added {new Date(s.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>
            </div>
            <RemoveSetterButton userId={s.id} email={s.email} />
          </div>
        ))}
      </section>

      {/* Add setter */}
      <section className="card px-5 py-5 space-y-4">
        <h2 className="font-semibold text-sm">Add a setter</h2>
        <AddSetterForm />
      </section>
    </div>
  );
}
