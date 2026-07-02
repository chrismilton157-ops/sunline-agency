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
const setterEmail = req('SEED_SETTER_EMAIL');
const setterPassword = req('SEED_SETTER_PASSWORD');
const confirmerEmail = req('SEED_CONFIRMER_EMAIL');
const confirmerPassword = req('SEED_CONFIRMER_PASSWORD');

// Optional — only checked when DEMO_CLIENT_EMAIL + DEMO_CLIENT_PASSWORD are set.
const demoEmail    = process.env.DEMO_CLIENT_EMAIL;
const demoPassword = process.env.DEMO_CLIENT_PASSWORD;

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
  const setterPortal = await signedInClient(setterEmail, setterPassword);
  const confirmerPortal = await signedInClient(confirmerEmail, confirmerPassword);

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

    // Phase 7 — campaign_spend (per-campaign monthly ad spend) is the
    // raw input to the cost-allocation split. It is agency-only at every
    // layer: RLS denies all rows AND the table-level SELECT was revoked
    // from the authenticated role in migration 0008.
    const resCs = await clientPortal
      .from('campaign_spend')
      .select('campaign_id, period, amount');
    check(
      'client cannot read any campaign_spend rows',
      !!resCs.error || (resCs.data ?? []).length === 0,
      { error: resCs.error, data: resCs.data },
    );

    // Phase 7 — regional / shared campaigns have client_id IS NULL and
    // therefore never match `campaigns_client_read_own`. The client must
    // not see any campaign that isn't theirs.
    const { data: allCampaigns } = await clientPortal
      .from('campaigns')
      .select('id, client_id');
    check(
      'client only sees their own (non-regional) campaigns',
      (allCampaigns ?? []).every((c) => c.client_id === bright.id) &&
        (allCampaigns?.length ?? 0) > 0,
      allCampaigns,
    );

    // Phase 7 — even though leads carry a campaign_id, a client must not
    // see another client's leads (already covered above, restate as the
    // allocation-relevant version: leads from a shared regional campaign
    // that were routed to Northwind stay invisible to BrightRoof).
    const { data: leakLeads } = await clientPortal
      .from('leads')
      .select('id, client_id, campaign_id')
      .neq('client_id', bright.id);
    check(
      "client cannot read another tenant's leads from a shared campaign",
      (leakLeads ?? []).length === 0,
      leakLeads,
    );

    // Phase 8 — call_dispositions is agency-only: table-level SELECT is
    // revoked from authenticated in migration 0009.
    const resDisp = await clientPortal
      .from('call_dispositions')
      .select('id, lead_id, disposition');
    check(
      'client cannot read any call_dispositions (table-level revoke)',
      !!resDisp.error || (resDisp.data ?? []).length === 0,
      { error: resDisp.error, data: resDisp.data },
    );

    // Phase 9 — confirmation_attempts is agency-only: table-level SELECT is
    // revoked from authenticated in migration 0010.
    const resConf = await clientPortal
      .from('confirmation_attempts')
      .select('id, appointment_id, method');
    check(
      'client cannot read any confirmation_attempts (table-level revoke)',
      !!resConf.error || (resConf.data ?? []).length === 0,
      { error: resConf.error, data: resConf.data },
    );

    // Phase 8 — queue tracking columns (no_answer_count, queue_claimed_by,
    // queue_claimed_at) are not in the column-level SELECT grant on leads
    // (migration 0006), so the authenticated role cannot read them.
    const queueCols = ['no_answer_count', 'queue_claimed_by', 'queue_claimed_at'];
    for (const col of queueCols) {
      const res = await clientPortal
        .from('leads')
        .select(`id, ${col}` as '*')
        .limit(1);
      const error = res.error;
      const data = (res.data ?? []) as Record<string, unknown>[];
      check(
        `client cannot read leads.${col} (not in column SELECT grant)`,
        !!error || data.every((r) => !(col in r)),
        { error, data },
      );
    }

    // GDPR data_requests is owner-only: client must see 0 rows.
    const resDR = await clientPortal
      .from('data_requests')
      .select('id, requester_name');
    check(
      'client cannot read any data_requests (owner-only RLS)',
      !!resDR.error || (resDR.data ?? []).length === 0,
      { error: resDR.error, data: resDR.data },
    );

    // Phase 26 — setter_sessions is setter/owner-only; a client must see 0 rows.
    const resSess = await clientPortal
      .from('setter_sessions')
      .select('id, state');
    check(
      'client cannot read any setter_sessions (no client policy)',
      !!resSess.error || (resSess.data ?? []).length === 0,
      { error: resSess.error, data: resSess.data },
    );
  }

  // -----------------------------------------------------------------------
  // Phase 11 — Setter role: can see own users row, cannot see any business
  // data or owner-only quality/money fields.
  // -----------------------------------------------------------------------
  console.log('Setter view (setter@sunline.test):');
  {
    // Can read own users row (users_read_self policy)
    const { data: selfRow, error: selfErr } = await setterPortal
      .from('users').select('id, role').eq('id', await setterId(setterEmail));
    check(
      'setter can read their own users row',
      !selfErr && (selfRow?.length ?? 0) === 1,
      { selfErr, selfRow },
    );

    // Cannot read other users rows (owner-only via users_owner_all)
    const { data: allUsers } = await setterPortal
      .from('users').select('id, email');
    check(
      'setter cannot read other users rows (only own)',
      (allUsers ?? []).length <= 1,
      allUsers,
    );

    // Cannot read any appointments (no matching RLS policy for setter role)
    const { data: apptData, error: apptErr } = await setterPortal
      .from('appointments').select('id, outcome, quality_rating');
    check(
      'setter cannot read appointments (no RLS policy for setter)',
      !!apptErr || (apptData ?? []).length === 0,
      { apptErr, apptData },
    );

    // Cannot read quality_rating specifically (belt-and-braces: no rows at all)
    const { data: qrData, error: qrErr } = await setterPortal
      .from('appointments').select('id, quality_rating').limit(1);
    check(
      'setter cannot read appointments.quality_rating (no RLS rows)',
      !!qrErr || (qrData ?? []).length === 0,
      { qrErr, qrData },
    );

    // Cannot read call_dispositions (table-level SELECT revoked in 0009)
    const { data: cdData, error: cdErr } = await setterPortal
      .from('call_dispositions').select('id, disposition');
    check(
      'setter cannot read call_dispositions (table-level revoke)',
      !!cdErr || (cdData ?? []).length === 0,
      { cdErr, cdData },
    );

    // Cannot read clients table (owner-all + client-read-own; setter has neither)
    const { data: clData, error: clErr } = await setterPortal
      .from('clients').select('id, company');
    check(
      'setter cannot read any clients rows',
      !!clErr || (clData ?? []).length === 0,
      { clErr, clData },
    );

    // Cannot read any leads rows (owner-all + client-read-own; setter client_id is null)
    const { data: ldData, error: ldErr } = await setterPortal
      .from('leads').select('id').limit(5);
    check(
      'setter cannot read any leads rows (RLS: setter has no client_id)',
      !!ldErr || (ldData ?? []).length === 0,
      { ldErr, ldData },
    );

    // Cannot read invoices
    const { data: invData, error: invErr } = await setterPortal
      .from('invoices').select('id, total');
    check(
      'setter cannot read any invoices rows',
      !!invErr || (invData ?? []).length === 0,
      { invErr, invData },
    );

    // Cannot read campaign_spend (table-level revoke)
    const { data: csData, error: csErr } = await setterPortal
      .from('campaign_spend').select('campaign_id, amount');
    check(
      'setter cannot read campaign_spend (table-level revoke)',
      !!csErr || (csData ?? []).length === 0,
      { csErr, csData },
    );

    // Cannot read confirmation_attempts (table-level revoke in 0010)
    const { data: caData, error: caErr } = await setterPortal
      .from('confirmation_attempts').select('id');
    check(
      'setter cannot read confirmation_attempts (table-level revoke)',
      !!caErr || (caData ?? []).length === 0,
      { caErr, caData },
    );

    // Phase 26 — setter_sessions: a setter may read ONLY their own dialer
    // sessions (setter_sessions_read_own), never another user's. Seed one row
    // for the setter and one for the owner, then verify isolation.
    const sessSetterId = await setterId(setterEmail);
    const { data: ownerForSess } = await admin
      .from('users').select('id').eq('role', 'owner').limit(1).single();
    const nowSess = new Date().toISOString();
    const seededSessions = [
      { setter_id: sessSetterId, state: 'active', started_at: nowSess, ended_at: nowSess, last_heartbeat_at: nowSess },
      ...(ownerForSess
        ? [{ setter_id: ownerForSess.id, state: 'active', started_at: nowSess, ended_at: nowSess, last_heartbeat_at: nowSess }]
        : []),
    ];
    const { data: insertedSess } = await admin
      .from('setter_sessions').insert(seededSessions).select('id');
    const { data: sessRows, error: sessErr } = await setterPortal
      .from('setter_sessions').select('setter_id, state');
    check(
      'setter reads only their own setter_sessions (never another user\'s)',
      !sessErr && (sessRows ?? []).length >= 1 && (sessRows ?? []).every((r) => r.setter_id === sessSetterId),
      { sessErr, sessRows },
    );
    // Clean up seeded rows so the fixture stays tidy.
    if (insertedSess?.length) {
      await admin.from('setter_sessions').delete().in('id', insertedSess.map((r) => r.id));
    }

    // Cannot read agency_settings (owner-only table)
    const { data: asData, error: asErr } = await setterPortal
      .from('agency_settings').select('id');
    check(
      'setter cannot read agency_settings',
      !!asErr || (asData ?? []).length === 0,
      { asErr, asData },
    );

    // Cannot read data_requests (owner-only table)
    const { data: drData, error: drErr } = await setterPortal
      .from('data_requests').select('id');
    check(
      'setter cannot read any data_requests (owner-only RLS)',
      !!drErr || (drData ?? []).length === 0,
      { drErr, drData },
    );

    // Phase 12 — setter can update their own avatar_url via RPC (not raw UPDATE)
    const ownId = await setterId(setterEmail);
    const { error: ownAvatarErr } = await setterPortal.rpc('update_own_avatar', {
      new_url: 'https://example.com/test-avatar.jpg',
    });
    check(
      'setter can call update_own_avatar RPC (updates own avatar_url)',
      !ownAvatarErr,
      { ownAvatarErr },
    );
    // Clean up — reset avatar_url so seed stays clean
    await admin.from('users').update({ avatar_url: null }).eq('id', ownId);

    // Setter cannot upload to another setter's storage folder.
    // We verify the storage INSERT policy by checking the path constraint:
    // any object whose first path segment != auth.uid() is rejected.
    // We use the owner's ID as the "other" folder.
    const { data: ownerRow } = await admin.from('users').select('id').eq('role', 'owner').limit(1).single();
    if (ownerRow) {
      const fakeFile = new Blob(['x'], { type: 'image/jpeg' });
      const { error: storageErr } = await setterPortal.storage
        .from('setter-avatars')
        .upload(`${ownerRow.id}/fake.jpg`, fakeFile, { upsert: false });
      check(
        "setter cannot upload to another user's storage folder",
        !!storageErr,
        { storageErr: storageErr?.message },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Phase 20 — Confirmer role: can read appointments + leads (safe cols),
  // cannot read money, clients, invoices, audit log, or other agency data.
  // -----------------------------------------------------------------------
  console.log('Confirmer view (confirmer@sunline.test):');
  {
    // Can read own users row
    const confirmerId = await setterId(confirmerEmail);
    const { data: selfRow, error: selfErr } = await confirmerPortal
      .from('users').select('id, role').eq('id', confirmerId);
    check(
      'confirmer can read their own users row',
      !selfErr && (selfRow?.length ?? 0) === 1,
      { selfErr, selfRow },
    );

    // CAN read appointments (cross-client, to manage the queue)
    const { data: apptData, error: apptErr } = await confirmerPortal
      .from('appointments').select('id, outcome, confirmed_at, appt_date').limit(5);
    check(
      'confirmer can read appointments (queue management)',
      !apptErr && (apptData ?? []).length >= 0,   // >= 0: queue might be empty
      { apptErr, rowCount: apptData?.length },
    );

    // CAN read leads (safe columns only — for homeowner contact)
    const { data: leadData, error: leadErr } = await confirmerPortal
      .from('leads').select('id, name, phone, address').limit(5);
    check(
      'confirmer can read leads (safe columns only)',
      !leadErr && (leadData ?? []).length >= 0,
      { leadErr, rowCount: leadData?.length },
    );

    // CANNOT read agency-only lead columns
    const hiddenLeadCols = ['notes', 'campaign_source', 'consent_at', 'no_answer_count'];
    for (const col of hiddenLeadCols) {
      const res = await confirmerPortal
        .from('leads')
        .select(`id, ${col}` as '*')
        .limit(1);
      const error = res.error;
      const data = (res.data ?? []) as Record<string, unknown>[];
      check(
        `confirmer cannot read leads.${col} (column-level revoke)`,
        !!error || data.every((r) => !(col in r)),
        { error, data },
      );
    }

    // CANNOT read invoices (money)
    const { data: invData, error: invErr } = await confirmerPortal
      .from('invoices').select('id, total');
    check(
      'confirmer cannot read any invoices (money)',
      !!invErr || (invData ?? []).length === 0,
      { invErr, invData },
    );

    // CANNOT read clients (agency commercial data)
    const { data: clData, error: clErr } = await confirmerPortal
      .from('clients').select('id, company');
    check(
      'confirmer cannot read any clients rows (no RLS policy for confirmer)',
      !!clErr || (clData ?? []).length === 0,
      { clErr, clData },
    );

    // CANNOT read campaign_spend
    const { data: csData, error: csErr } = await confirmerPortal
      .from('campaign_spend').select('campaign_id, amount');
    check(
      'confirmer cannot read campaign_spend (table-level revoke)',
      !!csErr || (csData ?? []).length === 0,
      { csErr, csData },
    );

    // CANNOT read call_dispositions
    const { data: cdData, error: cdErr } = await confirmerPortal
      .from('call_dispositions').select('id');
    check(
      'confirmer cannot read call_dispositions (table-level revoke)',
      !!cdErr || (cdData ?? []).length === 0,
      { cdErr, cdData },
    );

    // CANNOT read confirmation_attempts (table-level revoke; server uses admin client)
    const { data: caData, error: caErr } = await confirmerPortal
      .from('confirmation_attempts').select('id');
    check(
      'confirmer cannot read confirmation_attempts (table-level revoke)',
      !!caErr || (caData ?? []).length === 0,
      { caErr, caData },
    );

    // CANNOT read audit_log
    const { data: auData, error: auErr } = await confirmerPortal
      .from('audit_log').select('id').limit(5);
    check(
      'confirmer cannot read audit_log',
      !!auErr || (auData ?? []).length === 0,
      { auErr, auData },
    );

    // CANNOT read agency_settings
    const { data: asData, error: asErr } = await confirmerPortal
      .from('agency_settings').select('id');
    check(
      'confirmer cannot read agency_settings',
      !!asErr || (asData ?? []).length === 0,
      { asErr, asData },
    );

    // CANNOT read data_requests
    const { data: drData, error: drErr } = await confirmerPortal
      .from('data_requests').select('id');
    check(
      'confirmer cannot read data_requests',
      !!drErr || (drData ?? []).length === 0,
      { drErr, drData },
    );

    // CANNOT read clients.ad_spend_monthly (column-level revoke)
    const { data: adData, error: adErr } = await confirmerPortal
      .from('clients')
      .select('id, ad_spend_monthly');
    check(
      'confirmer cannot read clients.ad_spend_monthly (column-level revoke)',
      !!adErr || (adData ?? []).every((r: Record<string, unknown>) => !('ad_spend_monthly' in r)),
      { adErr, adData },
    );

    // appointment_events: confirmer sees 0 rows (SELECT revoked from authenticated)
    const { data: aeData, error: aeErr } = await confirmerPortal
      .from('appointment_events').select('id').limit(5);
    check(
      'confirmer cannot read appointment_events via JWT (table-level SELECT revoked)',
      !!aeErr || (aeData ?? []).length === 0,
      { aeErr, aeData },
    );

    // == Confirmer expanded checks (Phase 21) ==

    // New columns (callback_at, snooze_until, notes, flagged) readable on appointments
    const { data: extData, error: extErr } = await confirmerPortal
      .from('appointments')
      .select('id, callback_at, snooze_until, notes, flagged')
      .limit(1);
    check(
      'confirmer can read new Phase 21 appointment columns',
      !extErr,
      { extErr, rowCount: extData?.length },
    );

    // sms_templates: confirmer can read
    const { data: smsData, error: smsErr } = await confirmerPortal
      .from('sms_templates')
      .select('id, name, body')
      .limit(5);
    check(
      'confirmer can read sms_templates (confirmer_read policy)',
      !smsErr,
      { smsErr, rowCount: smsData?.length },
    );

    // sms_templates: confirmer CANNOT write
    const { error: smsInsertErr } = await confirmerPortal
      .from('sms_templates')
      .insert({ name: 'HACK', body: 'bad template' });
    check(
      'confirmer cannot insert into sms_templates (owner-only write)',
      !!smsInsertErr,
      { smsInsertErr: smsInsertErr?.message },
    );

    // confirmer cannot read invoices (money guard)
    const { data: inv2Data, error: inv2Err } = await confirmerPortal
      .from('invoices').select('id, total').limit(1);
    check(
      'confirmer cannot read invoices (Phase 21 recheck)',
      !!inv2Err || (inv2Data ?? []).length === 0,
      { inv2Err, inv2Data },
    );

    // confirmer cannot read allocations if table exists
    const { data: allocData, error: allocErr } = await confirmerPortal
      .from('cost_allocations').select('id').limit(1);
    check(
      'confirmer cannot read cost_allocations',
      !!allocErr || (allocData ?? []).length === 0,
      { allocErr, allocData },
    );
  }

  // -----------------------------------------------------------------------
  // Phase 22 — portal_activity (churn-risk login tracking): owner-only.
  // -----------------------------------------------------------------------
  console.log('Churn risk — portal_activity access controls:');
  {
    // Seed a test entry via service role
    const { data: seedPa, error: seedPaErr } = await admin
      .from('portal_activity')
      .insert({ client_id: bright.id, event_type: 'login' })
      .select('id')
      .single();
    check('service role can insert into portal_activity', !seedPaErr && !!seedPa?.id, { seedPaErr });

    // Owner can read portal_activity
    const { data: ownerPa, error: ownerPaErr } = await ownerClient
      .from('portal_activity')
      .select('id, client_id, event_type')
      .limit(5);
    check(
      'owner can read portal_activity (churn scoring)',
      !ownerPaErr && (ownerPa?.length ?? 0) > 0,
      { ownerPaErr, count: ownerPa?.length },
    );

    // Client cannot read portal_activity
    const { data: clientPa, error: clientPaErr } = await clientPortal
      .from('portal_activity')
      .select('id');
    check(
      'client cannot read portal_activity (owner-only RLS)',
      !!clientPaErr || (clientPa ?? []).length === 0,
      { clientPaErr, clientPa },
    );

    // Setter cannot read portal_activity
    const { data: setPa, error: setPaErr } = await setterPortal
      .from('portal_activity')
      .select('id');
    check(
      'setter cannot read portal_activity (owner-only RLS)',
      !!setPaErr || (setPa ?? []).length === 0,
      { setPaErr, setPa },
    );

    // Confirmer cannot read portal_activity
    const { data: conPa, error: conPaErr } = await confirmerPortal
      .from('portal_activity')
      .select('id');
    check(
      'confirmer cannot read portal_activity (owner-only RLS)',
      !!conPaErr || (conPa ?? []).length === 0,
      { conPaErr, conPa },
    );

    // Clean up seed entry
    if (seedPa?.id) {
      await admin.from('portal_activity').delete().eq('id', seedPa.id);
    }
  }

  // -----------------------------------------------------------------------
  // Phase 18 — Audit log: owner-only read, append-only (no update/delete).
  // -----------------------------------------------------------------------
  console.log('Audit log access controls:');
  {
    // 1. Seed a test entry via the service role so we have at least one row.
    const { data: seedEntry, error: seedErr } = await admin
      .from('audit_log')
      .insert({
        actor_id:   null,
        actor_role: 'system',
        action_type: 'test.rls_check',
        entity_type: 'test',
        entity_id:  null,
        description: 'RLS verification test entry',
      })
      .select('id')
      .single();
    check('service role can insert into audit_log', !seedErr && !!seedEntry?.id, { seedErr });

    // 2. Owner can read the entry.
    const { data: ownerAudit, error: ownerAuditErr } = await ownerClient
      .from('audit_log').select('id').limit(10);
    check(
      'owner can read audit_log',
      !ownerAuditErr && (ownerAudit?.length ?? 0) > 0,
      { ownerAuditErr, ownerAudit },
    );

    // 3. Client cannot read audit_log.
    const { data: clientAudit, error: clientAuditErr } = await clientPortal
      .from('audit_log').select('id').limit(10);
    check(
      'client cannot read audit_log',
      !!clientAuditErr || (clientAudit ?? []).length === 0,
      { clientAuditErr, clientAudit },
    );

    // 4. Setter cannot read audit_log.
    const { data: setterAudit, error: setterAuditErr } = await setterPortal
      .from('audit_log').select('id').limit(10);
    check(
      'setter cannot read audit_log',
      !!setterAuditErr || (setterAudit ?? []).length === 0,
      { setterAuditErr, setterAudit },
    );

    // 4b. Confirmer cannot read audit_log (checked above but restate in audit section).
    const { data: confirmerAudit, error: confirmerAuditErr } = await confirmerPortal
      .from('audit_log').select('id').limit(10);
    check(
      'confirmer cannot read audit_log',
      !!confirmerAuditErr || (confirmerAudit ?? []).length === 0,
      { confirmerAuditErr, confirmerAudit },
    );

    // 5. Service role cannot UPDATE rows (append-only trigger).
    if (seedEntry?.id) {
      const { error: updateErr } = await admin
        .from('audit_log')
        .update({ description: 'tampered' })
        .eq('id', seedEntry.id);
      check(
        'audit_log is append-only — update rejected by trigger',
        !!updateErr,
        { updateErr: updateErr?.message },
      );

      // 6. Service role cannot DELETE rows (append-only trigger).
      const { error: deleteErr } = await admin
        .from('audit_log')
        .delete()
        .eq('id', seedEntry.id);
      check(
        'audit_log is append-only — delete rejected by trigger',
        !!deleteErr,
        { deleteErr: deleteErr?.message },
      );
    }
  }

  // -----------------------------------------------------------------------
  // Demo client view — optional. Runs only when DEMO_CLIENT_EMAIL and
  // DEMO_CLIENT_PASSWORD are set and seed:demo has been run first.
  // Verifies the demo account is as isolated as any real client.
  // -----------------------------------------------------------------------
  if (demoEmail && demoPassword) {
    console.log(`Demo client view (${demoEmail}):`);
    try {
      const demoPortal = await signedInClient(demoEmail, demoPassword);

      const { data: demoCs } = await admin.from('clients').select('id, company, is_demo');
      const demoClient = demoCs?.find((c) => c.is_demo);

      if (!demoClient) {
        console.log('  ⚠ Demo client not found in DB — run npm run seed:demo first, then re-verify.');
      } else {
        // Demo client should only see its own clients row
        const { data: portalCs } = await demoPortal.from('clients').select('id');
        check('demo client sees only its own clients row',
          portalCs?.length === 1 && portalCs[0].id === demoClient.id, portalCs);

        // Demo client should not see BrightRoof or Northwind rows
        const { data: otherCs } = await demoPortal.from('clients').select('id').neq('id', demoClient.id);
        check('demo client cannot see other tenants\' clients rows',
          (otherCs ?? []).length === 0, otherCs);

        // Demo appointments are scoped to demo client
        const { data: demoAppts } = await demoPortal.from('appointments').select('id, client_id');
        check('demo client sees only its own appointments',
          (demoAppts ?? []).every((a) => a.client_id === demoClient.id) && (demoAppts?.length ?? 0) > 0,
          demoAppts);

        // Demo invoices are scoped to demo client
        const { data: demoInvs } = await demoPortal.from('invoices').select('id, client_id');
        check('demo client sees only its own invoices',
          (demoInvs ?? []).every((i) => i.client_id === demoClient.id) && (demoInvs?.length ?? 0) > 0,
          demoInvs);

        // Agency-only columns still hidden for demo client
        const { error: adErr, data: adData } = await demoPortal
          .from('clients').select('id, ad_spend_monthly');
        check('demo client cannot read ad_spend_monthly',
          !!adErr || (adData ?? []).every((r: Record<string, unknown>) => !('ad_spend_monthly' in r)),
          { adErr, adData });

        const { error: mmErr, data: mmData } = await demoPortal
          .from('clients').select('id, management_markup_pct');
        check('demo client cannot read management_markup_pct',
          !!mmErr || (mmData ?? []).every((r: Record<string, unknown>) => !('management_markup_pct' in r)),
          { mmErr, mmData });

        const { data: demoCsAll } = await demoPortal.from('campaign_spend').select('id');
        check('demo client cannot read campaign_spend',
          (demoCsAll ?? []).length === 0, demoCsAll);
      }
    } catch (e: unknown) {
      console.log('  ⚠ Demo client sign-in failed — run seed:demo first.', e instanceof Error ? e.message : e);
    }
  } else {
    console.log('Demo client view: skipped (set DEMO_CLIENT_EMAIL + DEMO_CLIENT_PASSWORD to run).');
  }

  // -----------------------------------------------------------------------
  // SOP documents — owner-only
  // -----------------------------------------------------------------------
  console.log('SOP documents (owner-only):');
  {
    const { data: ownerSops } = await ownerClient.from('sop_documents').select('id, key');
    check('owner can read sop_documents', (ownerSops?.length ?? 0) >= 4, ownerSops);

    const { data: ownerEdit, error: ownerEditErr } = await ownerClient
      .from('sop_documents')
      .update({ updated_at: new Date().toISOString() })
      .eq('key', 'setter')
      .select('id');
    check('owner can update sop_documents', !ownerEditErr && (ownerEdit?.length ?? 0) > 0, ownerEditErr);

    const { data: clientSops } = await clientPortal.from('sop_documents').select('id');
    check('client cannot read sop_documents', (clientSops?.length ?? 0) === 0, clientSops);

    const { data: setterSops } = await setterPortal.from('sop_documents').select('id');
    check('setter cannot read sop_documents', (setterSops?.length ?? 0) === 0, setterSops);

    const { data: confirmerSops } = await confirmerPortal.from('sop_documents').select('id');
    check('confirmer cannot read sop_documents', (confirmerSops?.length ?? 0) === 0, confirmerSops);
  }

  // -----------------------------------------------------------------------
  // Phase 28 — installer_enquiries (incl. the /for-installers self-audit
  // funnel). Owner-only: SELECT is revoked from the `authenticated` role, so
  // NO JWT role (client / setter / confirmer, and even an owner JWT) can read
  // it — the app reads it via the service role. Inserts happen server-side.
  // -----------------------------------------------------------------------
  console.log('Installer enquiries (self-audit funnel) access controls:');
  {
    // Seed a self-audit enquiry via the service role, with audit numbers.
    const { data: seedEnq, error: seedEnqErr } = await admin
      .from('installer_enquiries')
      .insert({
        name: 'RLS Test Installer',
        company: 'RLS Test Co',
        email: 'rls-test@example.com',
        source: 'installer_self_audit',
        audit_monthly_spend: 2000,
        audit_appointments: 20,
        audit_close_rate: 20,
        audit_cost_per_sale: 500,
      })
      .select('id, source, audit_monthly_spend, audit_cost_per_sale')
      .single();
    check(
      'service role can insert an installer_self_audit enquiry with audit numbers',
      !seedEnqErr &&
        !!seedEnq?.id &&
        seedEnq.source === 'installer_self_audit' &&
        Number(seedEnq.audit_monthly_spend) === 2000 &&
        Number(seedEnq.audit_cost_per_sale) === 500,
      { seedEnqErr, seedEnq },
    );

    // Every authenticated JWT role must see ZERO rows (SELECT revoked).
    for (const [label, portal] of [
      ['owner', ownerClient],
      ['client', clientPortal],
      ['setter', setterPortal],
      ['confirmer', confirmerPortal],
    ] as const) {
      const { data, error } = await portal
        .from('installer_enquiries')
        .select('id, name, audit_cost_per_sale');
      check(
        `${label} cannot read installer_enquiries via JWT (SELECT revoked from authenticated)`,
        !!error || (data ?? []).length === 0,
        { label, error, rowCount: data?.length },
      );
    }

    // Clean up the seeded enquiry.
    if (seedEnq?.id) {
      await admin.from('installer_enquiries').delete().eq('id', seedEnq.id);
    }
  }

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log('\nAll RLS checks passed.');
}

async function setterId(email: string): Promise<string> {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) break;
    page += 1;
  }
  throw new Error(`User not found: ${email}`);
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
