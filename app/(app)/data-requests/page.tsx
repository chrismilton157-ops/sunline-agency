import Link from 'next/link';
import { getServerAdmin } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/data';
import { redirect } from 'next/navigation';
import { updateDataRequest } from './actions';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Data requests' };
export const dynamic = 'force-dynamic';

type DataRequest = {
  id: string;
  created_at: string;
  updated_at: string | null;
  requester_name: string;
  requester_email: string | null;
  requester_phone: string | null;
  request_type: 'access' | 'erasure' | 'other' | 'complaint';
  message: string | null;
  status: 'new' | 'in_progress' | 'completed';
  owner_notes: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  access:    'Access (SAR)',
  erasure:   'Erasure',
  complaint: 'Complaint',
  other:     'Other',
};

const STATUS_LABELS: Record<string, string> = {
  new:         'New',
  in_progress: 'In progress',
  completed:   'Completed',
};

const STATUS_CLASSES: Record<string, string> = {
  new:         'bg-amber/10 text-amber border-amber/30',
  in_progress: 'bg-good/10 text-good border-good/30',
  completed:   'bg-hairline/60 text-muted border-hairline',
};

function deadline(createdAt: string): { label: string; urgent: boolean; overdue: boolean } {
  const created = new Date(createdAt);
  // 1 month (calendar) for access/erasure; 30 days for complaints — both
  // effectively "respond within one month" per ICO guidance.
  const due = new Date(created);
  due.setMonth(due.getMonth() + 1);

  const now = new Date();
  const msLeft = due.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) return { label: `Overdue by ${-daysLeft}d`, urgent: false, overdue: true };
  if (daysLeft <= 7) return { label: `${daysLeft}d remaining`, urgent: true, overdue: false };
  return { label: `${daysLeft}d remaining`, urgent: false, overdue: false };
}

export default async function DataRequestsPage() {
  const { role } = await requireOwner();
  if (role !== 'owner') redirect('/login');

  const admin = getServerAdmin();
  const { data: requests, error } = await admin
    .from('data_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (requests ?? []) as DataRequest[];
  const openCount = rows.filter((r) => r.status !== 'completed').length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Data requests
        </h1>
        <p className="text-muted text-sm mt-1">
          GDPR data-subject requests and data-protection complaints. Respond
          within one month of receipt (ICO requirement).
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="num px-2 py-1 rounded-md bg-hairline/40 text-ink">
            {rows.length} total
          </span>
          {openCount > 0 && (
            <span className="num px-2 py-1 rounded-md bg-amber/10 text-amber border border-amber/30">
              {openCount} open
            </span>
          )}
        </div>
        <div className="mt-3 text-xs text-muted bg-amber/10 border border-amber/30 rounded-md px-3 py-2">
          <strong>Note:</strong> The legal wording for acknowledgement letters
          and responses needs solicitor sign-off before Sunline is live.
          This screen is the internal log and audit trail.
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm rounded-xl border border-hairline">
          No data requests yet. When a homeowner submits a request via the
          public form it will appear here.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((req) => {
            const dl = req.status !== 'completed' ? deadline(req.created_at) : null;
            const createdDate = new Date(req.created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            });

            return (
              <div
                key={req.id}
                className="card rounded-xl border border-hairline p-5 md:p-6 space-y-4"
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{req.requester_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded border bg-hairline/40 text-ink border-hairline">
                        {TYPE_LABELS[req.request_type] ?? req.request_type}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded border ${STATUS_CLASSES[req.status]}`}
                      >
                        {STATUS_LABELS[req.status]}
                      </span>
                      {dl && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${
                            dl.overdue
                              ? 'bg-bad/10 text-bad border-bad/30'
                              : dl.urgent
                              ? 'bg-amber/10 text-amber border-amber/30'
                              : 'bg-hairline/40 text-muted border-hairline'
                          }`}
                        >
                          {dl.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted mt-1 space-x-3">
                      <span>Received {createdDate}</span>
                      {req.requester_email && <span>{req.requester_email}</span>}
                      {req.requester_phone && <span>{req.requester_phone}</span>}
                    </div>
                  </div>
                </div>

                {/* Message */}
                {req.message && (
                  <div className="text-sm text-ink bg-bg rounded-md px-3 py-2 border border-hairline">
                    <span className="text-xs text-muted block mb-1">Requester message</span>
                    {req.message}
                  </div>
                )}

                {/* Erasure helper */}
                {req.request_type === 'erasure' && (
                  <div className="text-xs bg-amber/5 border border-amber/20 rounded-md px-3 py-2 text-amber">
                    <strong>Erasure request:</strong> find the matching lead(s)
                    in the{' '}
                    <Link
                      href={`/leads${req.requester_email ? `?q=${encodeURIComponent(req.requester_email)}` : req.requester_phone ? `?q=${encodeURIComponent(req.requester_phone)}` : ''}`}
                      className="underline underline-offset-2"
                    >
                      Leads screen
                    </Link>{' '}
                    and use the existing delete action. Once deleted, mark this
                    request Completed and log what was done below.
                  </div>
                )}

                {/* Update form */}
                <form action={updateDataRequest} className="space-y-3 pt-1">
                  <input type="hidden" name="id" value={req.id} />

                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-xs text-muted mb-1" htmlFor={`status-${req.id}`}>
                        Status
                      </label>
                      <select
                        id={`status-${req.id}`}
                        name="status"
                        defaultValue={req.status}
                        className="w-full border border-hairline rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40 bg-white"
                      >
                        <option value="new">New</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-muted mb-1" htmlFor={`notes-${req.id}`}>
                      Owner notes / audit log
                    </label>
                    <textarea
                      id={`notes-${req.id}`}
                      name="notes"
                      rows={3}
                      defaultValue={req.owner_notes ?? ''}
                      className="w-full border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40 resize-none"
                      placeholder="e.g. Acknowledged by email 2026-07-01. Lead ID abc123 deleted 2026-07-03. Response sent."
                    />
                  </div>

                  <button
                    type="submit"
                    className="text-xs px-3 py-1.5 rounded-md bg-amber text-white font-medium hover:bg-amber/90 transition-colors"
                  >
                    Save
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
