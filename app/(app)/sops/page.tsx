import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';

const ROLE_META: Record<string, { colour: string; icon: string; desc: string }> = {
  setter:    { colour: 'bg-blue-50 border-blue-200',    icon: '📞', desc: 'Call centre qualification, cadence, booking and benchmarks.' },
  confirmer: { colour: 'bg-emerald-50 border-emerald-200', icon: '✅', desc: 'Confirmation calls, saves, inbound handling and show-rate.' },
  manager:   { colour: 'bg-amber-50 border-amber-200',  icon: '🏢', desc: 'Running the whole operation — rhythm, clients, billing, alerts.' },
  technical: { colour: 'bg-slate-50 border-slate-200',  icon: '⚙️', desc: 'Stack, architecture, data model, RLS and deploy workflow.' },
};

export default async function SOPsPage() {
  const { role } = await requireOwner();
  if (role !== 'owner') redirect('/login?error=Owner+access+only');

  const admin = getServerAdmin();
  const { data: docs } = await admin
    .from('sop_documents')
    .select('key, title, updated_at')
    .order('key');

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">SOPs &amp; Playbooks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Role handbooks for your team. Edit in-app and download as a branded PDF to hand to staff.
          Owner-only — never visible to setters, confirmers, or clients.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(docs ?? []).map((doc) => {
          const meta = ROLE_META[doc.key] ?? { colour: 'bg-white border-slate-200', icon: '📄', desc: '' };
          return (
            <Link
              key={doc.key}
              href={`/sops/${doc.key}`}
              className={`border rounded-xl p-5 flex gap-4 items-start hover:shadow-md transition-shadow ${meta.colour}`}
            >
              <span className="text-3xl leading-none mt-0.5">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 text-sm">{doc.title}</div>
                <div className="text-slate-500 text-xs mt-1 leading-relaxed">{meta.desc}</div>
                <div className="text-slate-400 text-xs mt-3">
                  Last edited {new Date(doc.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <span className="text-slate-400 text-sm self-center">→</span>
            </Link>
          );
        })}
      </div>

      {(!docs || docs.length === 0) && (
        <div className="text-center py-16 text-slate-400">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-medium">No playbooks found</div>
          <div className="text-sm mt-1">Run the migration SQL in Supabase to seed the documents.</div>
        </div>
      )}
    </div>
  );
}
