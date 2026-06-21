/**
 * Phase 1 seed.
 * Idempotent: safe to re-run. Wipes seeded rows then re-inserts.
 * Requires SUPABASE_SERVICE_ROLE_KEY — bypasses RLS.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = required('SUPABASE_URL');
const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
const ownerEmail = required('SEED_OWNER_EMAIL');
const ownerPassword = required('SEED_OWNER_PASSWORD');
const clientEmail = required('SEED_CLIENT_EMAIL');
const clientPassword = required('SEED_CLIENT_PASSWORD');

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('→ Resetting business tables (seeded data only)');
  // Wipe in FK-safe order. Users row is removed when auth user is deleted.
  await admin.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('campaigns').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('→ Ensuring auth users exist');
  const ownerId = await ensureAuthUser(ownerEmail, ownerPassword);
  const clientLoginId = await ensureAuthUser(clientEmail, clientPassword);

  console.log('→ Inserting clients');
  const { data: clients, error: cErr } = await admin
    .from('clients')
    .insert([
      {
        company: 'BrightRoof Solar',
        contact: 'Jamie Patel',
        region: 'South East',
        retainer: 1500,
        per_sit_fee: 75,
        ad_spend_monthly: 900,
        status: 'active',
        joined_at: '2026-02-01',
      },
      {
        company: 'Northwind Energy',
        contact: 'Sam Lawson',
        region: 'North West',
        retainer: 2000,
        per_sit_fee: 80,
        ad_spend_monthly: 1200,
        status: 'active',
        joined_at: '2026-01-15',
      },
    ])
    .select('id, company');
  if (cErr || !clients) throw cErr;

  const bright = clients.find((c) => c.company === 'BrightRoof Solar')!;
  const north = clients.find((c) => c.company === 'Northwind Energy')!;

  console.log('→ Linking users → clients');
  // Owner row (client_id null), client login mapped to BrightRoof.
  const { error: uErr } = await admin.from('users').upsert(
    [
      { id: ownerId, email: ownerEmail, role: 'owner', client_id: null },
      { id: clientLoginId, email: clientEmail, role: 'client', client_id: bright.id },
    ],
    { onConflict: 'id' },
  );
  if (uErr) throw uErr;

  console.log('→ Inserting campaigns');
  const { data: campaigns, error: campErr } = await admin
    .from('campaigns')
    .insert([
      { client_id: bright.id, name: 'BrightRoof — Surrey Meta', platform: 'meta', ad_spend: 1800 },
      { client_id: north.id, name: 'Northwind — Manchester Google', platform: 'google', ad_spend: 2400 },
    ])
    .select('id, client_id');
  if (campErr || !campaigns) throw campErr;
  const brightCamp = campaigns.find((c) => c.client_id === bright.id)!;
  const northCamp = campaigns.find((c) => c.client_id === north.id)!;

  console.log('→ Inserting leads');
  const { data: leads, error: lErr } = await admin
    .from('leads')
    .insert([
      {
        client_id: bright.id, campaign_id: brightCamp.id,
        name: 'Alice Brown', phone: '+447700900001', email: 'alice@example.co.uk',
        address: '12 Oak Lane, Guildford', monthly_bill: 180,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: true,
        consent: true, status: 'booked', response_mins: 4,
      },
      {
        client_id: bright.id, campaign_id: brightCamp.id,
        name: 'Bob Carter', phone: '+447700900002', email: 'bob@example.co.uk',
        address: '7 Elm Road, Woking', monthly_bill: 140,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: false,
        consent: true, status: 'booked', response_mins: 9,
      },
      {
        client_id: north.id, campaign_id: northCamp.id,
        name: 'Cara Daniels', phone: '+447700900003', email: 'cara@example.co.uk',
        address: '22 High St, Manchester', monthly_bill: 210,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: true,
        consent: true, status: 'booked', response_mins: 3,
      },
    ])
    .select('id, client_id, name');
  if (lErr || !leads) throw lErr;
  const lAlice = leads.find((l) => l.name === 'Alice Brown')!;
  const lBob   = leads.find((l) => l.name === 'Bob Carter')!;
  const lCara  = leads.find((l) => l.name === 'Cara Daniels')!;

  console.log('→ Inserting appointments');
  // A spread of historical appointments across Feb–Jun so Phase 2 charts
  // and health badges have something meaningful to show. All bound to the
  // three seeded leads — fine for an MVP demo; not a normalised model.
  const { error: aErr } = await admin.from('appointments').insert([
    // BrightRoof — Feb (1 sit, 1 sold)
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-02-12T13:00:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 8200, quality_rating: 'up', invoiced: true },
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-02-24T15:30:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    // BrightRoof — Mar (2 sits, 1 sold, 1 no_show)
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-03-05T11:00:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-03-15T16:00:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 10400, quality_rating: 'up', invoiced: true },
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-03-22T10:00:00Z',
      setter: 'Maria', outcome: 'no_show', sale_value: null, quality_rating: 'down',
      quality_reason: 'wrong address', invoiced: false },
    // BrightRoof — Apr (2 sits, 1 sold)
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-04-08T14:00:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-04-19T11:30:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 9100, quality_rating: 'up', invoiced: true },
    // BrightRoof — May (2 sits, 1 sold)
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-05-06T15:00:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 8700, quality_rating: 'up', invoiced: true },
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-05-21T12:00:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    // BrightRoof — Jun (the original two: 1 sold, 1 sat)
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-06-10T15:00:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 9800, quality_rating: 'up', invoiced: true },
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-06-18T13:30:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: false },

    // Northwind — Feb (1 sit, no sale — reps-flag candidate later)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-02-18T14:00:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    // Northwind — Mar (2 sits, 0 sold)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-03-09T11:00:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-03-24T15:00:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'down',
      quality_reason: 'lead unqualified', invoiced: true },
    // Northwind — Apr (2 sits, 1 sold)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-04-12T13:00:00Z',
      setter: 'James', outcome: 'sold', sale_value: 7400, quality_rating: 'up', invoiced: true },
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-04-26T10:30:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    // Northwind — May (2 sits, 0 sold — gap)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-05-10T12:00:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-05-23T16:30:00Z',
      setter: 'James', outcome: 'no_show', sale_value: null, quality_rating: 'down',
      quality_reason: 'wrong number', invoiced: false },
    // Northwind — Jun (the original: 1 booked, upcoming)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-06-22T10:00:00Z',
      setter: 'James', outcome: 'booked', sale_value: null, invoiced: false },
  ]);
  if (aErr) throw aErr;

  console.log('→ Inserting invoices');
  const { error: iErr } = await admin.from('invoices').insert([
    { client_id: bright.id, period: '2026-05', amount: 1875, paid: true },
    { client_id: bright.id, period: '2026-06', amount: 1650, paid: false },
    { client_id: north.id,  period: '2026-05', amount: 2160, paid: true },
  ]);
  if (iErr) throw iErr;

  console.log('✓ Seed complete');
  console.log(`  owner login   → ${ownerEmail}`);
  console.log(`  client login  → ${clientEmail}  (BrightRoof Solar)`);
}

async function ensureAuthUser(email: string, password: string): Promise<string> {
  // Look up by email — paginate listUsers.
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      // Reset password so the seed always matches .env.
      await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
      return found.id;
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (cErr || !created.user) throw cErr ?? new Error('createUser returned no user');
  return created.user.id;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
