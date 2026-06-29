'use server';

import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { loadRoutingState } from '@/lib/data';
import { clusterPromises, type RoutingClient } from '@/lib/routing';
import { revalidatePath } from 'next/cache';
import { writeAudit } from '@/lib/audit';

export type OverpromiseResult = {
  warnings: {
    postcode_prefix: string;
    typical_weekly_leads: number;
    total_promised: number;
  }[];
};

// Check over-promise for the postcodes + weekly_promise the wizard has entered,
// treating the new client as if it already existed.
export async function checkOverpromise(
  postcodes: string[],
  weeklyPromise: number,
): Promise<OverpromiseResult> {
  const { routingClients, volumes } = await loadRoutingState();

  // Synthesise a temporary client entry for the new (not-yet-created) installer.
  const newClient: RoutingClient = {
    id: '__new__',
    company: '(new client)',
    weekly_promise: weeklyPromise,
    priority: 100,
    joined_at: new Date().toISOString().slice(0, 10),
    leads_this_week: 0,
    last_lead_at: null,
    covered_postcodes: postcodes,
  };

  const clusters = clusterPromises([...routingClients, newClient], volumes);
  const warnings = clusters
    .filter((c) => c.warn)
    .map((c) => ({
      postcode_prefix: c.postcode_prefix,
      typical_weekly_leads: c.typical_weekly_leads,
      total_promised: c.total_promised,
    }));

  return { warnings };
}

export type CreateClientInput = {
  // Step 1
  company: string;
  contact: string;
  contactEmail: string;
  region: string;
  notes: string;
  // Step 2
  postcodes: string[];
  // Step 3
  weeklyPromise: number;
  perSitFee: number;
  managementMarkupPct: number;
  priority: number;
  // Step 5
  loginEmail: string;
  loginPassword: string;
};

export type CreateClientResult =
  | { ok: true; clientId: string; loginEmail: string; loginPassword: string }
  | { ok: false; error: string };

export async function createClient(
  input: CreateClientInput,
): Promise<CreateClientResult> {
  const { user, role } = await requireOwner();
  if (role !== 'owner') {
    return { ok: false, error: 'Owner access required.' };
  }

  const admin = getServerAdmin();

  // 1. Create the client row (all fields including agency-only).
  const { data: clientRow, error: clientErr } = await admin
    .from('clients')
    .insert({
      company: input.company.trim(),
      contact: input.contact.trim() || null,
      region: input.region.trim() || null,
      retainer: 0,
      per_sit_fee: input.perSitFee,
      ad_spend_monthly: 0,
      status: 'active',
      joined_at: new Date().toISOString().slice(0, 10),
      weekly_promise: input.weeklyPromise,
      priority: input.priority,
      management_markup_pct: input.managementMarkupPct,
    })
    .select('id')
    .single();

  if (clientErr || !clientRow) {
    return { ok: false, error: `Failed to create client: ${clientErr?.message ?? 'unknown error'}` };
  }

  const clientId = clientRow.id as string;

  // 2. Insert covered postcodes.
  if (input.postcodes.length > 0) {
    const { error: pcErr } = await admin.from('client_postcodes').insert(
      input.postcodes.map((p) => ({
        client_id: clientId,
        postcode_prefix: p.trim().toUpperCase(),
      })),
    );
    if (pcErr) {
      // Roll back client row on failure.
      await admin.from('clients').delete().eq('id', clientId);
      return { ok: false, error: `Failed to save postcodes: ${pcErr.message}` };
    }
  }

  // 3. Create the Supabase Auth user for the portal login.
  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: input.loginEmail.trim().toLowerCase(),
    password: input.loginPassword,
    email_confirm: true,
  });

  if (authErr || !authData?.user) {
    await admin.from('client_postcodes').delete().eq('client_id', clientId);
    await admin.from('clients').delete().eq('id', clientId);
    return { ok: false, error: `Failed to create portal login: ${authErr?.message ?? 'unknown error'}` };
  }

  const authUserId = authData.user.id;

  // 4. Insert the users row linking auth.users → clients.
  const { error: userErr } = await admin.from('users').insert({
    id: authUserId,
    email: input.loginEmail.trim().toLowerCase(),
    role: 'client',
    client_id: clientId,
  });

  if (userErr) {
    await admin.auth.admin.deleteUser(authUserId);
    await admin.from('client_postcodes').delete().eq('client_id', clientId);
    await admin.from('clients').delete().eq('id', clientId);
    return { ok: false, error: `Failed to link portal login: ${userErr.message}` };
  }

  revalidatePath('/clients');
  revalidatePath('/routing');

  await writeAudit({
    actor_id: user?.id ?? null,
    actor_role: 'owner',
    action_type: 'client.created',
    entity_type: 'client',
    entity_id: clientId,
    description: `Client created: ${input.company.trim()} (${input.region.trim() || 'no region'})`,
    metadata: {
      company: input.company.trim(),
      contact: input.contact.trim() || null,
      region: input.region.trim() || null,
      per_sit_fee: input.perSitFee,
      weekly_promise: input.weeklyPromise,
      priority: input.priority,
      postcodes: input.postcodes,
      login_email: input.loginEmail.trim().toLowerCase(),
    },
  });

  return {
    ok: true,
    clientId,
    loginEmail: input.loginEmail.trim().toLowerCase(),
    loginPassword: input.loginPassword,
  };
}
