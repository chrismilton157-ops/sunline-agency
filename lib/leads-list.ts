// Pure helpers for the setter master leads list — mirror the SQL rules in the
// list_workable_leads RPC so the same "workable" definition is tested in TS.

import { computePipeline, type Pipeline } from './setter-cadence';

// Rows still in play: never-contacted or partly-worked, but NOT booked and NOT
// disqualified (a booked/cancelled-out lead sits in 'booked'; a dead lead sits
// in 'disqualified'). Consent is required separately — a setter can't dial
// without it, so the list only ever shows consented leads.
export const WORKABLE_STATUSES = ['new', 'contacted', 'qualified'] as const;

export type WorkableStatus = (typeof WORKABLE_STATUSES)[number];

export function isWorkableStatus(status: string): boolean {
  return (WORKABLE_STATUSES as readonly string[]).includes(status);
}

export type MinimalLead = {
  id: string;
  name: string | null;
  monthly_bill: number | null;
  created_at: string;
  no_answer_count: number;
  consent?: boolean;
  status: string;
};

/** True if a lead belongs in the master list (workable + consented). */
export function isWorkableLead(l: MinimalLead): boolean {
  if (l.consent === false) return false;
  return isWorkableStatus(l.status);
}

/** Filter + optional name-search + optional pipeline filter (pure mirror of RPC). */
export function filterWorkableLeads(
  leads: MinimalLead[],
  opts: { search?: string | null; pipeline?: Pipeline | null; now?: Date } = {},
): MinimalLead[] {
  const search = (opts.search ?? '').trim().toLowerCase();
  const now = opts.now ?? new Date();
  return leads.filter((l) => {
    if (!isWorkableLead(l)) return false;
    if (search && !(l.name ?? '').toLowerCase().includes(search)) return false;
    if (opts.pipeline != null) {
      const p = computePipeline(new Date(l.created_at), l.no_answer_count, now);
      if (p !== opts.pipeline) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 25;

export type PageParams = { page: number; pageSize: number; from: number; to: number };

/** Clamp a 1-based page + size into a safe { from, to } range for .range(). */
export function pageRange(page: number, pageSize = DEFAULT_PAGE_SIZE): PageParams {
  const safeSize = Math.max(1, Math.floor(pageSize));
  const safePage = Math.max(1, Math.floor(page) || 1);
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;
  return { page: safePage, pageSize: safeSize, from, to };
}

/** Total number of pages for a given row count (at least 1). */
export function totalPages(count: number, pageSize = DEFAULT_PAGE_SIZE): number {
  const safeSize = Math.max(1, Math.floor(pageSize));
  return Math.max(1, Math.ceil(count / safeSize));
}

// ---------------------------------------------------------------------------
// Locking — mirror of the atomic claim guard used when opening a lead profile
// ---------------------------------------------------------------------------

const STALE_CLAIM_MS = 30 * 60 * 1_000;

export type ClaimState = {
  status: string;
  consent: boolean;
  queue_claimed_by: string | null;
  queue_claimed_at: string | null;
};

/**
 * Pure decision for whether `setterId` may claim a lead to work it from the
 * list. A lead is claimable if it's workable + consented and either unclaimed,
 * already claimed by this setter, or the existing claim has gone stale. This is
 * the same predicate encoded in the atomic UPDATE guard in the claim action.
 */
export function canClaimLead(
  lead: ClaimState,
  setterId: string,
  now: Date = new Date(),
): boolean {
  if (!lead.consent) return false;
  if (!isWorkableStatus(lead.status)) return false;
  if (!lead.queue_claimed_by) return true;
  if (lead.queue_claimed_by === setterId) return true;
  if (!lead.queue_claimed_at) return false;
  return now.getTime() - new Date(lead.queue_claimed_at).getTime() > STALE_CLAIM_MS;
}
