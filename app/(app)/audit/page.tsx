import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Audit log' };

import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { fmtDateFull } from '@/lib/format';
import { AuditFilters } from './AuditFilters';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;

type AuditRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_role: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
};

type SearchParams = {
  action_type?: string;
  entity_type?: string;
  actor_role?: string;
  entity_id?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
};

const ACTION_LABELS: Record<string, string> = {
  'lead.created':                'Lead created',
  'lead.routed':                 'Lead routed',
  'lead.disqualified':           'Lead disqualified',
  'lead.erased':                 'Lead erased (GDPR)',
  'lead.claimed':                'Lead claimed',
  'lead.disposition_recorded':   'Disposition recorded',
  'appointment.booked':          'Appointment booked',
  'appointment.outcome_set':     'Outcome set',
  'appointment.quality_set':     'Quality rated',
  'invoice.generated':           'Invoices generated',
  'invoice.draft':               'Invoice → draft',
  'invoice.issued':              'Invoice issued',
  'invoice.paid':                'Invoice paid',
  'client.created':              'Client created',
  'settings.changed':            'Settings changed',
  'settings.reset':              'Settings reset',
  'data_request.received':       'Data request received',
  'data_request.new':            'Data request → new',
  'data_request.in_progress':    'Data request → in progress',
  'data_request.completed':      'Data request completed',
};

const ROLE_PILL: Record<string, string> = {
  owner:   'bg-amber/15 text-amber-700',
  setter:  'bg-blue-50 text-blue-700',
  client:  'bg-green-50 text-green-700',
  system:  'bg-slate-100 text-slate-600',
  public:  'bg-stone-100 text-stone-600',
};

const ENTITY_CHIP: Record<string, string> = {
  lead:          'bg-violet-50 text-violet-700',
  appointment:   'bg-sky-50 text-sky-700',
  invoice:       'bg-emerald-50 text-emerald-700',
  client:        'bg-orange-50 text-orange-700',
  settings:      'bg-yellow-50 text-yellow-700',
  data_request:  'bg-pink-50 text-pink-700',
};

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireOwner();
  const admin = getServerAdmin();

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('audit_log')
    .select('id,created_at,actor_id,actor_role,action_type,entity_type,entity_id,description,metadata', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (searchParams.action_type) query = query.eq('action_type', searchParams.action_type);
  if (searchParams.entity_type) query = query.eq('entity_type', searchParams.entity_type);
  if (searchParams.actor_role)  query = query.eq('actor_role',  searchParams.actor_role);
  if (searchParams.entity_id)   query = query.eq('entity_id',   searchParams.entity_id);
  if (searchParams.from)        query = query.gte('created_at', new Date(searchParams.from).toISOString());
  if (searchParams.to) {
    const d = new Date(searchParams.to);
    d.setUTCDate(d.getUTCDate() + 1);
    query = query.lt('created_at', d.toISOString());
  }
  if (searchParams.q) query = query.ilike('description', `%${searchParams.q}%`);

  const { data, count, error } = await query;

  const rows: AuditRow[] = error ? [] : (data ?? []);
  const total = count ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Collect unique action types for filter dropdown
  const { data: typeRows } = await (admin as any)
    .from('audit_log')
    .select('action_type')
    .order('action_type');
  const uniqueTypes: string[] = Array.from(
    new Set((typeRows ?? []).map((r: { action_type: string }) => r.action_type))
  );

  const activeFilters = Object.entries(searchParams).filter(
    ([k, v]) => k !== 'page' && v,
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Audit log</h1>
          <p className="text-muted text-sm mt-1">
            Immutable record of every significant action.
            {total > 0 && (
              <span className="ml-1 tabular-nums">{total.toLocaleString('en-GB')} entries total.</span>
            )}
          </p>
        </div>
        {activeFilters > 0 && (
          <a href="/audit" className="btn btn-ghost text-sm">
            Clear {activeFilters} filter{activeFilters > 1 ? 's' : ''}
          </a>
        )}
      </header>

      <AuditFilters
        actionTypes={uniqueTypes}
        current={searchParams}
      />

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-muted">
          {total === 0
            ? 'No audit entries yet. Run an action (submit a lead, set an outcome, change settings) and come back.'
            : 'No entries match the current filters.'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-left font-medium w-36">When</th>
                <th className="px-4 py-2.5 text-left font-medium w-24">Actor</th>
                <th className="px-4 py-2.5 text-left font-medium w-24">Entity</th>
                <th className="px-4 py-2.5 text-left font-medium">Description</th>
                <th className="px-4 py-2.5 text-left font-medium hidden lg:table-cell w-40">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-4 py-3 tabular-nums text-xs text-muted whitespace-nowrap">
                    {fmtDateFull(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_PILL[row.actor_role] ?? 'bg-stone-100 text-stone-600'}`}>
                      {row.actor_role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ENTITY_CHIP[row.entity_type] ?? 'bg-stone-100 text-stone-600'}`}>
                      {row.entity_type}
                    </span>
                    {row.entity_id && (
                      <div className="text-xs text-muted font-mono mt-0.5 truncate max-w-[80px]" title={row.entity_id}>
                        {row.entity_id.slice(0, 8)}…
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-stone-800 max-w-sm">
                    <div className="truncate" title={row.description}>{row.description}</div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs text-muted font-mono">
                      {ACTION_LABELS[row.action_type] ?? row.action_type}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center gap-2 text-sm">
          {page > 1 && (
            <a
              href={buildPageUrl(searchParams, page - 1)}
              className="btn btn-ghost"
            >
              ← Previous
            </a>
          )}
          <span className="text-muted tabular-nums">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <a
              href={buildPageUrl(searchParams, page + 1)}
              className="btn btn-ghost"
            >
              Next →
            </a>
          )}
        </nav>
      )}
    </div>
  );
}

function buildPageUrl(params: SearchParams, newPage: number): string {
  const qs = new URLSearchParams();
  if (params.action_type) qs.set('action_type', params.action_type);
  if (params.entity_type) qs.set('entity_type', params.entity_type);
  if (params.actor_role)  qs.set('actor_role',  params.actor_role);
  if (params.entity_id)   qs.set('entity_id',   params.entity_id);
  if (params.from)        qs.set('from',         params.from);
  if (params.to)          qs.set('to',           params.to);
  if (params.q)           qs.set('q',            params.q);
  qs.set('page', String(newPage));
  return `/audit?${qs.toString()}`;
}
