import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Leads' };

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { fmtMoney, fmtDate } from '@/lib/format';
import { PIPELINE_SHORT } from '@/lib/setter-cadence';
import { DEFAULT_PAGE_SIZE, pageRange, totalPages } from '@/lib/leads-list';

export const dynamic = 'force-dynamic';

type WorkableRow = {
  id: string;
  name: string | null;
  monthly_bill: number | null;
  created_at: string;
  no_answer_count: number;
  pipeline: number;
  total_count: number;
};

type SearchParams = { page?: string; q?: string; pipeline?: string };

export default async function AllLeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: userRow } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (userRow?.role === 'client') redirect('/portal');
  if (!userRow?.role) redirect('/login');

  const q = (searchParams.q ?? '').trim();
  const pipelineParam = searchParams.pipeline ?? '';
  const pipeline = ['1', '2', '3'].includes(pipelineParam) ? Number(pipelineParam) : null;
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  const { from } = pageRange(page, DEFAULT_PAGE_SIZE);

  const admin = getServerAdmin();
  const { data, error } = await admin.rpc('list_workable_leads', {
    p_search: q || null,
    p_pipeline: pipeline,
    p_limit: DEFAULT_PAGE_SIZE,
    p_offset: from,
  });
  if (error) throw error;

  const rows = (data ?? []) as WorkableRow[];
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const pages = totalPages(total, DEFAULT_PAGE_SIZE);

  const buildHref = (nextPage: number) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (pipeline) p.set('pipeline', String(pipeline));
    p.set('page', String(nextPage));
    return `/all-leads?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Leads</h1>
        <p className="text-muted text-sm mt-1">
          Every workable lead still in play. The auto-queue serves the freshest
          first — this list is here when you want to pick.
        </p>
      </header>

      {/* Search + filter (GET form → server-side, always paginated) */}
      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="q" className="block text-xs text-muted mb-1">Search by name</label>
          <input id="q" name="q" defaultValue={q} placeholder="e.g. Sarah"
            className="input w-full" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="pipeline" className="block text-xs text-muted mb-1">Pipeline</label>
          <select id="pipeline" name="pipeline" defaultValue={pipelineParam} className="input">
            <option value="">All</option>
            <option value="1">{PIPELINE_SHORT[1]}</option>
            <option value="2">{PIPELINE_SHORT[2]}</option>
            <option value="3">{PIPELINE_SHORT[3]}</option>
          </select>
        </div>
        <button type="submit"
          className="px-4 py-2 rounded-lg bg-ink text-white text-sm font-medium hover:bg-ink/80">
          Search
        </button>
        {(q || pipeline) && (
          <Link href="/all-leads" className="text-xs text-muted hover:text-ink underline underline-offset-2">
            Clear
          </Link>
        )}
      </form>

      <div className="text-xs text-muted num">
        {total === 0 ? 'No leads' : `${total} lead${total === 1 ? '' : 's'}`}
        {pages > 1 && ` · page ${page} of ${pages}`}
      </div>

      {/* List — minimal rows: name · bill · captured date */}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-hairline p-8 text-center text-sm text-muted">
          No workable leads match. Fresh leads appear here as they arrive.
        </div>
      ) : (
        <div className="rounded-xl border border-hairline overflow-hidden divide-y divide-hairline">
          {rows.map((r) => (
            <Link key={r.id} href={`/all-leads/${r.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-amber/[0.04] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.name ?? 'Unknown'}</div>
                <div className="text-xs text-muted num">Captured {fmtDate(r.created_at)}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide shrink-0
                ${r.pipeline === 1 ? 'bg-amber/15 text-amber'
                  : r.pipeline === 2 ? 'bg-blue-500/10 text-blue-600'
                  : 'bg-hairline text-muted'}`}>
                {PIPELINE_SHORT[r.pipeline as 1 | 2 | 3]}
              </span>
              <div className="text-sm num text-right w-24 shrink-0">
                {r.monthly_bill != null ? `${fmtMoney(r.monthly_bill)}/mo` : '—'}
              </div>
              <span className="text-muted shrink-0" aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      )}

      {/* Pager */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          {page > 1 ? (
            <Link href={buildHref(page - 1)}
              className="px-4 py-2 rounded-lg border border-hairline text-sm hover:border-ink/30">
              ‹ Previous
            </Link>
          ) : <span />}
          <span className="text-xs text-muted num">Page {page} of {pages}</span>
          {page < pages ? (
            <Link href={buildHref(page + 1)}
              className="px-4 py-2 rounded-lg border border-hairline text-sm hover:border-ink/30">
              Next ›
            </Link>
          ) : <span />}
        </div>
      )}
    </div>
  );
}
