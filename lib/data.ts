import 'server-only';
import { getServerSupabase } from './supabase/server';
import { getServerAdmin } from './supabase/admin';
import type { Appointment, Client, ClientPublic, Lead } from './types';
export type { ClientPublic };

// Columns that ARE readable by the authenticated role on the clients table.
// ad_spend_monthly is REVOKE'd at the DB level — fetched separately via
// the service-role client below.
const CLIENT_SAFE_COLS =
  'id, company, contact, region, retainer, per_sit_fee, status, joined_at';

const APPT_COLS =
  'id, client_id, lead_id, appt_date, setter, outcome, sale_value, invoiced, quality_rating, quality_reason, confirmed_at';

const LEAD_COLS = 'id, client_id, name, address, response_mins, consent';

export async function requireOwner() {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: null as null | string };

  const { data: row } = await supabase
    .from('users')
    .select('role, client_id')
    .eq('id', user.id)
    .single();

  return {
    supabase,
    user,
    role: row?.role ?? null,
    clientId: row?.client_id ?? null,
  };
}

export async function requireSession() {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, role: null, clientId: null };
  const { data: row } = await supabase
    .from('users')
    .select('role, client_id')
    .eq('id', user.id)
    .single();
  return {
    user,
    role: row?.role ?? null,
    clientId: (row?.client_id as string | null | undefined) ?? null,
  };
}

// Merge per-client ad_spend_monthly via service-role. Owner-only callers.
async function fetchAdSpendByClientId(
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const admin = getServerAdmin();
  const { data, error } = await admin
    .from('clients')
    .select('id, ad_spend_monthly')
    .in('id', ids);
  if (error) throw error;
  const m = new Map<string, number>();
  for (const row of data ?? []) {
    m.set(row.id as string, Number(row.ad_spend_monthly ?? 0));
  }
  return m;
}

export async function loadAll() {
  const supabase = getServerSupabase();
  const [clientsRes, apptsRes, leadsRes] = await Promise.all([
    supabase.from('clients').select(CLIENT_SAFE_COLS).order('company'),
    supabase
      .from('appointments')
      .select(APPT_COLS)
      .order('appt_date', { ascending: false }),
    supabase.from('leads').select(LEAD_COLS),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (apptsRes.error) throw apptsRes.error;
  if (leadsRes.error) throw leadsRes.error;

  const safeClients = (clientsRes.data ?? []) as Omit<Client, 'ad_spend_monthly'>[];
  const ads = await fetchAdSpendByClientId(safeClients.map((c) => c.id));
  const clients: Client[] = safeClients.map((c) => ({
    ...c,
    ad_spend_monthly: ads.get(c.id) ?? 0,
  }));

  return {
    clients,
    appointments: (apptsRes.data ?? []) as Appointment[],
    leads: (leadsRes.data ?? []) as Lead[],
  };
}

export async function loadClient(clientId: string) {
  const supabase = getServerSupabase();
  const [cRes, aRes, lRes] = await Promise.all([
    supabase.from('clients').select(CLIENT_SAFE_COLS).eq('id', clientId).single(),
    supabase
      .from('appointments')
      .select(APPT_COLS)
      .eq('client_id', clientId)
      .order('appt_date', { ascending: false }),
    supabase.from('leads').select(LEAD_COLS).eq('client_id', clientId),
  ]);

  if (cRes.error) throw cRes.error;
  if (aRes.error) throw aRes.error;
  if (lRes.error) throw lRes.error;

  const ads = await fetchAdSpendByClientId([clientId]);
  const client: Client = {
    ...(cRes.data as Omit<Client, 'ad_spend_monthly'>),
    ad_spend_monthly: ads.get(clientId) ?? 0,
  };

  return {
    client,
    appointments: (aRes.data ?? []) as Appointment[],
    leads: (lRes.data ?? []) as Lead[],
  };
}

// ---------- Portal-side loader ----------
// Reads ONLY the current client's data, ONLY via the cookie-auth client
// (RLS enforced). Never selects ad_spend_monthly or any other agency-only
// column. Returns a `ClientPublic` (no ad_spend field at all) so the
// portal cannot accidentally surface it.

export async function loadPortalForClient(clientId: string) {
  const supabase = getServerSupabase();
  const [cRes, aRes, lRes, iRes] = await Promise.all([
    supabase.from('clients').select(CLIENT_SAFE_COLS).eq('id', clientId).single(),
    supabase
      .from('appointments')
      .select(APPT_COLS)
      .eq('client_id', clientId)
      .order('appt_date', { ascending: false }),
    supabase.from('leads').select(LEAD_COLS).eq('client_id', clientId),
    supabase
      .from('invoices')
      .select('id, period, amount, paid, created_at')
      .eq('client_id', clientId)
      .order('period', { ascending: false }),
  ]);

  if (cRes.error) throw cRes.error;
  if (aRes.error) throw aRes.error;
  if (lRes.error) throw lRes.error;
  if (iRes.error) throw iRes.error;

  return {
    client: cRes.data as ClientPublic,
    appointments: (aRes.data ?? []) as Appointment[],
    leads: (lRes.data ?? []) as Lead[],
    invoices: (iRes.data ?? []) as {
      id: string;
      period: string;
      amount: number;
      paid: boolean;
      created_at: string;
    }[],
  };
}
