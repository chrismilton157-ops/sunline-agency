'use server';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';
import { writeAudit, resolveActor } from '@/lib/audit';
import type { Outcome, QualityRating } from '@/lib/types';

const validOutcomes: Outcome[] = ['booked', 'sat', 'sold', 'no_show'];

export async function updateAppointmentOutcome(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const outcome = String(formData.get('outcome') ?? '') as Outcome;
  const clientId = String(formData.get('client_id') ?? '');
  const saleValueRaw = formData.get('sale_value');

  if (!id || !validOutcomes.includes(outcome)) return;

  const supabase = getServerSupabase();
  const actor = await resolveActor(supabase);

  // Fetch current outcome for before/after metadata.
  const { data: prev } = await supabase
    .from('appointments')
    .select('outcome, sale_value')
    .eq('id', id)
    .single();

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

  const saleNote = outcome === 'sold' && update.sale_value != null
    ? ` — sale value £${update.sale_value}`
    : '';
  await writeAudit({
    actor_id: actor.id,
    actor_role: actor.role,
    action_type: 'appointment.outcome_set',
    entity_type: 'appointment',
    entity_id: id,
    description: `Appointment outcome set to "${outcome}"${saleNote}`,
    metadata: { before: { outcome: prev?.outcome, sale_value: prev?.sale_value }, after: update },
  });

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
  const actor = await resolveActor(supabase);

  const { data: prev } = await supabase
    .from('appointments')
    .select('quality_rating')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('appointments')
    .update({ quality_rating: rating })
    .eq('id', id);
  if (error) throw error;

  await writeAudit({
    actor_id: actor.id,
    actor_role: actor.role,
    action_type: 'appointment.quality_set',
    entity_type: 'appointment',
    entity_id: id,
    description: `Appointment quality rating set to "${rating ?? 'cleared'}"`,
    metadata: { before: { quality_rating: prev?.quality_rating }, after: { quality_rating: rating } },
  });

  revalidatePath(`/clients/${clientId}`);
}
