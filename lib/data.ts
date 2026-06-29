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
  'id, client_id, lead_id, appt_date, setter, setter_id, outcome, sale_value, invoiced, quality_rating, quality_reason, confirmed_at';

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
type AgencyClientCols = {
  ad_spend_monthly: number;
  weekly_promise: number;
  priority: number;
  management_markup_pct: number;
};

async function fetchAgencyClientCols(
  ids: string[],
): Promise<Map<string, AgencyClientCols>> {
  if (ids.length === 0) return new Map();
  const admin = getServerAdmin();
  const { data, error } = await admin
    .from('clients')
    .select(
      'id, ad_spend_monthly, weekly_promise, priority, management_markup_pct',
    )
    .in('id', ids);
  if (error) throw error;
  const m = new Map<string, AgencyClientCols>();
  for (const row of data ?? []) {
    m.set(row.id as string, {
      ad_spend_monthly: Number(row.ad_spend_monthly ?? 0),
      weekly_promise: Number(row.weekly_promise ?? 0),
      priority: Number(row.priority ?? 100),
      management_markup_pct: Number(row.management_markup_pct ?? 20),
    });
  }
  return m;
}

export async function loadAll() {
  const supabase = getServerSupabase();
  const admin = getServerAdmin();
  const [clientsRes, apptsRes, leadsRes, allAgencyColsRes] = await Promise.all([
    supabase.from('clients').select(CLIENT_SAFE_COLS).order('company'),
    supabase
      .from('appointments')
      .select(APPT_COLS)
      .order('appt_date', { ascending: false }),
    supabase.from('leads').select(LEAD_COLS),
    admin
      .from('clients')
      .select('id, ad_spend_monthly, weekly_promise, priority, management_markup_pct'),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (apptsRes.error) throw apptsRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (allAgencyColsRes.error) throw allAgencyColsRes.error;

  const safeClients = (clientsRes.data ?? []) as ClientPublic[];
  const agencyCols = new Map<string, AgencyClientCols>();
  for (const row of allAgencyColsRes.data ?? []) {
    agencyCols.set(row.id as string, {
      ad_spend_monthly: Number(row.ad_spend_monthly ?? 0),
      weekly_promise: Number(row.weekly_promise ?? 0),
      priority: Number(row.priority ?? 100),
      management_markup_pct: Number(row.management_markup_pct ?? 20),
    });
  }
  const clients: Client[] = safeClients.map((c) => {
    const extra = agencyCols.get(c.id);
    return {
      ...c,
      ad_spend_monthly: extra?.ad_spend_monthly ?? 0,
      weekly_promise: extra?.weekly_promise ?? 0,
      priority: extra?.priority ?? 100,
      management_markup_pct: extra?.management_markup_pct ?? 20,
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
  const [cRes, aRes, lRes, agencyCols] = await Promise.all([
    supabase.from('clients').select(CLIENT_SAFE_COLS).eq('id', clientId).single(),
    supabase
      .from('appointments')
      .select(APPT_COLS)
      .eq('client_id', clientId)
      .order('appt_date', { ascending: false }),
    supabase.from('leads').select(LEAD_COLS).eq('client_id', clientId),
    fetchAgencyClientCols([clientId]),
  ]);

  if (cRes.error) throw cRes.error;
  if (aRes.error) throw aRes.error;
  if (lRes.error) throw lRes.error;

  const extra = agencyCols.get(clientId);
  const client: Client = {
    ...(cRes.data as ClientPublic),
    ad_spend_monthly: extra?.ad_spend_monthly ?? 0,
    weekly_promise: extra?.weekly_promise ?? 0,
    priority: extra?.priority ?? 100,
    management_markup_pct: extra?.management_markup_pct ?? 20,
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

  const leadsByClient = new Map<string, { client_id: string; created_at: string }[]>();
  for (const l of leads) {
    const list = leadsByClient.get(l.client_id) ?? [];
    list.push(l);
    leadsByClient.set(l.client_id, list);
  }

  const routingClients: RoutingClient[] = safeClients.map((c) => {
    const extra = agencyCols.get(c.id);
    const own = leadsByClient.get(c.id) ?? [];
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

// ---------- Phase 5: owner-side leads ----------
//
// Fetches every lead with full agency-only metadata (consent_at,
// routing_rule_fired, notes, etc). Uses the service-role admin client
// because those columns aren't in the column-level SELECT grant set up
// in 0006. Owner-only callers — middleware + layout guards ensure that.

import type { LeadOwner } from './types';

export async function loadOwnerLeads(): Promise<{
  leads: LeadOwner[];
  clientsById: Map<string, string>;
}> {
  const admin = getServerAdmin();
  const [leadsRes, clientsRes] = await Promise.all([
    admin
      .from('leads')
      .select(
        `id, client_id, campaign_id, name, phone, email, address, postcode,
         monthly_bill, is_homeowner, bill_payer, roof_suitable, finance_interest,
         consent, status, response_mins, created_at,
         notes, campaign_source, consent_at, consent_source,
         routing_rule_fired, data_retention_until`,
      )
      .order('created_at', { ascending: false }),
    admin.from('clients').select('id, company'),
  ]);
  if (leadsRes.error) throw leadsRes.error;
  if (clientsRes.error) throw clientsRes.error;

  const clientsById = new Map<string, string>();
  for (const c of clientsRes.data ?? []) clientsById.set(c.id, c.company);

  return {
    leads: (leadsRes.data ?? []) as LeadOwner[],
    clientsById,
  };
}

// ---------- Phase 6: owner-side invoices ----------
//
// Service-role fetch so we read the agency-only columns (ad_spend_raw,
// management_markup_pct_snapshot). Owner-only callers.

import type { InvoiceOwner } from './types';

export async function loadOwnerInvoices(): Promise<{
  invoices: InvoiceOwner[];
  clientsById: Map<string, string>;
}> {
  const admin = getServerAdmin();
  const [invRes, clientsRes] = await Promise.all([
    admin
      .from('invoices')
      .select(
        `id, client_id, period, advertising_management, appointment_count,
         appointment_fees, total, status, issued_at, paid_at,
         amount, paid, per_sit_fee_snapshot,
         ad_spend_raw, management_markup_pct_snapshot,
         created_at, updated_at`,
      )
      .order('period', { ascending: false })
      .order('created_at', { ascending: false }),
    admin.from('clients').select('id, company'),
  ]);
  if (invRes.error) throw invRes.error;
  if (clientsRes.error) throw clientsRes.error;

  const clientsById = new Map<string, string>();
  for (const c of clientsRes.data ?? []) clientsById.set(c.id, c.company);

  return {
    invoices: (invRes.data ?? []) as InvoiceOwner[],
    clientsById,
  };
}

// ---------- Phase 6: campaign attribution ----------

export type CampaignAttribution = {
  campaign_id: string;
  campaign_name: string;
  client_id: string;
  client_company: string;
  platform: string;
  ad_spend: number;     // raw — agency-only
  leads: number;
  appointments: number; // sat / sold / no-show
  sales: number;        // sold
  revenue: number;      // sum of sale_value where sold
  cost_per_lead: number | null;
  cost_per_appointment: number | null;
  cost_per_sale: number | null;
  roas: number | null;  // revenue / ad_spend
};

export async function loadCampaignAttribution(): Promise<CampaignAttribution[]> {
  const admin = getServerAdmin();
  const [campRes, leadsRes, apptsRes, clientsRes] = await Promise.all([
    admin.from('campaigns').select('id, client_id, name, platform, ad_spend'),
    admin
      .from('leads')
      .select('id, campaign_id, status'),
    admin
      .from('appointments')
      .select('id, lead_id, outcome, sale_value'),
    admin.from('clients').select('id, company'),
  ]);
  if (campRes.error) throw campRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (apptsRes.error) throw apptsRes.error;
  if (clientsRes.error) throw clientsRes.error;

  const clientsById = new Map<string, string>();
  for (const c of clientsRes.data ?? []) clientsById.set(c.id, c.company);

  const leadsByCamp = new Map<string, { id: string; status: string }[]>();
  for (const l of leadsRes.data ?? []) {
    if (!l.campaign_id) continue;
    const arr = leadsByCamp.get(l.campaign_id) ?? [];
    arr.push({ id: l.id, status: l.status });
    leadsByCamp.set(l.campaign_id, arr);
  }

  const apptsByLead = new Map<
    string,
    { outcome: string; sale_value: number | null }[]
  >();
  for (const a of apptsRes.data ?? []) {
    const arr = apptsByLead.get(a.lead_id) ?? [];
    arr.push({ outcome: a.outcome, sale_value: Number(a.sale_value ?? 0) });
    apptsByLead.set(a.lead_id, arr);
  }

  const safe = (n: number, d: number) => (d > 0 ? n / d : null);

  return (campRes.data ?? []).map((c) => {
    const leads = leadsByCamp.get(c.id) ?? [];
    let appointments = 0;
    let sales = 0;
    let revenue = 0;
    for (const l of leads) {
      const appts = apptsByLead.get(l.id) ?? [];
      for (const a of appts) {
        if (a.outcome === 'sat' || a.outcome === 'sold' || a.outcome === 'no_show') {
          appointments += 1;
        }
        if (a.outcome === 'sold') {
          sales += 1;
          revenue += a.sale_value ?? 0;
        }
      }
    }
    const ad_spend = Number(c.ad_spend ?? 0);
    return {
      campaign_id: c.id,
      campaign_name: c.name,
      client_id: c.client_id,
      client_company: clientsById.get(c.client_id) ?? '—',
      platform: c.platform,
      ad_spend,
      leads: leads.length,
      appointments,
      sales,
      revenue,
      cost_per_lead: safe(ad_spend, leads.length),
      cost_per_appointment: safe(ad_spend, appointments),
      cost_per_sale: safe(ad_spend, sales),
      roas: safe(revenue, ad_spend),
    };
  });
}

// ---------- Phase 7: shared-campaign allocation view ----------
//
// Loads everything the owner Allocation screen needs for a given period:
//   - every campaign (regional or single-client) with its client owner
//   - per-campaign recorded spend for the period (may be missing)
//   - every lead's campaign_id + client_id + created_at, so the pure
//     allocator in lib/allocation.ts can compute the split
// Service-role only — agency-only data.

import type {
  CampaignAllocation,
  CampaignSpend,
  LeadForAllocation,
} from './allocation';
import {
  allocateCampaignSpend,
  rollUpByClient,
} from './allocation';

export type AllocationCampaignRow = {
  campaign_id: string;
  campaign_name: string;
  platform: string;
  client_id: string | null;       // NULL = regional / shared
  client_company: string | null;  // null for regional
  is_regional: boolean;
};

export type AllocationView = {
  period: string;
  campaigns: AllocationCampaignRow[];
  spendByCampaign: Map<string, number>;
  allocations: CampaignAllocation[];
  clientsById: Map<string, string>;
  totalRecorded: number;
  totalAllocated: number;
  totalUnallocated: number;
  perClientTotals: Map<string, number>;
};

export async function loadAllocationView(
  period: string,
): Promise<AllocationView> {
  const admin = getServerAdmin();
  const [campRes, spendRes, leadsRes, clientsRes] = await Promise.all([
    admin
      .from('campaigns')
      .select('id, client_id, name, platform')
      .order('name'),
    admin
      .from('campaign_spend')
      .select('campaign_id, period, amount')
      .eq('period', period),
    admin
      .from('leads')
      .select('campaign_id, client_id, created_at'),
    admin.from('clients').select('id, company'),
  ]);
  if (campRes.error) throw campRes.error;
  if (spendRes.error) throw spendRes.error;
  if (leadsRes.error) throw leadsRes.error;
  if (clientsRes.error) throw clientsRes.error;

  const clientsById = new Map<string, string>();
  for (const c of clientsRes.data ?? []) {
    clientsById.set(c.id as string, c.company as string);
  }

  const campaigns: AllocationCampaignRow[] = (campRes.data ?? []).map((c) => ({
    campaign_id: c.id as string,
    campaign_name: c.name as string,
    platform: c.platform as string,
    client_id: (c.client_id as string | null) ?? null,
    client_company: c.client_id
      ? (clientsById.get(c.client_id as string) ?? null)
      : null,
    is_regional: c.client_id == null,
  }));

  const spendByCampaign = new Map<string, number>();
  for (const s of (spendRes.data ?? []) as CampaignSpend[]) {
    spendByCampaign.set(s.campaign_id, Number(s.amount ?? 0));
  }

  const leads: LeadForAllocation[] = (leadsRes.data ?? []).map((l) => ({
    campaign_id: l.campaign_id as string | null,
    client_id: l.client_id as string | null,
    created_at: String(l.created_at),
  }));

  // Only allocate for campaigns that have recorded spend in this period.
  const allocations = campaigns
    .filter((c) => spendByCampaign.has(c.campaign_id))
    .map((c) =>
      allocateCampaignSpend(
        c.campaign_id,
        period,
        spendByCampaign.get(c.campaign_id) ?? 0,
        leads,
      ),
    );

  const totalRecorded = Array.from(spendByCampaign.values()).reduce(
    (s, v) => s + v,
    0,
  );
  const totalUnallocated = allocations.reduce(
    (s, a) => s + a.unallocated_amount,
    0,
  );
  const totalAllocated = totalRecorded - totalUnallocated;

  const perClientTotals = new Map<string, number>();
  for (const r of rollUpByClient(allocations)) {
    perClientTotals.set(r.client_id, r.allocated_spend);
  }

  return {
    period,
    campaigns,
    spendByCampaign,
    allocations,
    clientsById,
    totalRecorded: round2(totalRecorded),
    totalAllocated: round2(totalAllocated),
    totalUnallocated: round2(totalUnallocated),
    perClientTotals,
  };
}

// Groups rows that carry a client_id into a Map for O(1) per-client lookup,
// instead of re-scanning the full array with .filter() per client.
export function groupByClientId<T extends { client_id: string | null }>(
  rows: T[],
): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const row of rows) {
    if (row.client_id == null) continue;
    const list = m.get(row.client_id) ?? [];
    list.push(row);
    m.set(row.client_id, list);
  }
  return m;
}

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

// ---------- Phase 6: portal invoice loader ----------
//
// The client portal reads invoices via the COOKIE-AUTH supabase client
// (RLS-enforced) and selects ONLY the safe columns from migration 0007.
// Agency-only columns (ad_spend_raw, management_markup_pct_snapshot)
// are not granted, so even if the request asked for them it would not
// return them.

import type { Invoice } from './types';

export async function loadPortalInvoices(clientId: string): Promise<Invoice[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from('invoices')
    .select(
      `id, client_id, period, advertising_management, appointment_count,
       appointment_fees, total, status, issued_at, paid_at,
       amount, paid, per_sit_fee_snapshot, created_at, updated_at`,
    )
    .eq('client_id', clientId)
    .order('period', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invoice[];
}
