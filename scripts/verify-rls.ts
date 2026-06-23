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

    // Phase 3 — column-level revoke: client must not read agency-only money columns.
    const { error: adErr, data: adData } = await clientPortal
      .from('clients')
      .select('id, ad_spend_monthly');
    check(
      'client cannot read clients.ad_spend_monthly (column-level revoke)',
      !!adErr || (adData ?? []).every((r: Record<string, unknown>) => !('ad_spend_monthly' in r)),
      { adErr, adData },
    );

    const { error: csErr, data: csData } = await clientPortal
      .from('campaigns')
      .select('id, ad_spend');
    check(
      'client cannot read campaigns.ad_spend (column-level revoke)',
      !!csErr || (csData ?? []).every((r: Record<string, unknown>) => !('ad_spend' in r)),
      { csErr, csData },
    );

    // Phase 3 — confirmed_at is readable by the client on their own appointments.
    const { data: confData, error: confErr } = await clientPortal
      .from('appointments')
      .select('id, confirmed_at')
      .limit(1);
    check(
      'client can read confirmed_at on own appointments',
      !confErr && (confData?.length ?? 0) > 0,
      { confErr, confData },
    );

    // Phase 4 — routing config is owner-only at every layer.
    const { data: pcData, error: pcErr } = await clientPortal
      .from('client_postcodes')
      .select('client_id, postcode_prefix');
    check(
      'client cannot read any client_postcodes (RLS denies all rows)',
      !!pcErr || (pcData ?? []).length === 0,
      { pcErr, pcData },
    );

    const { data: pvData, error: pvErr } = await clientPortal
      .from('postcode_volume')
      .select('postcode_prefix, typical_weekly_leads');
    check(
      'client cannot read postcode_volume (RLS denies all rows)',
      !!pvErr || (pvData ?? []).length === 0,
      { pvErr, pvData },
    );

    // weekly_promise / priority must not be SELECTable by authenticated
    // (they are NOT in the safe-column grant).
    const { data: wpData, error: wpErr } = await clientPortal
      .from('clients')
      .select('id, weekly_promise');
    check(
      'client cannot read clients.weekly_promise (column-level revoke)',
      !!wpErr ||
        (wpData ?? []).every(
          (r: Record<string, unknown>) => !('weekly_promise' in r),
        ),
      { wpErr, wpData },
    );

    const { data: prData, error: prErr } = await clientPortal
      .from('clients')
      .select('id, priority');
    check(
      'client cannot read clients.priority (column-level revoke)',
      !!prErr ||
        (prData ?? []).every(
          (r: Record<string, unknown>) => !('priority' in r),
        ),
      { prErr, prData },
    );

    // Phase 5 — agency-only lead metadata is unreadable by the
    // authenticated role (column-level revoke in migration 0006).
    const hiddenLeadCols = [
      'notes',
      'campaign_source',
      'consent_at',
      'consent_source',
      'routing_rule_fired',
      'data_retention_until',
    ];
    for (const col of hiddenLeadCols) {
      const res = await clientPortal
        .from('leads')
        .select(`id, ${col}` as '*')
        .limit(1);
      const error = res.error;
      const data = (res.data ?? []) as Record<string, unknown>[];
      check(
        `client cannot read leads.${col} (column-level revoke)`,
        !!error || data.every((r) => !(col in r)),
        { error, data },
      );
    }

    // Phase 6 — invoice money fields locked down at column level.
    const hiddenInvoiceCols = ['ad_spend_raw', 'management_markup_pct_snapshot'];
    for (const col of hiddenInvoiceCols) {
      const res = await clientPortal
        .from('invoices')
        .select(`id, ${col}` as '*')
        .limit(1);
      const error = res.error;
      const data = (res.data ?? []) as Record<string, unknown>[];
      check(
        `client cannot read invoices.${col} (column-level revoke)`,
        !!error || data.every((r) => !(col in r)),
        { error, data },
      );
    }

    // Phase 6 — client's own management_markup_pct stays hidden.
    const resMm = await clientPortal
      .from('clients')
      .select('id, management_markup_pct');
    const mmErr = resMm.error;
    const mmData = (resMm.data ?? []) as Record<string, unknown>[];
    check(
      'client cannot read clients.management_markup_pct (column-level revoke)',
      !!mmErr || mmData.every((r) => !('management_markup_pct' in r)),
      { mmErr, mmData },
    );

    // Phase 6 — client CAN read their own advertising_management (the
    // bundled, client-visible total). Confirms the safe-grant works.
    const resAm = await clientPortal
      .from('invoices')
      .select('id, advertising_management, total, status, period')
      .limit(1);
    check(
      "client can read their own invoice's advertising_management",
      !resAm.error,
      { error: resAm.error, data: resAm.data },
    );
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
