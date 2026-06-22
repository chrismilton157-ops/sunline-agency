import 'server-only';
import { getServerAdmin } from './supabase/admin';
import { routeLead, type RoutingClient } from './routing';
import { sendSms } from './sms';

// Sunline Phase 5: lead capture business logic.
//
// All entry points here run server-side and use the SERVICE-ROLE client
// (the public form has no logged-in user, so RLS would block any insert
// via the cookie-auth path). We compensate by validating inputs hard
// and never trusting client-supplied client_id / routing fields.

// ---------- shape from the public form ----------
export type LeadSubmission = {
  name: string;
  phone: string;
  email: string;
  address: string;
  postcode: string;
  is_homeowner: boolean;
  bill_payer: boolean;
  monthly_bill: number | null;
  roof_suitable: boolean;
  finance_interest: boolean;
  notes: string | null;
  campaign_source: string | null;
  consent: boolean;
};

export type LeadCaptureResult =
  | {
      ok: true;
      leadId: string;
      assignedClientId: string | null;
      assignedCompany: string | null;
      ruleFired: string;
      smsSent: boolean;
      smsReason: string | null;
    }
  | { ok: false; error: string };

// ---------- validation ----------

const UK_POSTCODE_RE =
  /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const UK_PHONE_RE =
  /^(?:\+?44|0)\s?\d(?:[\s\d]){8,11}$/;
const EMAIL_RE =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSubmission(s: LeadSubmission): string | null {
  if (!s.name.trim()) return 'Please enter your name.';
  if (!UK_PHONE_RE.test(s.phone)) return 'Please enter a valid UK phone number.';
  if (!EMAIL_RE.test(s.email)) return 'Please enter a valid email address.';
  if (!s.address.trim()) return 'Please enter your full address.';
  if (!UK_POSTCODE_RE.test(s.postcode))
    return 'Please enter a valid UK postcode (e.g. GU2 8AA).';
  if (s.monthly_bill != null && (s.monthly_bill < 0 || s.monthly_bill > 10000))
    return 'Monthly bill looks wrong — enter a number between £0 and £10,000.';
  if (!s.consent) return 'You must agree to be contacted to submit the form.';
  return null;
}

// Extract the postcode prefix (the letters at the start) — what the
// routing engine matches on.
export function postcodePrefix(postcode: string): string {
  const m = postcode.trim().toUpperCase().match(/^[A-Z]{1,2}/);
  return m ? m[0] : '';
}

// ---------- routing state load (admin only — public form has no session) ----------

async function loadRoutingStateAdmin(now: Date): Promise<RoutingClient[]> {
  const admin = getServerAdmin();
  const [clientsRes, postcodesRes, leadsRes] = await Promise.all([
    admin
      .from('clients')
      .select(
        'id, company, joined_at, weekly_promise, priority',
      )
      .eq('status', 'active'),
    admin.from('client_postcodes').select('client_id, postcode_prefix'),
    admin.from('leads').select('client_id, created_at'),
  ]);

  if (clientsRes.error) throw clientsRes.error;
  if (postcodesRes.error) throw postcodesRes.error;
  if (leadsRes.error) throw leadsRes.error;

  const day = now.getUTCDay();
  const daysSinceMon = day === 0 ? 6 : day - 1;
  const weekStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMon,
    ),
  );

  const postcodesByClient = new Map<string, string[]>();
  for (const r of postcodesRes.data ?? []) {
    const list = postcodesByClient.get(r.client_id) ?? [];
    list.push(r.postcode_prefix);
    postcodesByClient.set(r.client_id, list);
  }

  const leads = (leadsRes.data ?? []) as { client_id: string | null; created_at: string }[];

  return (clientsRes.data ?? []).map((c) => {
    const own = leads.filter((l) => l.client_id === c.id);
    return {
      id: c.id,
      company: c.company,
      weekly_promise: Number(c.weekly_promise ?? 0),
      priority: Number(c.priority ?? 100),
      joined_at: c.joined_at,
      leads_this_week: own.filter(
        (l) => new Date(l.created_at).getTime() >= weekStart.getTime(),
      ).length,
      last_lead_at:
        own.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
          ?.created_at ?? null,
      covered_postcodes: postcodesByClient.get(c.id) ?? [],
    };
  });
}

