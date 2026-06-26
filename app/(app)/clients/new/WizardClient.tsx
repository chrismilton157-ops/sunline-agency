'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { checkOverpromise, createClient } from './actions';

// ---------- types ----------

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type FormState = {
  // Step 1
  company: string;
  contact: string;
  contactEmail: string;
  region: string;
  notes: string;
  // Step 2
  postcodes: string[];   // final trimmed list
  postcodesRaw: string;  // textarea value
  // Step 3
  weeklyPromise: number;
  perSitFee: number;
  managementMarkupPct: number;
  priority: number;
  // Step 5
  loginEmail: string;
  loginPassword: string;
};

type OverpromiseWarning = {
  postcode_prefix: string;
  typical_weekly_leads: number;
  total_promised: number;
};

// ---------- helpers ----------

function parsePostcodes(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ---------- step sub-components ----------

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

// ---------- main wizard ----------

const TOTAL_STEPS = 6;

export default function WizardClient() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<OverpromiseWarning[]>([]);
  const [overrideWarning, setOverrideWarning] = useState(false);
  const [createdLogin, setCreatedLogin] = useState<{ email: string; password: string } | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    company: '',
    contact: '',
    contactEmail: '',
    region: '',
    notes: '',
    postcodes: [],
    postcodesRaw: '',
    weeklyPromise: 5,
    perSitFee: 75,
    managementMarkupPct: 20,
    priority: 100,
    loginEmail: '',
    loginPassword: generatePassword(),
  });

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  // ---------- step navigation ----------

  async function goNext() {
    setError(null);

    if (step === 2) {
      // Persist parsed postcodes before moving on.
      const parsed = parsePostcodes(form.postcodesRaw);
      setForm((f) => ({ ...f, postcodes: parsed }));
    }

    if (step === 3) {
      // Run over-promise check before showing step 4.
      setBusy(true);
      try {
        const postcodes = parsePostcodes(form.postcodesRaw);
        setForm((f) => ({ ...f, postcodes }));
        const result = await checkOverpromise(postcodes, form.weeklyPromise);
        setWarnings(result.warnings);
        setOverrideWarning(false);
      } catch (e) {
        setError('Could not run over-promise check. Check your connection and try again.');
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    if (step === 5) {
      // Pre-fill login email from contact email if blank.
      if (!form.loginEmail && form.contactEmail) {
        setForm((f) => ({ ...f, loginEmail: f.contactEmail }));
      }
    }

    setStep((s) => (s < 6 ? (s + 1) as Step : s));
  }

  function goBack() {
    setError(null);
    setStep((s) => (s > 1 ? (s - 1) as Step : s));
  }

  // ---------- submit ----------

  async function handleCreate() {
    setError(null);
    setBusy(true);
    try {
      const result = await createClient({
        company: form.company,
        contact: form.contact,
        contactEmail: form.contactEmail,
        region: form.region,
        notes: form.notes,
        postcodes: form.postcodes,
        weeklyPromise: form.weeklyPromise,
        perSitFee: form.perSitFee,
        managementMarkupPct: form.managementMarkupPct,
        priority: form.priority,
        loginEmail: form.loginEmail,
        loginPassword: form.loginPassword,
      });

      if (!result.ok) {
        setError(result.error);
        setBusy(false);
        return;
      }

      setCreatedLogin({ email: result.loginEmail, password: result.loginPassword });
      setCreatedClientId(result.clientId);
      setStep(6);
    } catch (e) {
      setError('Unexpected error. Please try again.');
    }
    setBusy(false);
  }

  // ---------- validation per step ----------

  function stepValid(): boolean {
    if (step === 1) return form.company.trim().length > 0;
    if (step === 2) return parsePostcodes(form.postcodesRaw).length > 0;
    if (step === 3) return form.weeklyPromise > 0 && form.perSitFee >= 0;
    if (step === 4) return warnings.length === 0 || overrideWarning;
    if (step === 5) {
      return (
        form.loginEmail.includes('@') &&
        form.loginEmail.includes('.') &&
        form.loginPassword.length >= 8
      );
    }
    return true;
  }

  // ---------- step-4 can skip if no warnings ----------
  // After step 3 we know if warnings exist. If none, auto-advance to step 5.
  // But we still show step 4 if there ARE warnings.

  const progressPct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);

  // ---------- render ----------

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Step {step} of {TOTAL_STEPS}</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-hairline rounded-full overflow-hidden">
          <div
            className="h-full bg-amber rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="card p-6 space-y-6">

        {/* ── Step 1: Company details ── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Company details</h2>
              <p className="text-sm text-muted mt-0.5">Basic info about the installer client.</p>
            </div>

            <FieldRow label="Company name *">
              <input
                className="input w-full"
                placeholder="e.g. Sunbeam Installations Ltd"
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                autoFocus
              />
            </FieldRow>

            <FieldRow label="Contact name">
              <input
                className="input w-full"
                placeholder="e.g. Alex Chapman"
                value={form.contact}
                onChange={(e) => set('contact', e.target.value)}
              />
            </FieldRow>

            <FieldRow label="Contact email" hint="Used to pre-fill the portal login in step 5.">
              <input
                className="input w-full"
                type="email"
                placeholder="alex@sunbeam.co.uk"
                value={form.contactEmail}
                onChange={(e) => set('contactEmail', e.target.value)}
              />
            </FieldRow>

            <FieldRow label="Region">
              <input
                className="input w-full"
                placeholder="e.g. South East"
                value={form.region}
                onChange={(e) => set('region', e.target.value)}
              />
            </FieldRow>

            <FieldRow label="Notes">
              <textarea
                className="input w-full resize-none"
                rows={2}
                placeholder="Any additional notes about this client…"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </FieldRow>
          </div>
        )}

        {/* ── Step 2: Covered postcodes ── */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Covered postcodes</h2>
              <p className="text-sm text-muted mt-0.5">
                Enter the postcode prefixes this client covers — one per line or comma-separated.
                Leads with a matching postcode will be eligible to route to them.
              </p>
            </div>

            <FieldRow label="Postcode prefixes *" hint='e.g. "GU, RH, KT" or one per line. UK area/district codes only (not full postcodes).'>
              <textarea
                className="input w-full font-mono text-sm resize-none"
                rows={6}
                placeholder={"GU\nRH\nKT\nBN"}
                value={form.postcodesRaw}
                onChange={(e) => set('postcodesRaw', e.target.value)}
                autoFocus
              />
            </FieldRow>

            {form.postcodesRaw && (
              <div className="text-xs text-muted">
                Parsed:{' '}
                {parsePostcodes(form.postcodesRaw).map((p) => (
                  <span key={p} className="inline-block bg-amber/10 text-amber-800 rounded px-1.5 py-0.5 mr-1 font-mono">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Commercial terms ── */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Commercial terms</h2>
              <p className="text-sm text-muted mt-0.5">
                These control the routing engine and billing for this client.
              </p>
            </div>

            <FieldRow label="Weekly lead promise *" hint="How many leads per week you're committing to deliver. Used by the routing engine to keep promises balanced.">
              <input
                className="input w-full"
                type="number"
                min={1}
                step={1}
                value={form.weeklyPromise}
                onChange={(e) => set('weeklyPromise', parseInt(e.target.value, 10) || 0)}
              />
            </FieldRow>

            <FieldRow label="Per-appointment fee (£)" hint="What you charge the client per qualifying appointment (sat/sold/no-show).">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">£</span>
                <input
                  className="input w-full pl-7"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.perSitFee}
                  onChange={(e) => set('perSitFee', parseFloat(e.target.value) || 0)}
                />
              </div>
            </FieldRow>

            <FieldRow label="Management markup %" hint="Your agency markup on ad spend that appears on invoices as advertising management. Default 20%.">
              <div className="relative">
                <input
                  className="input w-full pr-7"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={form.managementMarkupPct}
                  onChange={(e) => set('managementMarkupPct', parseFloat(e.target.value) || 0)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">%</span>
              </div>
            </FieldRow>

            <FieldRow label="Routing priority" hint="Lower = higher priority. All new clients default to 100. Rarely needs changing.">
              <input
                className="input w-full"
                type="number"
                min={1}
                step={1}
                value={form.priority}
                onChange={(e) => set('priority', parseInt(e.target.value, 10) || 100)}
              />
            </FieldRow>
          </div>
        )}

        {/* ── Step 4: Over-promise check ── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Over-promise check</h2>
              <p className="text-sm text-muted mt-0.5">
                Checking whether your new commitments are achievable based on typical lead volumes for these postcodes.
              </p>
            </div>

            {warnings.length === 0 ? (
              <div className="rounded-lg border border-good/40 bg-good/5 px-4 py-3 text-sm text-good-dark">
                <strong>No over-promise detected.</strong> The weekly promise for these postcodes is within typical supply. You&apos;re good to go.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-bad/50 bg-bad/5 px-4 py-4 space-y-3">
                  <p className="font-semibold text-bad text-sm">
                    Warning: over-promise detected on {warnings.length} postcode{warnings.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-slate-700">
                    The total leads promised to all clients covering these areas exceeds typical weekly supply.
                    Adding this client at {form.weeklyPromise} leads/week could mean you can't keep all promises.
                  </p>
                  <table className="w-full text-xs mt-2">
                    <thead>
                      <tr className="text-muted uppercase border-b border-hairline">
                        <th className="text-left py-1.5">Prefix</th>
                        <th className="text-right py-1.5">Typical / wk</th>
                        <th className="text-right py-1.5">Total promised</th>
                        <th className="text-right py-1.5">Shortfall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warnings.map((w) => (
                        <tr key={w.postcode_prefix} className="border-b border-hairline last:border-0">
                          <td className="py-1.5 font-mono font-medium">{w.postcode_prefix}</td>
                          <td className="py-1.5 text-right num">{w.typical_weekly_leads}</td>
                          <td className="py-1.5 text-right num text-bad font-medium">{w.total_promised}</td>
                          <td className="py-1.5 text-right num text-bad">
                            −{w.total_promised - w.typical_weekly_leads}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-amber"
                    checked={overrideWarning}
                    onChange={(e) => setOverrideWarning(e.target.checked)}
                  />
                  <span className="text-sm text-slate-700">
                    I understand the risk and want to proceed anyway. I&apos;ll adjust postcodes or promises before this client goes live.
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* ── Step 5: Portal login ── */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Portal login</h2>
              <p className="text-sm text-muted mt-0.5">
                Create the login the client will use to access their portal. You&apos;ll see the password at the end to pass to them.
              </p>
            </div>

            <FieldRow label="Login email *" hint="The email address the client will sign in with.">
              <input
                className="input w-full"
                type="email"
                placeholder="alex@sunbeam.co.uk"
                value={form.loginEmail}
                onChange={(e) => set('loginEmail', e.target.value)}
                autoFocus
              />
            </FieldRow>

            <FieldRow label="Initial password *" hint="At least 8 characters. Pass this to the client — they can change it after first login.">
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono text-sm"
                  type="text"
                  value={form.loginPassword}
                  onChange={(e) => set('loginPassword', e.target.value)}
                />
                <button
                  type="button"
                  className="btn text-xs px-3 py-2 whitespace-nowrap"
                  onClick={() => set('loginPassword', generatePassword())}
                >
                  Regenerate
                </button>
              </div>
            </FieldRow>
          </div>
        )}

        {/* ── Step 6: Review & confirm / success ── */}
        {step === 6 && (
          <div className="space-y-5">
            {!createdLogin ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">Review & confirm</h2>
                  <p className="text-sm text-muted mt-0.5">Check everything before creating the client.</p>
                </div>

                <div className="space-y-4 text-sm">
                  <Section label="Company">
                    <Row k="Company" v={form.company} />
                    <Row k="Contact" v={form.contact || '—'} />
                    <Row k="Email" v={form.contactEmail || '—'} />
                    <Row k="Region" v={form.region || '—'} />
                    {form.notes && <Row k="Notes" v={form.notes} />}
                  </Section>

                  <Section label="Covered postcodes">
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {form.postcodes.map((p) => (
                        <span key={p} className="bg-amber/10 text-amber-800 rounded px-2 py-0.5 font-mono text-xs">
                          {p}
                        </span>
                      ))}
                    </div>
                  </Section>

                  <Section label="Commercial terms">
                    <Row k="Weekly promise" v={`${form.weeklyPromise} leads/wk`} />
                    <Row k="Per-appointment fee" v={`£${form.perSitFee.toFixed(2)}`} />
                    <Row k="Management markup" v={`${form.managementMarkupPct}%`} />
                    <Row k="Routing priority" v={String(form.priority)} />
                  </Section>

                  <Section label="Portal login">
                    <Row k="Email" v={form.loginEmail} />
                    <Row k="Password" v={form.loginPassword} mono />
                  </Section>

                  {warnings.length > 0 && (
                    <div className="rounded-md border border-bad/40 bg-bad/5 px-3 py-2 text-xs text-bad">
                      Over-promise warning acknowledged — {warnings.length} postcode{warnings.length !== 1 ? 's' : ''} flagged.
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* ─ Success screen ─ */
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="text-3xl">✓</div>
                  <h2 className="text-lg font-semibold text-slate-800">Client created</h2>
                  <p className="text-sm text-muted">
                    {form.company} is now live in the system, eligible for routing, and has a portal login.
                  </p>
                </div>

                <div className="rounded-lg border border-amber/40 bg-amber/5 px-4 py-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-800">Portal login details — pass these to the client</p>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <span className="text-muted">URL</span>
                    <span className="font-mono text-xs break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/login</span>
                    <span className="text-muted">Email</span>
                    <span className="font-mono text-xs">{createdLogin.email}</span>
                    <span className="text-muted">Password</span>
                    <span className="font-mono text-xs">{createdLogin.password}</span>
                  </div>
                </div>

                <div className="rounded-lg border border-hairline bg-bg/60 px-4 py-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-700">What&apos;s next</p>
                  <ul className="text-sm text-muted space-y-1.5 list-disc list-inside">
                    <li>Set up their ad campaign on Meta / Google and link it in <strong>Attribution</strong>.</li>
                    <li>Brief the client: explain the portal, how leads appear, and how appointments are logged.</li>
                    <li>Share the login details above — they can change their password after first sign-in.</li>
                    <li>Check <strong>Routing</strong> to confirm their postcodes are active and no over-promise flags remain.</li>
                    <li>When ad spend is recorded, invoices will generate automatically from <strong>Billing</strong>.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {/* error banner */}
        {error && (
          <div className="rounded-md border border-bad/50 bg-bad/5 px-3 py-2 text-sm text-bad">
            {error}
          </div>
        )}

        {/* navigation buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-hairline">
          {step > 1 && step < 6 && (
            <button
              type="button"
              onClick={goBack}
              className="btn text-sm px-4 py-2"
              disabled={busy}
            >
              ← Back
            </button>
          )}
          {step === 1 && (
            <button
              type="button"
              onClick={() => router.push('/clients')}
              className="btn text-sm px-4 py-2"
            >
              Cancel
            </button>
          )}

          <div className="ml-auto">
            {step < 6 && !createdLogin && (
              <button
                type="button"
                onClick={step === 6 ? handleCreate : goNext}
                disabled={!stepValid() || busy}
                className="btn btn-primary text-sm px-5 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Checking…' : step === 5 ? 'Review →' : 'Next →'}
              </button>
            )}

            {step === 6 && !createdLogin && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy}
                className="btn btn-primary text-sm px-5 py-2 disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create client'}
              </button>
            )}

            {createdLogin && (
              <button
                type="button"
                onClick={() => router.push(`/clients/${createdClientId}`)}
                className="btn btn-primary text-sm px-5 py-2"
              >
                View client →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- tiny review helpers ----------

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted border-b border-hairline pb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{k}</span>
      <span className={`text-right ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
    </div>
  );
}
