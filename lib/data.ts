import 'server-only';
import { getServerSupabase } from './supabase/server';
import type { Appointment, Client, Lead } from './types';

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

  return { supabase, user, role: row?.role ?? null, clientId: row?.client_id ?? null };
}

export async function loadAll() {
  const supabase = getServerSupabase();
  const [clientsRes, apptsRes, leadsRes] = await Promise.all([
    supabase
      .from('clients')
      .select(
        'id, company, contact, region, retainer, per_sit_fee, ad_spend_monthly, status, joined_at',
      )
      .order('company'),
    supabase
      .from('appointments')
      .select(
        'id, client_id, lead_id, appt_date, setter, outcome, sale_value, invoiced, quality_rating, quality_reason',
      )
      .order('appt_date', { ascending: false }),
    supabase
      .from('leads')
      .select('id, client_id, name, address, response_mins, consent'),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (apptsRes.error) throw apptsRes.error;
  if (leadsRes.error) throw leadsRes.error;

  return {
    clients: (clientsRes.data ?? []) as Client[],
    appointments: (apptsRes.data ?? []) as Appointment[],
    leads: (leadsRes.data ?? []) as Lead[],
  };
}

export async function loadClient(clientId: string) {
  const supabase = getServerSupabase();
  const [cRes, aRes, lRes] = await Promise.all([
    supabase
      .from('clients')
      .select(
        'id, company, contact, region, retainer, per_sit_fee, ad_spend_monthly, status, joined_at',
      )
      .eq('id', clientId)
      .single(),
    supabase
      .from('appointments')
      .select(
        'id, client_id, lead_id, appt_date, setter, outcome, sale_value, invoiced, quality_rating, quality_reason',
      )
      .eq('client_id', clientId)
      .order('appt_date', { ascending: false }),
    supabase
      .from('leads')
      .select('id, client_id, name, address, response_mins, consent')
      .eq('client_id', clientId),
  ]);

  if (cRes.error) throw cRes.error;
  if (aRes.error) throw aRes.error;
  if (lRes.error) throw lRes.error;

  return {
    client: cRes.data as Client,
    appointments: (aRes.data ?? []) as Appointment[],
    leads: (lRes.data ?? []) as Lead[],
  };
}