// ---------- main entry: capture + route + notify ----------

export async function captureLead(
  s: LeadSubmission,
  source = 'public_form_v1',
): Promise<LeadCaptureResult> {
  const err = validateSubmission(s);
  if (err) return { ok: false, error: err };

  const now = new Date();
  const admin = getServerAdmin();

  // 1. Route.
  const state = await loadRoutingStateAdmin(now);
  const decision = routeLead(s.postcode, state, now);

  // 2. Build the row. Default 6-month retention; owner can delete sooner.
  const retentionUntil = new Date(now);
  retentionUntil.setUTCMonth(retentionUntil.getUTCMonth() + 6);

  const row = {
    client_id: decision.winnerId,                 // may be null
    name: s.name.trim(),
    phone: s.phone.trim(),
    email: s.email.trim().toLowerCase(),
    address: s.address.trim(),
    postcode: s.postcode.trim().toUpperCase(),
    monthly_bill: s.monthly_bill,
    is_homeowner: s.is_homeowner,
    bill_payer: s.bill_payer,
    roof_suitable: s.roof_suitable,
    finance_interest: s.finance_interest,
    notes: s.notes?.trim() || null,
    campaign_source: s.campaign_source?.trim() || null,
    consent: s.consent,
    consent_at: s.consent ? now.toISOString() : null,
    consent_source: s.consent ? source : null,
    routing_rule_fired: decision.ruleFired,
    data_retention_until: retentionUntil.toISOString(),
    status: 'new' as const,
  };

  const { data: inserted, error: insErr } = await admin
    .from('leads')
    .insert(row)
    .select('id')
    .single();
  if (insErr || !inserted) {
    return { ok: false, error: `Could not save lead: ${insErr?.message ?? 'unknown'}` };
  }

  // 3. Optionally notify (consent-gated below).
  const notify = await notifyLeadAfterCapture(inserted.id);

  return {
    ok: true,
    leadId: inserted.id,
    assignedClientId: decision.winnerId,
    assignedCompany: decision.winnerCompany,
    ruleFired: decision.ruleFired,
    smsSent: notify.sent,
    smsReason: notify.sent ? null : notify.reason,
  };
}

// ---------- consent-gated notify ----------
//
// Re-reads the lead from the DB (defence in depth — never trust the
// in-memory submission for the consent decision) and refuses to send
// unless consent is true AND consent_at is set.

export async function notifyLeadAfterCapture(leadId: string) {
  const admin = getServerAdmin();
  const { data: lead, error } = await admin
    .from('leads')
    .select('id, name, phone, consent, consent_at, client_id')
    .eq('id', leadId)
    .single();
  if (error || !lead) {
    console.error('[leads] notify: lead lookup failed', error);
    return { sent: false as const, reason: 'lead_not_found' };
  }

  // ===== HARD CONSENT BLOCK =====
  if (lead.consent !== true || !lead.consent_at) {
    console.error(
      `[leads] notify BLOCKED: lead ${leadId} has consent=${lead.consent} consent_at=${lead.consent_at}`,
    );
    return { sent: false as const, reason: 'no_consent' };
  }
  if (!lead.phone) {
    return { sent: false as const, reason: 'no_phone' };
  }

  const body =
    `Hi ${(lead.name ?? '').split(' ')[0] || 'there'} — ` +
    `thanks for your interest in solar via Sunline. ` +
    `A local installer will be in touch shortly. ` +
    `Reply STOP to opt out.`;

  return sendSms(lead.phone, body);
}

// ---------- right-to-erasure ----------
//
// Hard delete the lead row. Appointments referencing it cascade-delete
// per the FK definition in migration 0001. The owner is making an
// explicit erasure decision; this is the lever for ICO compliance.

export async function deleteLeadHard(leadId: string): Promise<void> {
  const admin = getServerAdmin();
  const { error } = await admin.from('leads').delete().eq('id', leadId);
  if (error) throw error;
}
