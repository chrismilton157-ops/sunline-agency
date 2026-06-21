'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import type { Outcome, QualityRating } from '@/lib/types';

const validOutcomes: Outcome[] = ['booked', 'sat', 'sold', 'no_show'];

export async function updateAppointmentOutcome(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const outcome = String(formData.get('outcome') ?? '') as Outcome;
  const clientId = String(formData.get('client_id') ?? '');
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

  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/overview');
  revalidatePath('/clients');
}

export async function updateAppointmentQuality(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const ratingRaw = String(formData.get('rating') ?? '');
  const clientId = String(formData.get('client_id') ?? '');

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

  revalidatePath(`/clients/${clientId}`);
}
