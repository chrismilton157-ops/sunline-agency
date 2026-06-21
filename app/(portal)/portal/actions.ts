'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import type { Outcome, QualityRating } from '@/lib/types';

// Identical RLS-safe pattern to the agency client-detail actions, but
// scoped to /portal so it revalidates the right page. The DB enforces
// that this can only touch the signed-in client's own appointments
// (RLS update policy with `client_id = auth_client_id()`).

const validOutcomes: Outcome[] = ['booked', 'sat', 'sold', 'no_show'];

export async function updateAppointmentOutcome(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const outcome = String(formData.get('outcome') ?? '') as Outcome;
  const saleValueRaw = formData.get('sale_value');

  if (!id || !validOutcomes.includes(outcome)) return;

  const supabase = getServerSupabase();
  const update: Record<string, unknown> = { outcome };
  if (outcome === 'sold' && saleValueRaw != null && saleValueRaw !== '') {
    const v = Number(saleValueRaw);
    if (Number.isFinite(v) && v >= 0) update.sale_value = v;
  } else if (outcome !== 'sold') {
    update.sale_value = null;
  }

  const { error } = await supabase
    .from('appointments')
    .update(update)
    .eq('id', id);
  if (error) throw error;

  revalidatePath('/portal');
}

export async function updateAppointmentQuality(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const ratingRaw = String(formData.get('rating') ?? '');

  const rating: QualityRating | null =
    ratingRaw === 'up' || ratingRaw === 'down'
      ? (ratingRaw as QualityRating)
      : null;

  if (!id) return;

  const supabase = getServerSupabase();
  const { error } = await supabase
    .from('appointments')
    .update({ quality_rating: rating })
    .eq('id', id);
  if (error) throw error;

  revalidatePath('/portal');
}
