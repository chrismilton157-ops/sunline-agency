// Server-only: fetches raw data from Supabase and builds AdaptiveMetrics.
// Uses the service-role client (owner-only path) so it can join across tables.
import 'server-only';
import { getServerAdmin } from '@/lib/supabase/admin';
import { getSettings } from '@/lib/settings';
import {
  buildLearnedRates,
  type AdaptiveMetrics,
  type RawApptRow,
  type RawLeadRow,
} from '@/lib/adaptive-routing';

// Typical close rate = sold ÷ sat. Agency default comes from settings
// (lead_to_appt_rate is lead→appt; we use a sensible close-rate default of ~50%).
const AGENCY_DEFAULT_CLOSE_RATE = 0.5;

export async function loadAdaptiveMetrics(): Promise<AdaptiveMetrics> {
  const admin = getServerAdmin();
  const settings = await getSettings();

  // Fetch clients (for names + IDs)
  const { data: clientRows } = await admin
    .from('clients')
    .select('id, company')
    .order('company');

  const clientList = (clientRows ?? []) as { id: string; company: string }[];

  // Fetch all appointments (outcomes only — no PII)
  const { data: apptRows } = await admin
    .from('appointments')
    .select('client_id, outcome');

  const appts: RawApptRow[] = (apptRows ?? []).map((r: Record<string, unknown>) => ({
    client_id: String(r.client_id),
    outcome: String(r.outcome),
  }));

  // Fetch leads with postcode + status + appointment existence
  // Join to appointments to get whether the lead became an appointment and what outcome
  const { data: leadRows } = await admin
    .from('leads')
    .select('client_id, postcode, status, appointments(outcome)')
    .neq('status', 'disqualified');

  const leads: RawLeadRow[] = (leadRows ?? []).map((r: Record<string, unknown>) => {
    const apptArr = Array.isArray(r.appointments) ? r.appointments : [];
    const firstAppt = apptArr[0] as { outcome: string } | undefined;
    return {
      client_id: (r.client_id as string | null) ?? null,
      postcode: (r.postcode as string | null) ?? null,
      status: String(r.status),
      has_appointment: apptArr.length > 0,
      appointment_outcome: firstAppt?.outcome ?? null,
    };
  });

  const { clients, postcodes } = buildLearnedRates(
    appts,
    leads,
    clientList,
    settings.adaptive_min_sample,
    AGENCY_DEFAULT_CLOSE_RATE,
    settings.lead_to_appt_rate,
  );

  return {
    clients,
    postcodes,
    min_sample: settings.adaptive_min_sample,
    agency_default_close_rate: AGENCY_DEFAULT_CLOSE_RATE,
    agency_default_lead_to_appt_rate: settings.lead_to_appt_rate,
  };
}
