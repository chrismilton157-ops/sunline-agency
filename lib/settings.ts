// Agency-wide configurable defaults, backed by the agency_settings table.
// Call getSettings() on the server (owner requests only); it falls back to
// the hardcoded defaults if the row is missing so the app keeps working even
// before the migration has run.

import { getServerSupabase } from '@/lib/supabase/server';

export const SETTINGS_DEFAULTS = {
  default_management_markup_pct: 20,
  default_per_sit_fee: 75,
  min_monthly_bill_gbp: 80,
  bill_band_80_120_rep: 100,
  bill_band_120_200_rep: 160,
  bill_band_200_plus_rep: 250,
  est_cost_per_lead: 40,
  lead_to_appt_rate: 0.3,
  // Adaptive routing (Phase adaptive)
  adaptive_routing_enabled: false,
  adaptive_min_sample: 20,
} as const;

export type AgencySettings = {
  default_management_markup_pct: number;
  default_per_sit_fee: number;
  min_monthly_bill_gbp: number;
  bill_band_80_120_rep: number;
  bill_band_120_200_rep: number;
  bill_band_200_plus_rep: number;
  est_cost_per_lead: number;
  lead_to_appt_rate: number;
  adaptive_routing_enabled: boolean;
  adaptive_min_sample: number;
};

const COLUMNS =
  'default_management_markup_pct, default_per_sit_fee, ' +
  'min_monthly_bill_gbp, bill_band_80_120_rep, bill_band_120_200_rep, ' +
  'bill_band_200_plus_rep, est_cost_per_lead, lead_to_appt_rate, ' +
  'adaptive_routing_enabled, adaptive_min_sample';

export async function getSettings(): Promise<AgencySettings> {
  const supabase = await getServerSupabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('agency_settings')
    .select(COLUMNS)
    .single() as { data: Record<string, unknown> | null };

  if (!data) return { ...SETTINGS_DEFAULTS };

  return {
    default_management_markup_pct: Number(data.default_management_markup_pct),
    default_per_sit_fee:           Number(data.default_per_sit_fee),
    min_monthly_bill_gbp:          Number(data.min_monthly_bill_gbp),
    bill_band_80_120_rep:          Number(data.bill_band_80_120_rep),
    bill_band_120_200_rep:         Number(data.bill_band_120_200_rep),
    bill_band_200_plus_rep:        Number(data.bill_band_200_plus_rep),
    est_cost_per_lead:             Number(data.est_cost_per_lead),
    lead_to_appt_rate:             Number(data.lead_to_appt_rate),
    adaptive_routing_enabled:      Boolean(data.adaptive_routing_enabled),
    adaptive_min_sample:           Number(data.adaptive_min_sample ?? 20),
  };
}
