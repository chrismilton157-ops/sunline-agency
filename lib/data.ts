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

// Merge per-client agency-only columns via service-role. Owner-only callers.
// Includes ad_spend_monthly (Phase 3 lockdown) and weekly_promise / priority
// (Phase 4 routing config) — none of these are in the authenticated SELECT
// grant set in migration 0004.
async function fetchAgencyClientCols(ids: string[]): Promise<
  Map<
    string,
    { ad_spend_monthly: number; weekly_promise: number; priority: number }
  >
> {
  if (ids.length === 0) return new Map();
  const admin = getServerAdmin();
  const { data, error } = await admin
    .from('clients')
    .select('id, ad_spend_monthly, weekly_promise, priority')
    .in('id', ids);
  if (error) throw error;
  const m = new Map<
    string,
    { ad_spend_monthly: number; weekly_promise: number; priority: number }
  >();
  for (const row of data ?? []) {
    m.set(row.id as string, {
      ad_spend_monthly: Number(row.ad_spend_monthly ?? 0),
      weekly_promise: Number(row.weekly_promise ?? 0),
      priority: Number(row.priority ?? 100),
    });
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

  const safeClients = (clientsRes.data ?? []) as ClientPublic[];
  const agencyCols = await fetchAgencyClientCols(safeClients.map((c) => c.id));
  const clients: Client[] = safeClients.map((c) => {
    const extra = agencyCols.get(c.id);
    return {
      ...c,
      ad_spend_monthly: extra?.ad_spend_monthly ?? 0,
      weekly_promise: extra?.weekly_promise ?? 0,
      priority: extra?.priority ?? 100,
    };
  });

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

  const agencyCols = await fetchAgencyClientCols([clientId]);
  const extra = agencyCols.get(clientId);
  const client: Client = {
    ...(cRes.data as ClientPublic),
    ad_spend_monthly: extra?.ad_spend_monthly ?? 0,
    weekly_promise: extra?.weekly_promise ?? 0,
    priority: extra?.priority ?? 100,
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

// ---------- Phase 4: routing loader ----------
//
// Loads everything the routing engine + owner Routing screen need:
//   - all active clients (with agency-only weekly_promise + priority)
//   - each client's covered postcode prefixes
//   - each client's leads-this-week count and last-lead timestamp
//   - the postcode_volume reference data
//
// Postcodes + volumes are agency-only (RLS denies clients), so the
// cookie-auth client works for owners. weekly_promise + priority are
// fetched via the same service-role merge as ad_spend_monthly.

import type { RoutingClient } from './routing';
import { weekBoundsUTC } from './routing';

export async function loadRoutingState(now: Date = new Date()) {
  const supabase = getServerSupabase();

  const [clientsRes, postcodesRes, volumesRes, leadsRes] = await Promise.all([
    supabase
      .from('clients')
      .select(CLIENT_SAFE_COLS)
      .eq('status', 'active')
      .order('company'),
    supabase
      .from('client_postcodes')
      .select('client_id, postcode_prefix')
      .order('postcode_prefix'),
    supabase
      .from('postcode_volume')
      .select('postcode_prefix, typical_weekly_leads')
      .order('postcode_prefix'),
    supabase
      .from('leads')
      .select('client_id, created_at')
      .order('created_at', { ascending: false }),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (postcodesRes.error) throw postcodesRes.error;
  if (volumesRes.error) throw volumesRes.error;
  if (leadsRes.error) throw leadsRes.error;

  const safeClients = (clientsRes.data ?? []) as ClientPublic[];
  const agencyCols = await fetchAgencyClientCols(safeClients.map((c) => c.id));

  const { start: weekStart } = weekBoundsUTC(now);
  const leads = (leadsRes.data ?? []) as { client_id: string; created_at: string }[];

  const postcodesByClient = new Map<string, string[]>();
  for (const row of (postcodesRes.data ?? []) as {
    client_id: string;
    postcode_prefix: string;
  }[]) {
    const list = postcodesByClient.get(row.client_id) ?? [];
    list.push(row.postcode_prefix);
    postcodesByClient.set(row.client_id, list);
  }

  const routingClients: RoutingClient[] = safeClients.map((c) => {
    const extra = agencyCols.get(c.id);
    const own = leads.filter((l) => l.client_id === c.id);
    const leadsThisWeek = own.filter(
      (l) => new Date(l.created_at).getTime() >= weekStart.getTime(),
    ).length;
    const lastLeadAt = own[0]?.created_at ?? null;
    return {
      id: c.id,
      company: c.company,
      weekly_promise: extra?.weekly_promise ?? 0,
      priority: extra?.priority ?? 100,
      joined_at: c.joined_at,
      leads_this_week: leadsThisWeek,
      last_lead_at: lastLeadAt,
      covered_postcodes: postcodesByClient.get(c.id) ?? [],
    };
  });

  return {
    routingClients,
    volumes: (volumesRes.data ?? []) as {
      postcode_prefix: string;
      typical_weekly_leads: number;
    }[],
    weekStart,
  };
}
