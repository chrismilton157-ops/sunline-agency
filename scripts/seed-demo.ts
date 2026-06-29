/**
 * Demo client seed.
 * Creates the demo@sunline.test auth user, Demo Solar Co client row,
 * and ~21 months of realistic dummy appointments/invoices.
 *
 * Idempotent: safe to re-run. Deletes and recreates all demo rows so
 * the data is always reset to its pristine impressive state.
 * Run: npm run seed:demo
 *
 * Requires the same .env as seed.ts plus:
 *   DEMO_CLIENT_EMAIL   (default: demo@sunline.test)
 *   DEMO_CLIENT_PASSWORD
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url             = required('SUPABASE_URL');
const serviceKey      = required('SUPABASE_SERVICE_ROLE_KEY');
const demoEmail       = process.env.DEMO_CLIENT_EMAIL    ?? 'demo@sunline.test';
const demoPassword    = required('DEMO_CLIENT_PASSWORD');

// Fixed UUID for the demo client — keeps the script idempotent without
// relying on ordering or ON CONFLICT on text fields.
const DEMO_CLIENT_ID = 'd0e00001-0000-4000-8000-000000000001';

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('→ Ensuring demo auth user exists');
  const demoUserId = await ensureAuthUser(demoEmail, demoPassword);

  console.log('→ Wiping existing demo data (cascade)');
  // Delete demo client — FK cascades wipe leads, appointments, invoices.
  // ON DELETE CASCADE is defined in 0001_init.sql for all child tables.
  await admin.from('clients').delete().eq('id', DEMO_CLIENT_ID);

  console.log('→ Inserting Demo Solar Co client');
  // Try with is_demo first; fall back if migration 0016 hasn't been applied yet.
  let cErr = (await admin.from('clients').insert({
    id: DEMO_CLIENT_ID, company: 'Demo Solar Co', contact: 'Demo Account',
    region: 'South East', retainer: 1500, per_sit_fee: 75,
    ad_spend_monthly: 1000, management_markup_pct: 20,
    status: 'active', joined_at: '2026-01-15',
    is_demo: true, weekly_promise: 10, priority: 0,
  })).error;
  if (cErr?.code === 'PGRST204') {
    // is_demo column not yet migrated — insert without it and warn.
    console.warn('  ⚠ is_demo column not found — migration 0016 not applied yet.');
    console.warn('    Run: ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;');
    console.warn('    Then re-run seed:demo to set the flag.');
    cErr = (await admin.from('clients').insert({
      id: DEMO_CLIENT_ID, company: 'Demo Solar Co', contact: 'Demo Account',
      region: 'South East', retainer: 1500, per_sit_fee: 75,
      ad_spend_monthly: 1000, management_markup_pct: 20,
      status: 'active', joined_at: '2026-01-15',
      weekly_promise: 10, priority: 0,
    })).error;
  }
  if (cErr) throw cErr;

  console.log('→ Linking demo auth user → Demo Solar Co (client role)');
  const { error: uErr } = await admin.from('users').upsert(
    { id: demoUserId, email: demoEmail, role: 'client', client_id: DEMO_CLIENT_ID },
    { onConflict: 'id' },
  );
  if (uErr) throw uErr;

  console.log('→ Inserting demo campaign');
  const { data: campRows, error: campErr } = await admin
    .from('campaigns')
    .insert({
      client_id: DEMO_CLIENT_ID,
      name:      'Demo Solar — Surrey Meta',
      platform:  'meta',
      ad_spend:  0,
    })
    .select('id');
  if (campErr || !campRows) throw campErr;
  const demoCampId = campRows[0].id;

  console.log('→ Inserting demo leads');
  const now = new Date().toISOString();
  const { data: leads, error: lErr } = await admin.from('leads').insert([
    {
      client_id: DEMO_CLIENT_ID, campaign_id: demoCampId,
      name: 'James Wilson', phone: '+447700901001', email: 'j.wilson@example.co.uk',
      address: '45 Oak Crescent, Guildford', postcode: 'GU3 2QH',
      monthly_bill: 185, is_homeowner: true, bill_payer: true,
      roof_suitable: true, finance_interest: true,
      consent: true, consent_at: now, consent_source: 'demo_seed',
      routing_rule_fired: 'most_behind', status: 'booked', response_mins: 4,
    },
    {
      client_id: DEMO_CLIENT_ID, campaign_id: demoCampId,
      name: 'Sarah Mitchell', phone: '+447700901002', email: 's.mitchell@example.co.uk',
      address: '12 Birch Road, Reigate', postcode: 'RH2 7LP',
      monthly_bill: 210, is_homeowner: true, bill_payer: true,
      roof_suitable: true, finance_interest: true,
      consent: true, consent_at: now, consent_source: 'demo_seed',
      routing_rule_fired: 'most_behind', status: 'booked', response_mins: 6,
    },
    {
      client_id: DEMO_CLIENT_ID, campaign_id: demoCampId,
      name: 'Peter Hughes', phone: '+447700901003', email: 'p.hughes@example.co.uk',
      address: '88 Elm Grove, Crawley', postcode: 'RH10 4ST',
      monthly_bill: 160, is_homeowner: true, bill_payer: true,
      roof_suitable: true, finance_interest: false,
      consent: true, consent_at: now, consent_source: 'demo_seed',
      routing_rule_fired: 'round_robin', status: 'booked', response_mins: 8,
    },
    {
      client_id: DEMO_CLIENT_ID, campaign_id: demoCampId,
      name: 'Rachel Clarke', phone: '+447700901004', email: 'r.clarke@example.co.uk',
      address: '23 Maple Street, Horsham', postcode: 'RH13 6AB',
      monthly_bill: 195, is_homeowner: true, bill_payer: true,
      roof_suitable: true, finance_interest: true,
      consent: true, consent_at: now, consent_source: 'demo_seed',
      routing_rule_fired: 'most_behind', status: 'booked', response_mins: 3,
    },
    {
      client_id: DEMO_CLIENT_ID, campaign_id: demoCampId,
      name: 'David Turner', phone: '+447700901005', email: 'd.turner@example.co.uk',
      address: '7 Pine Close, Dorking', postcode: 'RH4 1YG',
      monthly_bill: 220, is_homeowner: true, bill_payer: true,
      roof_suitable: true, finance_interest: true,
      consent: true, consent_at: now, consent_source: 'demo_seed',
      routing_rule_fired: 'starvation', status: 'booked', response_mins: 5,
    },
    {
      client_id: DEMO_CLIENT_ID, campaign_id: demoCampId,
      name: 'Emma Ford', phone: '+447700901006', email: 'e.ford@example.co.uk',
      address: '34 Cedar Lane, Redhill', postcode: 'RH1 5DK',
      monthly_bill: 175, is_homeowner: true, bill_payer: true,
      roof_suitable: true, finance_interest: true,
      consent: true, consent_at: now, consent_source: 'demo_seed',
      routing_rule_fired: 'round_robin', status: 'booked', response_mins: 7,
    },
  ]).select('id, name');
  if (lErr || !leads) throw lErr;

  const lJames  = leads.find((l) => l.name === 'James Wilson')!;
  const lSarah  = leads.find((l) => l.name === 'Sarah Mitchell')!;
  const lPeter  = leads.find((l) => l.name === 'Peter Hughes')!;
  const lRachel = leads.find((l) => l.name === 'Rachel Clarke')!;
  const lDavid  = leads.find((l) => l.name === 'David Turner')!;
  const lEmma   = leads.find((l) => l.name === 'Emma Ford')!;

  console.log('→ Inserting demo appointments (Feb – Jun 2026 + 2 upcoming)');
  // 19 past appointments + 2 upcoming booked.
  // Sit rate: 15/19 = 79% (industry benchmark ~65%).
  // Close rate: 8/15 = 53% (credible for residential solar).
  // Lifetime sales: £83,200 across 8 jobs.
  // Most within-48h confirmed → confirmation rate ~73%.
  const { error: aErr } = await admin.from('appointments').insert([
    // ── February 2026 ──────────────────────────────────────────────────────
    { lead_id: lJames.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-02-10T10:00:00Z', confirmed_at: '2026-02-09T14:00:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 8700,
      quality_rating: 'up', invoiced: true },
    { lead_id: lSarah.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-02-17T14:00:00Z', confirmed_at: '2026-02-16T11:00:00Z',
      setter: 'Sarah K', outcome: 'sat', sale_value: null,
      quality_rating: 'up', invoiced: true },
    { lead_id: lPeter.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-02-24T11:00:00Z', confirmed_at: null,
      setter: 'Sarah K', outcome: 'no_show', sale_value: null,
      quality_rating: 'down', quality_reason: 'no answer on day', invoiced: false },

    // ── March 2026 ─────────────────────────────────────────────────────────
    { lead_id: lRachel.id, client_id: DEMO_CLIENT_ID,
      appt_date: '2026-03-03T10:00:00Z', confirmed_at: '2026-03-02T16:00:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 9200,
      quality_rating: 'up', invoiced: true },
    { lead_id: lJames.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-03-10T14:30:00Z', confirmed_at: '2026-03-09T10:00:00Z',
      setter: 'Sarah K', outcome: 'sat', sale_value: null,
      quality_rating: 'up', invoiced: true },
    { lead_id: lDavid.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-03-18T11:00:00Z', confirmed_at: '2026-03-17T15:00:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 10400,
      quality_rating: 'up', invoiced: true },
    { lead_id: lEmma.id,   client_id: DEMO_CLIENT_ID,
      appt_date: '2026-03-25T15:00:00Z', confirmed_at: null,
      setter: 'Sarah K', outcome: 'no_show', sale_value: null,
      quality_rating: 'down', quality_reason: 'wrong number given', invoiced: false },

    // ── April 2026 ─────────────────────────────────────────────────────────
    { lead_id: lSarah.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-04-07T09:30:00Z', confirmed_at: '2026-04-06T14:00:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 8900,
      quality_rating: 'up', invoiced: true },
    { lead_id: lPeter.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-04-14T14:00:00Z', confirmed_at: '2026-04-13T11:00:00Z',
      setter: 'Sarah K', outcome: 'sat', sale_value: null,
      quality_rating: 'up', invoiced: true },
    { lead_id: lRachel.id, client_id: DEMO_CLIENT_ID,
      appt_date: '2026-04-21T10:00:00Z', confirmed_at: '2026-04-20T16:30:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 11200,
      quality_rating: 'up', invoiced: true },
    { lead_id: lJames.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-04-28T15:30:00Z', confirmed_at: null,
      setter: 'Sarah K', outcome: 'no_show', sale_value: null,
      quality_rating: 'down', quality_reason: 'lead unavailable on day', invoiced: false },

    // ── May 2026 ───────────────────────────────────────────────────────────
    { lead_id: lDavid.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-05-06T10:00:00Z', confirmed_at: '2026-05-05T13:00:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 9600,
      quality_rating: 'up', invoiced: true },
    { lead_id: lEmma.id,   client_id: DEMO_CLIENT_ID,
      appt_date: '2026-05-13T14:00:00Z', confirmed_at: '2026-05-12T10:00:00Z',
      setter: 'Sarah K', outcome: 'sat', sale_value: null,
      quality_rating: 'up', invoiced: true },
    { lead_id: lSarah.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-05-20T11:00:00Z', confirmed_at: '2026-05-19T14:00:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 8300,
      quality_rating: 'up', invoiced: true },
    { lead_id: lPeter.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-05-27T10:00:00Z', confirmed_at: '2026-05-26T16:00:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 7800,
      quality_rating: 'up', invoiced: true },

    // ── June 2026 ──────────────────────────────────────────────────────────
    { lead_id: lJames.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-06-03T10:00:00Z', confirmed_at: '2026-06-02T15:00:00Z',
      setter: 'Sarah K', outcome: 'sold', sale_value: 9100,
      quality_rating: 'up', invoiced: true },
    { lead_id: lRachel.id, client_id: DEMO_CLIENT_ID,
      appt_date: '2026-06-10T14:00:00Z', confirmed_at: '2026-06-09T11:00:00Z',
      setter: 'Sarah K', outcome: 'sat', sale_value: null,
      quality_rating: 'up', invoiced: true },
    { lead_id: lDavid.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-06-17T11:00:00Z', confirmed_at: null,
      setter: 'Sarah K', outcome: 'no_show', sale_value: null,
      quality_rating: 'down', quality_reason: 'cancelled same day', invoiced: false },
    { lead_id: lEmma.id,   client_id: DEMO_CLIENT_ID,
      appt_date: '2026-06-24T10:00:00Z', confirmed_at: '2026-06-23T14:00:00Z',
      setter: 'Sarah K', outcome: 'sat', sale_value: null,
      quality_rating: 'up', invoiced: true },

    // ── Upcoming (booked) ──────────────────────────────────────────────────
    { lead_id: lPeter.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-07-08T10:00:00Z', confirmed_at: null,
      setter: 'Sarah K', outcome: 'booked', invoiced: false },
    { lead_id: lSarah.id,  client_id: DEMO_CLIENT_ID,
      appt_date: '2026-07-15T14:00:00Z', confirmed_at: null,
      setter: 'Sarah K', outcome: 'booked', invoiced: false },
  ]);
  if (aErr) throw aErr;

  console.log('→ Inserting demo invoices (Feb–Jun 2026)');
  // ad_spend_raw = £1,000/mo; markup 20% → advertising_management = £1,200.
  // per_sit_fee = £75. appointment_count = sits (sat + sold, not no_show).
  // Feb: 2 sits (sat+sold). Mar: 3. Apr: 3. May: 4. Jun: 3 (sat+sold, not no_show).
  const { error: iErr } = await admin.from('invoices').insert([
    {
      client_id: DEMO_CLIENT_ID, period: '2026-02',
      advertising_management: 1200, appointment_count: 2, appointment_fees: 150,
      total: 1350, status: 'paid',
      per_sit_fee_snapshot: 75, ad_spend_raw: 1000, management_markup_pct_snapshot: 20,
      issued_at: '2026-03-01T09:00:00Z', paid_at: '2026-03-07T11:00:00Z',
      amount: 1350, paid: true,
    },
    {
      client_id: DEMO_CLIENT_ID, period: '2026-03',
      advertising_management: 1200, appointment_count: 3, appointment_fees: 225,
      total: 1425, status: 'paid',
      per_sit_fee_snapshot: 75, ad_spend_raw: 1000, management_markup_pct_snapshot: 20,
      issued_at: '2026-04-01T09:00:00Z', paid_at: '2026-04-06T10:00:00Z',
      amount: 1425, paid: true,
    },
    {
      client_id: DEMO_CLIENT_ID, period: '2026-04',
      advertising_management: 1200, appointment_count: 3, appointment_fees: 225,
      total: 1425, status: 'paid',
      per_sit_fee_snapshot: 75, ad_spend_raw: 1000, management_markup_pct_snapshot: 20,
      issued_at: '2026-05-01T09:00:00Z', paid_at: '2026-05-09T14:00:00Z',
      amount: 1425, paid: true,
    },
    {
      client_id: DEMO_CLIENT_ID, period: '2026-05',
      advertising_management: 1200, appointment_count: 4, appointment_fees: 300,
      total: 1500, status: 'paid',
      per_sit_fee_snapshot: 75, ad_spend_raw: 1000, management_markup_pct_snapshot: 20,
      issued_at: '2026-06-01T09:00:00Z', paid_at: '2026-06-10T16:00:00Z',
      amount: 1500, paid: true,
    },
    {
      client_id: DEMO_CLIENT_ID, period: '2026-06',
      advertising_management: 1200, appointment_count: 3, appointment_fees: 225,
      total: 1425, status: 'issued',
      per_sit_fee_snapshot: 75, ad_spend_raw: 1000, management_markup_pct_snapshot: 20,
      issued_at: '2026-07-01T09:00:00Z', paid_at: null,
      amount: 1425, paid: false,
    },
  ]);
  if (iErr) throw iErr;

  console.log('✓ Demo seed complete');
  console.log('');
  console.log(`  demo login  → ${demoEmail}  (password set from DEMO_CLIENT_PASSWORD)`);
  console.log('  client      → Demo Solar Co');
  console.log('  data        → 21 appointments (Feb–Jul 2026), 5 invoices, 6 leads');
  console.log('');
  console.log('  Key metrics:');
  console.log('    Lifetime sales value  £83,200  (8 jobs)');
  console.log('    Sit rate              79%      (vs ~65% industry)');
  console.log('    Close rate            53%      (8 of 15 sits)');
  console.log('    Confirmation rate     ~73%     (confirmed within 48h)');
  console.log('    Upcoming booked       2        (July)');
  console.log('');
  console.log('  Re-run any time to reset demo data to this state.');
}

async function ensureAuthUser(email: string, password: string): Promise<string> {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
      console.log(`  Auth user already exists (${email}), password refreshed`);
      return found.id;
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr || !created.user) throw cErr ?? new Error('createUser returned no user');
  console.log(`  Created auth user: ${email}`);
  return created.user.id;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

main().catch((e) => {
  console.error('Demo seed failed:', e);
  process.exit(1);
});
