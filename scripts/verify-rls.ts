/**
 * Verifies tenant isolation. Run AFTER `npm run seed`.
 *
 * Signs in as the owner and as the seeded client, with the ANON key
 * (so RLS is enforced), and asserts:
 *   - owner sees both clients and all rows
 *   - client sees ONLY BrightRoof and its own rows
 *   - client cannot read Northwind even by guessing its id
 *   - client cannot update an appointment to move it to Northwind
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = req('SUPABASE_URL');
const anon = req('SUPABASE_ANON_KEY');
const service = req('SUPABASE_SERVICE_ROLE_KEY');
const ownerEmail = req('SEED_OWNER_EMAIL');
const ownerPassword = req('SEED_OWNER_PASSWORD');
const clientEmail = req('SEED_CLIENT_EMAIL');
const clientPassword = req('SEED_CLIENT_PASSWORD');

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: cs, error } = await admin.from('clients').select('id, company');
  if (error) throw error;
  const bright = cs!.find((c) => c.company === 'BrightRoof Solar')!;
  const north = cs!.find((c) => c.company === 'Northwind Energy')!;

  const ownerClient = await signedInClient(ownerEmail, ownerPassword);
  const clientPortal = await signedInClient(clientEmail, clientPassword);

  let failed = 0;
  const check = (label: string, pass: boolean, detail?: unknown) => {
    if (pass) console.log(`  ✓ ${label}`);
    else { console.log(`  ✗ ${label}`, detail ?? ''); failed += 1; }
  };

  console.log('Owner view:');
  {
    const { data } = await ownerClient.from('clients').select('id');
    check('owner reads both clients', (data?.length ?? 0) >= 2, data);
    const { data: leads } = await ownerClient.from('leads').select('id, client_id');
    check('owner reads all leads', (leads?.length ?? 0) >= 3, leads);
  }

  console.log('Client view (BrightRoof):');
  {
    const { data } = await clientPortal.from('clients').select('id, company');
    check('client sees only own clients row',
      data?.length === 1 && data[0].id === bright.id, data);

    const { data: leads } = await clientPortal.from('leads').select('id, client_id');
    check('client sees only own leads',
      (leads ?? []).every((l) => l.client_id === bright.id) && (leads?.length ?? 0) > 0, leads);

    const { data: appts } = await clientPortal.from('appointments').select('id, client_id');
    check('client sees only own appointments',
      (appts ?? []).every((a) => a.client_id === bright.id) && (appts?.length ?? 0) > 0, appts);

    const { data: invs } = await clientPortal.from('invoices').select('id, client_id');
    check('client sees only own invoices',
      (invs ?? []).every((i) => i.client_id === bright.id) && (invs?.length ?? 0) > 0, invs);

    const { data: byId } = await clientPortal.from('clients').select('id').eq('id', north.id);
    check("client cannot read another tenant's row by id",
      (byId?.length ?? 0) === 0, byId);

    const { data: northLeads } = await clientPortal.from('leads').select('id').eq('client_id', north.id);
    check("client cannot read another tenant's leads by client_id",
      (northLeads?.length ?? 0) === 0, northLeads);

    // Try to move one of BrightRoof's appointments to Northwind — RLS WITH CHECK
    // on the update policy should reject this.
    const { data: ownAppts } = await clientPortal.from('appointments').select('id').limit(1);
    if (ownAppts?.[0]) {
      const { error: upErr, data: upData } = await clientPortal
        .from('appointments')
        .update({ client_id: north.id })
        .eq('id', ownAppts[0].id)
        .select();
      check('client cannot reassign an appointment to another tenant',
        !!upErr || (upData?.length ?? 0) === 0, { upErr, upData });
    }
  }

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll RLS checks passed.');
}

async function signedInClient(email: string, password: string) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return c;
}

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
