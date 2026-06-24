'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';

const PERIOD_RE = /^\d{4}-\d{2}$/;

async function ownerOrThrow() {
  const { role } = await requireOwner();
  if (role !== 'owner') throw new Error('Forbidden');
}

// Record or update the campaign's spend for a given period. Idempotent
// per (campaign, period). Setting amount to 0 keeps the row — owner can
// then decide whether to delete it via the remove form below.
export async function recordCampaignSpend(formData: FormData) {
  await ownerOrThrow();
  const campaign_id = String(formData.get('campaign_id') ?? '').trim();
  const period = String(formData.get('period') ?? '').trim();
  const amountRaw = String(formData.get('amount') ?? '').trim();
  const amount = Number(amountRaw);

  if (!campaign_id) throw new Error('campaign_id required');
  if (!PERIOD_RE.test(period)) {
    redirect(`/allocation?period=${encodeURIComponent(period)}&error=Pick+a+valid+period.`);
  }
  if (!Number.isFinite(amount) || amount < 0) {
    redirect(`/allocation?period=${encodeURIComponent(period)}&error=Amount+must+be+%E2%89%A5+0.`);
  }

  const admin = getServerAdmin();
  // upsert on (campaign_id, period)
  const { error } = await admin
    .from('campaign_spend')
    .upsert(
      { campaign_id, period, amount },
      { onConflict: 'campaign_id,period' },
    );
  if (error) throw error;

  revalidatePath('/allocation');
  revalidatePath('/billing');
  redirect(`/allocation?period=${encodeURIComponent(period)}&saved=1`);
}

export async function removeCampaignSpend(formData: FormData) {
  await ownerOrThrow();
  const campaign_id = String(formData.get('campaign_id') ?? '').trim();
  const period = String(formData.get('period') ?? '').trim();
  if (!campaign_id || !PERIOD_RE.test(period)) {
    throw new Error('campaign_id and valid period required');
  }

  const admin = getServerAdmin();
  const { error } = await admin
    .from('campaign_spend')
    .delete()
    .eq('campaign_id', campaign_id)
    .eq('period', period);
  if (error) throw error;

  revalidatePath('/allocation');
  revalidatePath('/billing');
  redirect(`/allocation?period=${encodeURIComponent(period)}&removed=1`);
}
