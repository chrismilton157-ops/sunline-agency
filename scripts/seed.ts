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
const setterEmail = required('SEED_SETTER_EMAIL');
const setterPassword = required('SEED_SETTER_PASSWORD');

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('→ Resetting business tables (seeded data only)');
  // Wipe in FK-safe order. Users row is removed when auth user is deleted.
  await admin.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('leads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('campaign_spend').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('campaigns').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  // Phase 4: routing tables — cascade with clients, but wipe explicitly
  // so the seed is idempotent even if the FK definition changes.
  await admin.from('client_postcodes').delete().neq('postcode_prefix', '__sentinel__');
  await admin.from('postcode_volume').delete().neq('postcode_prefix', '__sentinel__');
  await admin.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('→ Ensuring auth users exist');
  const ownerId = await ensureAuthUser(ownerEmail, ownerPassword);
  const clientLoginId = await ensureAuthUser(clientEmail, clientPassword);
  const setterId = await ensureAuthUser(setterEmail, setterPassword);

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
        weekly_promise: 12,
        priority: 100,
        management_markup_pct: 20,
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
        weekly_promise: 18,
        priority: 100,
        management_markup_pct: 20,
      },
    ])
    .select('id, company');
  if (cErr || !clients) throw cErr;

  const bright = clients.find((c) => c.company === 'BrightRoof Solar')!;
  const north = clients.find((c) => c.company === 'Northwind Energy')!;

  console.log('→ Linking users → clients');
  // Owner row (client_id null), client login mapped to BrightRoof, setter (client_id null).
  const { error: uErr } = await admin.from('users').upsert(
    [
      { id: ownerId, email: ownerEmail, role: 'owner', client_id: null },
      { id: clientLoginId, email: clientEmail, role: 'client', client_id: bright.id },
      { id: setterId, email: setterEmail, role: 'setter', client_id: null },
    ],
    { onConflict: 'id' },
  );
  if (uErr) throw uErr;

  console.log('→ Inserting campaigns');
  // Phase 7: a regional / shared campaign has client_id = NULL. Leads it
  // generates are routed to multiple clients via Phase 4 routing; the
  // spend is then allocated by lead share in lib/allocation.ts.
  const { data: campaigns, error: campErr } = await admin
    .from('campaigns')
    .insert([
      { client_id: bright.id, name: 'BrightRoof — Surrey Meta', platform: 'meta', ad_spend: 1800 },
      { client_id: north.id, name: 'Northwind — Manchester Google', platform: 'google', ad_spend: 2400 },
      // Shared regional campaign covering 'BR' postcodes — both seeded
      // clients have 'BR' in their coverage so leads from it route to
      // whichever client the routing engine picks.
      { client_id: null, name: 'Shared — Bristol BR Meta', platform: 'meta', ad_spend: 0 },
    ])
    .select('id, client_id, name');
  if (campErr || !campaigns) throw campErr;
  const brightCamp = campaigns.find((c) => c.client_id === bright.id)!;
  const northCamp = campaigns.find((c) => c.client_id === north.id)!;
  const sharedCamp = campaigns.find((c) => c.client_id === null)!;

  console.log('→ Inserting leads');
  // Phase 5: backfill consent_at / consent_source / routing_rule_fired
  // / postcode on historical seed leads so the agency Leads screen has
  // sensible rows from the moment the migration lands.
  const now = new Date().toISOString();
  const { data: leads, error: lErr } = await admin
    .from('leads')
    .insert([
      {
        client_id: bright.id, campaign_id: brightCamp.id,
        name: 'Alice Brown', phone: '+447700900001', email: 'alice@example.co.uk',
        address: '12 Oak Lane, Guildford', postcode: 'GU2 8AA', monthly_bill: 180,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: true,
        consent: true, consent_at: now, consent_source: 'seed_phase1',
        routing_rule_fired: 'most_behind',
        status: 'booked', response_mins: 4,
      },
      {
        client_id: bright.id, campaign_id: brightCamp.id,
        name: 'Bob Carter', phone: '+447700900002', email: 'bob@example.co.uk',
        address: '7 Elm Road, Woking', postcode: 'KT14 6AA', monthly_bill: 140,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: false,
        consent: true, consent_at: now, consent_source: 'seed_phase1',
        routing_rule_fired: 'most_behind',
        status: 'booked', response_mins: 9,
      },
      {
        client_id: north.id, campaign_id: northCamp.id,
        name: 'Cara Daniels', phone: '+447700900003', email: 'cara@example.co.uk',
        address: '22 High St, Manchester', postcode: 'M1 2AB', monthly_bill: 210,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: true,
        consent: true, consent_at: now, consent_source: 'seed_phase1',
        routing_rule_fired: 'most_behind',
        status: 'booked', response_mins: 3,
      },
      // Phase 7: leads from the SHARED 'BR' regional campaign — three
      // routed to BrightRoof, two to Northwind in the current month.
      // The 60/40 split gives a clear demo of the allocation rule
      // (whatever spend we record on the shared campaign will land
      // 60% on BrightRoof, 40% on Northwind).
      {
        client_id: bright.id, campaign_id: sharedCamp.id,
        name: 'Daisy Evans', phone: '+447700900004', email: 'daisy@example.co.uk',
        address: '4 Bridge St, Bromley', postcode: 'BR1 1AA', monthly_bill: 165,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: true,
        consent: true, consent_at: now, consent_source: 'seed_phase7',
        routing_rule_fired: 'round_robin',
        status: 'new', response_mins: 6,
      },
      {
        client_id: bright.id, campaign_id: sharedCamp.id,
        name: 'Eli Foster', phone: '+447700900005', email: 'eli@example.co.uk',
        address: '11 Park Rd, Bromley', postcode: 'BR2 7BB', monthly_bill: 150,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: false,
        consent: true, consent_at: now, consent_source: 'seed_phase7',
        routing_rule_fired: 'most_behind',
        status: 'new', response_mins: 4,
      },
      {
        client_id: bright.id, campaign_id: sharedCamp.id,
        name: 'Fern Gould', phone: '+447700900006', email: 'fern@example.co.uk',
        address: '88 Elm Ave, Bromley', postcode: 'BR3 4CC', monthly_bill: 195,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: true,
        consent: true, consent_at: now, consent_source: 'seed_phase7',
        routing_rule_fired: 'round_robin',
        status: 'new', response_mins: 7,
      },
      {
        client_id: north.id, campaign_id: sharedCamp.id,
        name: 'Greg Hayes', phone: '+447700900007', email: 'greg@example.co.uk',
        address: '2 Lime Cl, Bromley', postcode: 'BR5 9DD', monthly_bill: 175,
        is_homeowner: true, bill_payer: true, roof_suitable: true, finance_interest: true,
        consent: true, consent_at: now, consent_source: 'seed_phase7',
        routing_rule_fired: 'starvation',
        status: 'new', response_mins: 5,
      },
      {
        client_id: north.id, campaign_id: sharedCamp.id,
        name: 'Hana Irving', phone: '+447700900008', email: 'hana@example.co.uk',
        address: '17 Vine Way, Bromley', postcode: 'BR6 2EE', monthly_bill: 130,
        is_homeowner: true, bill_payer: true, roof_suitable: false, finance_interest: true,
        consent: true, consent_at: now, consent_source: 'seed_phase7',
        routing_rule_fired: 'newest_client',
        status: 'new', response_mins: 9,
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
  // confirmed_at represents the phone-confirmation call. Most are within
  // 48h before the sit (counts toward the portal's confirmation rate);
  // a few are too-early or null to exercise the stat.
  const { error: aErr } = await admin.from('appointments').insert([
    // BrightRoof — Feb (1 sit, 1 sold)
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-02-12T13:00:00Z',
      confirmed_at: '2026-02-11T10:00:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 8200, quality_rating: 'up', invoiced: true },
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-02-24T15:30:00Z',
      confirmed_at: '2026-02-23T18:00:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    // BrightRoof — Mar (2 sits, 1 sold, 1 no_show)
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-03-05T11:00:00Z',
      confirmed_at: '2026-03-03T15:00:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-03-15T16:00:00Z',
      confirmed_at: '2026-03-14T20:00:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 10400, quality_rating: 'up', invoiced: true },
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-03-22T10:00:00Z',
      confirmed_at: null,
      setter: 'Maria', outcome: 'no_show', sale_value: null, quality_rating: 'down',
      quality_reason: 'wrong address', invoiced: false },
    // BrightRoof — Apr (2 sits, 1 sold)
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-04-08T14:00:00Z',
      confirmed_at: '2026-04-07T13:00:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-04-19T11:30:00Z',
      confirmed_at: '2026-04-15T11:30:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 9100, quality_rating: 'up', invoiced: true },
    // BrightRoof — May (2 sits, 1 sold)
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-05-06T15:00:00Z',
      confirmed_at: '2026-05-05T16:00:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 8700, quality_rating: 'up', invoiced: true },
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-05-21T12:00:00Z',
      confirmed_at: '2026-05-20T13:00:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    // BrightRoof — Jun (the original two: 1 sold, 1 sat)
    { lead_id: lAlice.id, client_id: bright.id, appt_date: '2026-06-10T15:00:00Z',
      confirmed_at: '2026-06-09T15:00:00Z',
      setter: 'Maria', outcome: 'sold', sale_value: 9800, quality_rating: 'up', invoiced: true },
    { lead_id: lBob.id,   client_id: bright.id, appt_date: '2026-06-18T13:30:00Z',
      confirmed_at: '2026-06-17T13:30:00Z',
      setter: 'Maria', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: false },

    // Northwind — Feb (1 sit, no sale — reps-flag candidate later)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-02-18T14:00:00Z',
      confirmed_at: '2026-02-17T18:00:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    // Northwind — Mar (2 sits, 0 sold)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-03-09T11:00:00Z',
      confirmed_at: '2026-03-08T11:00:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-03-24T15:00:00Z',
      confirmed_at: '2026-03-20T15:00:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'down',
      quality_reason: 'lead unqualified', invoiced: true },
    // Northwind — Apr (2 sits, 1 sold)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-04-12T13:00:00Z',
      confirmed_at: null,
      setter: 'James', outcome: 'sold', sale_value: 7400, quality_rating: 'up', invoiced: true },
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-04-26T10:30:00Z',
      confirmed_at: '2026-04-25T10:30:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    // Northwind — May (2 sits, 0 sold — gap)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-05-10T12:00:00Z',
      confirmed_at: '2026-05-09T12:00:00Z',
      setter: 'James', outcome: 'sat',  sale_value: null, quality_rating: 'up', invoiced: true },
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-05-23T16:30:00Z',
      confirmed_at: null,
      setter: 'James', outcome: 'no_show', sale_value: null, quality_rating: 'down',
      quality_reason: 'wrong number', invoiced: false },
    // Northwind — Jun (the original: 1 booked, upcoming, not yet confirmed)
    { lead_id: lCara.id, client_id: north.id, appt_date: '2026-06-22T10:00:00Z',
      confirmed_at: null,
      setter: 'James', outcome: 'booked', sale_value: null, invoiced: false },
  ]);
  if (aErr) throw aErr;

  console.log('→ Inserting routing config (Phase 4)');
  // Postcode coverage. 'BR' is intentionally shared by both clients so the
  // routing simulator and the over-promise warning have something to
  // demonstrate. Each client has unique prefixes for their own region too.
  const { error: pcErr } = await admin.from('client_postcodes').insert([
    { client_id: bright.id, postcode_prefix: 'GU' }, // Guildford
    { client_id: bright.id, postcode_prefix: 'KT' }, // Kingston
    { client_id: bright.id, postcode_prefix: 'RG' }, // Reading
    { client_id: bright.id, postcode_prefix: 'BR' }, // shared
    { client_id: north.id,  postcode_prefix: 'M' },  // Manchester
    { client_id: north.id,  postcode_prefix: 'BL' }, // Bolton
    { client_id: north.id,  postcode_prefix: 'OL' }, // Oldham
    { client_id: north.id,  postcode_prefix: 'BR' }, // shared
  ]);
  if (pcErr) throw pcErr;

  // Realistic-ish weekly volume per prefix. 'BR' is deliberately set low
  // so that the sum of BrightRoof (12) + Northwind (18) promises = 30
  // dwarfs BR's typical 10 → over-promise warning triggers.
  const { error: pvErr } = await admin.from('postcode_volume').insert([
    { postcode_prefix: 'GU', typical_weekly_leads: 14 },
    { postcode_prefix: 'KT', typical_weekly_leads: 9 },
    { postcode_prefix: 'RG', typical_weekly_leads: 12 },
    { postcode_prefix: 'BR', typical_weekly_leads: 10 },
    { postcode_prefix: 'M',  typical_weekly_leads: 22 },
    { postcode_prefix: 'BL', typical_weekly_leads: 8 },
    { postcode_prefix: 'OL', typical_weekly_leads: 7 },
  ]);
  if (pvErr) throw pvErr;

  console.log('→ Inserting invoices');
  // Phase 6: invoices now carry a structured breakdown. Each row reflects
  // a realistic monthly bill at the seeded ad_spend_monthly + per_sit_fee
  // + 20% markup. amount/paid stay populated for legacy queries.
  //
  //   BrightRoof — 2026-05: ad_spend 900 × 1.20 = 1080  + 2 appts × £75 = 150 → 1230
  //   Northwind  — 2026-05: ad_spend 1200 × 1.20 = 1440 + 2 appts × £80 = 160 → 1600
  //
  // 2026-06 is INTENTIONALLY left empty so the Phase 7 demo flow can
  // generate it from scratch using the new shared-campaign allocation.
  const { error: iErr } = await admin.from('invoices').insert([
    {
      client_id: bright.id, period: '2026-05',
      advertising_management: 1080, appointment_count: 2, appointment_fees: 150,
      total: 1230, status: 'paid', per_sit_fee_snapshot: 75,
      ad_spend_raw: 900, management_markup_pct_snapshot: 20,
      issued_at: '2026-06-01T09:00:00Z', paid_at: '2026-06-08T12:00:00Z',
      amount: 1230, paid: true,
    },
    {
      client_id: north.id, period: '2026-05',
      advertising_management: 1440, appointment_count: 2, appointment_fees: 160,
      total: 1600, status: 'paid', per_sit_fee_snapshot: 80,
      ad_spend_raw: 1200, management_markup_pct_snapshot: 20,
      issued_at: '2026-06-01T09:00:00Z', paid_at: '2026-06-12T10:00:00Z',
      amount: 1600, paid: true,
    },
  ]);
  if (iErr) throw iErr;

  console.log('→ Inserting historical campaign spend (Phase 7)');
  // One past-period spend row on the shared regional campaign so the RLS
  // check has something concrete to deny when run as a client. The owner
  // demo flow will record fresh spend for the current month via the
  // /allocation UI — that's the path the user tests.
  const { error: csErr } = await admin.from('campaign_spend').insert([
    { campaign_id: sharedCamp.id, period: '2026-05', amount: 0 },
  ]);
  if (csErr) throw csErr;

  console.log('✓ Seed complete');
  console.log(`  owner login   → ${ownerEmail}`);
  console.log(`  client login  → ${clientEmail}  (BrightRoof Solar)`);
  console.log(`  setter login  → ${setterEmail}`);
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
