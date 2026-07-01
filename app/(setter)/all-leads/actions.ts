'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { getServerAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { WORKABLE_STATUSES } from '@/lib/leads-list';

const STALE_MS = 30 * 60 * 1_000;

async function getStaffUser() {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: row } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (row?.role === 'client') throw new Error('Client accounts cannot work leads');
  return { user };
}

export type ClaimResult = 'claimed' | 'locked' | 'not_workable';

// Claim a lead to work it directly from the master list. The lock is enforced
// by a single atomic UPDATE whose WHERE clause only matches when the lead is
// workable, consented, and either unclaimed / already ours / stale — so two
// setters opening the same lead can never both win the claim.
export async function claimLeadForWork(leadId: string): Promise<ClaimResult> {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - STALE_MS).toISOString();

  const { data, error } = await admin
    .from('leads')
    .update({ queue_claimed_by: user.id, queue_claimed_at: nowIso })
    .eq('id', leadId)
    .eq('consent', true)
    .in('status', WORKABLE_STATUSES as unknown as string[])
    .or(
      `queue_claimed_by.is.null,queue_claimed_by.eq.${user.id},queue_claimed_at.lt.${staleIso}`,
    )
    .select('id, first_claimed_at');
  if (error) throw error;

  if (!data || data.length === 0) {
    // Work out why the claim didn't land, for a clearer message.
    const { data: cur } = await admin
      .from('leads')
      .select('status, consent, queue_claimed_by')
      .eq('id', leadId)
      .maybeSingle();
    if (
      !cur ||
      cur.consent !== true ||
      !(WORKABLE_STATUSES as unknown as string[]).includes(cur.status)
    ) {
      return 'not_workable';
    }
    return 'locked';
  }

  // Record first-ever claim (speed-to-lead metric) — mirrors serveNextLead.
  if (!data[0].first_claimed_at) {
    await admin
      .from('leads')
      .update({ first_claimed_by: user.id, first_claimed_at: nowIso })
      .eq('id', leadId)
      .is('first_claimed_at', null);
  }

  await writeAudit({
    actor_id: user.id,
    actor_role: 'setter',
    action_type: 'lead.claimed_from_list',
    entity_type: 'lead',
    entity_id: leadId,
    description: `Setter opened lead from master list (${user.email ?? user.id})`,
    metadata: { setter_id: user.id },
  });

  revalidatePath(`/all-leads/${leadId}`);
  return 'claimed';
}

// Release a lead claimed from the list (e.g. setter navigates away without
// dispositioning). Only clears the claim if it is still held by this setter.
export async function releaseWorkedLead(leadId: string): Promise<void> {
  const { user } = await getStaffUser();
  const admin = getServerAdmin();
  await admin
    .from('leads')
    .update({ queue_claimed_by: null, queue_claimed_at: null })
    .eq('id', leadId)
    .eq('queue_claimed_by', user.id);
  revalidatePath(`/all-leads/${leadId}`);
}
