'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/data';
import { getServerSupabase } from '@/lib/supabase/server';
import { SETTINGS_DEFAULTS, getSettings } from '@/lib/settings';
import { writeAudit } from '@/lib/audit';

function parsePositiveNum(v: FormDataEntryValue | null, max?: number): number | null {
  const n = parseFloat(String(v ?? ''));
  if (!isFinite(n) || n < 0) return null;
  if (max !== undefined && n > max) return null;
  return n;
}

export async function saveSettings(formData: FormData) {
  const { user, role } = await requireOwner();
  if (role !== 'owner') throw new Error('Forbidden');

  const markup      = parsePositiveNum(formData.get('default_management_markup_pct'), 100);
  const perSit      = parsePositiveNum(formData.get('default_per_sit_fee'));
  const minBill     = parsePositiveNum(formData.get('min_monthly_bill_gbp'));
  const rep80       = parsePositiveNum(formData.get('bill_band_80_120_rep'));
  const rep120      = parsePositiveNum(formData.get('bill_band_120_200_rep'));
  const rep200      = parsePositiveNum(formData.get('bill_band_200_plus_rep'));
  const cpl         = parsePositiveNum(formData.get('est_cost_per_lead'));
  const rate        = parsePositiveNum(formData.get('lead_to_appt_rate'), 100);
  const minSample   = parsePositiveNum(formData.get('adaptive_min_sample'));
  const adaptiveOn  = formData.get('adaptive_routing_enabled') === 'true';

  if (
    markup === null || perSit === null || minBill === null ||
    rep80 === null || rep120 === null || rep200 === null ||
    cpl === null || rate === null || minSample === null
  ) {
    redirect('/settings?error=One+or+more+values+are+invalid.');
  }

  const before = await getSettings();

  const supabase = await getServerSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('agency_settings')
    .upsert({
      id: 1,
      default_management_markup_pct:  markup,
      default_per_sit_fee:            perSit,
      min_monthly_bill_gbp:           minBill,
      bill_band_80_120_rep:           rep80,
      bill_band_120_200_rep:          rep120,
      bill_band_200_plus_rep:         rep200,
      est_cost_per_lead:              cpl,
      lead_to_appt_rate:              rate / 100,
      adaptive_routing_enabled:       adaptiveOn,
      adaptive_min_sample:            Math.round(minSample),
      updated_at:                     new Date().toISOString(),
    });

  if (error) redirect('/settings?error=Could+not+save+settings+%E2%80%94+please+try+again.');

  await writeAudit({
    actor_id: user?.id ?? null,
    actor_role: 'owner',
    action_type: 'settings.changed',
    entity_type: 'settings',
    entity_id: '1',
    description: 'Agency settings updated',
    metadata: {
      before,
      after: {
        default_management_markup_pct: markup,
        default_per_sit_fee:           perSit,
        min_monthly_bill_gbp:          minBill,
        bill_band_80_120_rep:          rep80,
        bill_band_120_200_rep:         rep120,
        bill_band_200_plus_rep:        rep200,
        est_cost_per_lead:             cpl,
        lead_to_appt_rate:             (rate / 100),
        adaptive_routing_enabled:      adaptiveOn,
        adaptive_min_sample:           Math.round(minSample),
      },
    },
  });

  revalidatePath('/settings');
  revalidatePath('/billing');
  revalidatePath('/clients/new');
  revalidatePath('/routing');
  redirect('/settings?saved=1');
}

export async function resetSettings() {
  const { user, role } = await requireOwner();
  if (role !== 'owner') throw new Error('Forbidden');

  const before = await getSettings();
  const d = SETTINGS_DEFAULTS;
  const supabase = await getServerSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('agency_settings')
    .upsert({
      id: 1,
      default_management_markup_pct: d.default_management_markup_pct,
      default_per_sit_fee:           d.default_per_sit_fee,
      min_monthly_bill_gbp:          d.min_monthly_bill_gbp,
      bill_band_80_120_rep:          d.bill_band_80_120_rep,
      bill_band_120_200_rep:         d.bill_band_120_200_rep,
      bill_band_200_plus_rep:        d.bill_band_200_plus_rep,
      est_cost_per_lead:             d.est_cost_per_lead,
      lead_to_appt_rate:             d.lead_to_appt_rate,
      adaptive_routing_enabled:      d.adaptive_routing_enabled,
      adaptive_min_sample:           d.adaptive_min_sample,
      updated_at:                    new Date().toISOString(),
    });

  if (error) redirect('/settings?error=Could+not+reset+settings+%E2%80%94+please+try+again.');

  await writeAudit({
    actor_id: user?.id ?? null,
    actor_role: 'owner',
    action_type: 'settings.reset',
    entity_type: 'settings',
    entity_id: '1',
    description: 'Agency settings reset to defaults',
    metadata: { before, after: d },
  });

  revalidatePath('/settings');
  revalidatePath('/billing');
  revalidatePath('/clients/new');
  redirect('/settings?reset=1');
}
