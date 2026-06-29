'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import {
  appointmentsInPeriod,
  computeInvoice,
  type InvoiceStatus,
} from '@/lib/billing';
import { getSettings } from '@/lib/settings';
import {
  allocateCampaignSpend,
  rollUpByClient,
  type LeadForAllocation,
} from '@/lib/allocation';
import type { Appointment } from '@/lib/types';
import { writeAudit } from '@/lib/audit';

const PERIOD_RE = /^\d{4}-\d{2}$/;

async function ownerOrThrow() {
  const { role } = await requireOwner();
  if (role !== 'owner') throw new Error('Forbidden');
}

// Generate (or refresh DRAFT) invoices for every active client in the
// chosen period. Idempotent — re-running updates draft rows only;
// issued / paid invoices are never touched, even on regenerate.
export async function generateInvoices(formData: FormData) {
  await ownerOrThrow();
  const period = String(formData.get('period') ?? '').trim();
  if (!PERIOD_RE.test(period)) {
    redirect('/billing?error=Pick+a+valid+period+(YYYY-MM).');
  }

  const admin = getServerAdmin();
  const agencySettings = await getSettings();
  const [clientsRes, apptsRes, existingRes, spendRes, leadsRes] =
    await Promise.all([
      admin
        .from('clients')
        .select(
          'id, per_sit_fee, ad_spend_monthly, management_markup_pct',
        )
        .eq('status', 'active'),
      admin
        .from('appointments')
        .select(
          'id, client_id, lead_id, appt_date, setter, outcome, sale_value, invoiced, quality_rating, quality_reason, confirmed_at',
        ),
      admin
        .from('invoices')
        .select('id, client_id, status')
        .eq('period', period),
      admin
        .from('campaign_spend')
        .select('campaign_id, period, amount')
        .eq('period', period),
      admin
        .from('leads')
        .select('campaign_id, client_id, created_at'),
    ]);
  if (clientsRes.error) throw clientsRes.error;
  if (apptsRes.error) throw apptsRes.error;
  if (existingRes.error) throw existingRes.error;
  if (spendRes.error) throw spendRes.error;
  if (leadsRes.error) throw leadsRes.error;

  // Run the campaign-level allocation once for the whole period, then
  // roll it up to a per-client total so each client gets the sum of
  // their shares across every campaign they received leads from.
  const leadsForAllocation: LeadForAllocation[] = (leadsRes.data ?? []).map(
    (l) => ({
      campaign_id: l.campaign_id as string | null,
      client_id: l.client_id as string | null,
      created_at: String(l.created_at),
    }),
  );
  const campaignAllocations = (spendRes.data ?? []).map((s) =>
    allocateCampaignSpend(
      s.campaign_id as string,
      period,
      Number(s.amount ?? 0),
      leadsForAllocation,
    ),
  );
  const allocatedByClient = new Map<string, number>();
  for (const r of rollUpByClient(campaignAllocations)) {
    allocatedByClient.set(r.client_id, r.allocated_spend);
  }

  const lockedClientIds = new Set(
    (existingRes.data ?? [])
      .filter((i) => i.status === 'issued' || i.status === 'paid')
      .map((i) => i.client_id),
  );
  const draftIdByClient = new Map<string, string>();
  for (const i of existingRes.data ?? []) {
    if (i.status === 'draft') draftIdByClient.set(i.client_id, i.id);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const c of clientsRes.data ?? []) {
    if (lockedClientIds.has(c.id)) {
      skipped += 1;
      continue;
    }

    const appts = appointmentsInPeriod(
      ((apptsRes.data ?? []) as Appointment[]).filter(
        (a) => a.client_id === c.id,
      ),
      period,
    );

    // Phase 7: ad spend now comes from the campaign-level allocation,
    // not the per-client ad_spend_monthly field. A client with no
    // assigned leads from any spent-on campaign in the period gets
    // £0 ad spend on their invoice — which is correct.
    const allocated = allocatedByClient.get(c.id) ?? 0;

    const b = computeInvoice({
      ad_spend_monthly: allocated,
      management_markup_pct:
        Number(c.management_markup_pct ?? agencySettings.default_management_markup_pct),
      per_sit_fee: Number(c.per_sit_fee ?? 0),
      appointments_in_period: appts,
    });

    const row = {
      client_id: c.id,
      period,
      status: 'draft' as InvoiceStatus,
      advertising_management: b.advertising_management,
      appointment_count: b.appointment_count,
      appointment_fees: b.appointment_fees,
      total: b.total,
      per_sit_fee_snapshot: b.per_sit_fee_snapshot,
      ad_spend_raw: b.ad_spend_raw,
      management_markup_pct_snapshot: b.management_markup_pct_snapshot,
      // legacy mirrors — keep populated so anything reading `amount`
      // / `paid` (old code, exports, third-party queries) still works.
      amount: b.total,
      paid: false,
    };

    const existingId = draftIdByClient.get(c.id);
    if (existingId) {
      const { error } = await admin
        .from('invoices')
        .update(row)
        .eq('id', existingId);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await admin.from('invoices').insert(row);
      if (error) throw error;
      created += 1;
    }
  }

  revalidatePath('/billing');
  revalidatePath('/overview');
  revalidatePath('/clients');
  revalidatePath('/allocation');
  revalidatePath('/portal/billing', 'layout');

  const { user } = await requireOwner();
  await writeAudit({
    actor_id: user?.id ?? null,
    actor_role: 'owner',
    action_type: 'invoice.generated',
    entity_type: 'invoice',
    entity_id: null,
    description: `Invoices generated for period ${period}: ${created} created, ${updated} updated, ${skipped} skipped`,
    metadata: { period, created, updated, skipped },
  });

  const qs = new URLSearchParams({
    period,
    created: String(created),
    updated: String(updated),
    skipped: String(skipped),
  });
  redirect(`/billing?${qs.toString()}`);
}

export async function setInvoiceStatus(formData: FormData) {
  const { user } = await requireOwner();
  const id = String(formData.get('id') ?? '').trim();
  const next = String(formData.get('status') ?? '').trim() as InvoiceStatus;
  if (!id || !['draft', 'issued', 'paid'].includes(next)) {
    throw new Error('bad status');
  }

  const admin = getServerAdmin();

  // Fetch current status for audit before/after.
  const { data: prev } = await admin
    .from('invoices')
    .select('status, client_id, period')
    .eq('id', id)
    .single();

  const update: Record<string, unknown> = { status: next };
  if (next === 'issued') {
    update.issued_at = new Date().toISOString();
    update.paid = false;
  }
  if (next === 'paid') {
    update.paid_at = new Date().toISOString();
    update.paid = true;
  }
  if (next === 'draft') {
    update.issued_at = null;
    update.paid_at = null;
    update.paid = false;
  }

  const { error } = await admin
    .from('invoices')
    .update(update)
    .eq('id', id);
  if (error) throw error;

  const label = next === 'issued' ? 'issued' : next === 'paid' ? 'marked paid' : 'reset to draft';
  await writeAudit({
    actor_id: user?.id ?? null,
    actor_role: 'owner',
    action_type: `invoice.${next}`,
    entity_type: 'invoice',
    entity_id: id,
    description: `Invoice ${label} — period ${prev?.period ?? '?'}`,
    metadata: { before: { status: prev?.status }, after: { status: next }, client_id: prev?.client_id },
  });

  revalidatePath('/billing');
  revalidatePath('/overview');
  revalidatePath('/portal/billing', 'layout');
}
