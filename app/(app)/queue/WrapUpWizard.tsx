'use client';
import { useState } from 'react';
import type { LeadQueue } from '@/lib/types';

type WrapUpStep =
  | 'homeowner'
  | 'existing_solar'
  | 'solar_details'
  | 'monthly_bill'
  | 'income'
  | 'decision_makers'
  | 'co_owner'
  | 'roof'
  | 'credit'
  | 'schedule'
  | 'disqual_preview';

interface Answers {
  is_homeowner: boolean | null;
  already_has_solar: boolean | null;
  existing_system_size_kw: string;
  existing_system_age_years: string;
  solar_intention: string;
  monthly_bill_band: string;
  income_status: string;
  all_decision_makers_present: boolean | null;
  co_owner_available: boolean | null;
  roof_type: string;
  credit_status: string;
  appt_date: string;
  notes: string;
}

const DISQUAL_LABELS: Record<string, string> = {
  not_homeowner: 'Not the homeowner',
  income_ineligible: 'Income not eligible for finance',
  decision_maker_unavailable: 'Co-owner / decision-maker unavailable',
  roof_unsuitable: 'Roof not suitable for solar',
  credit_affordability: 'Would not qualify for finance',
};

const BILL_OPTIONS = [
  { value: 'band_0_50',    label: 'Under £50 / month' },
  { value: 'band_50_100',  label: '£50 – £100 / month' },
  { value: 'band_100_150', label: '£100 – £150 / month' },
  { value: 'band_150_200', label: '£150 – £200 / month' },
  { value: 'band_200_plus', label: 'Over £200 / month' },
];

const INCOME_OPTIONS = [
  { value: 'employed_paye',        label: 'Employed (PAYE)',         disqualifies: false },
  { value: 'self_employed',        label: 'Self-employed',            disqualifies: false },
  { value: 'self_funded_retiree',  label: 'Self-funded retiree',      disqualifies: false },
  { value: 'state_pension_only',   label: 'State pension only',       disqualifies: true  },
  { value: 'no_income',            label: 'No income',                disqualifies: true  },
];

const ROOF_OPTIONS = [
  { value: 'pitched_tiles', label: 'Pitched – tiles',               disqualifies: false },
  { value: 'pitched_slate', label: 'Pitched – slate',               disqualifies: false },
  { value: 'flat',          label: 'Flat roof (ballast mount)',      disqualifies: false },
  { value: 'metal',         label: 'Metal roof',                    disqualifies: false },
  { value: 'other',         label: 'Other / not sure',              disqualifies: false },
  { value: 'not_suitable',  label: 'Not suitable for solar',        disqualifies: true  },
];

const CREDIT_OPTIONS = [
  { value: 'good',          label: 'Good credit',                   disqualifies: false },
  { value: 'fair',          label: 'Fair credit',                   disqualifies: false },
  { value: 'poor_declined', label: 'Poor credit / previously declined', disqualifies: false },
  { value: 'cash_buyer',    label: 'Cash buyer (no finance needed)', disqualifies: false },
  { value: 'not_eligible',  label: 'Would not qualify for finance', disqualifies: true  },
];

// Fractional progress for each step (out of 8 total mandatory steps)
const STEP_PROGRESS: Record<WrapUpStep, number> = {
  homeowner:          1,
  existing_solar:     2,
  solar_details:      2,
  monthly_bill:       3,
  income:             4,
  decision_makers:    5,
  co_owner:           5,
  roof:               6,
  credit:             7,
  schedule:           8,
  disqual_preview:    8,
};

interface Props {
  lead: LeadQueue;
  onComplete: (fd: FormData) => void;
  onCancel: () => void;
  isPending: boolean;
}

export function WrapUpWizard({ lead, onComplete, onCancel, isPending }: Props) {
  const [step, setStep] = useState<WrapUpStep>('homeowner');
  const [history, setHistory] = useState<WrapUpStep[]>([]);
  const [pendingDisqual, setPendingDisqual] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answers>({
    is_homeowner: null,
    already_has_solar: null,
    existing_system_size_kw: '',
    existing_system_age_years: '',
    solar_intention: '',
    monthly_bill_band: '',
    income_status: '',
    all_decision_makers_present: null,
    co_owner_available: null,
    roof_type: '',
    credit_status: '',
    appt_date: '',
    notes: '',
  });

  function goTo(next: WrapUpStep) {
    setHistory((h) => [...h, step]);
    setStep(next);
  }

  function goBack() {
    if (step === 'disqual_preview') {
      setPendingDisqual(null);
    }
    const prev = history[history.length - 1];
    if (prev === undefined) {
      onCancel();
      return;
    }
    setHistory((h) => h.slice(0, -1));
    setStep(prev);
  }

  function setAnswer<K extends keyof Answers>(key: K, value: Answers[K]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function triggerDisqual(reason: string) {
    setPendingDisqual(reason);
    goTo('disqual_preview');
  }

  // ── Step handlers ─────────────────────────────────────────────────────────

  function onHomeowner(val: boolean) {
    setAnswer('is_homeowner', val);
    val ? goTo('existing_solar') : triggerDisqual('not_homeowner');
  }

  function onExistingSolar(val: boolean) {
    setAnswer('already_has_solar', val);
    goTo(val ? 'solar_details' : 'monthly_bill');
  }

  function onSolarDetailsContinue() {
    if (!answers.solar_intention) return;
    goTo('monthly_bill');
  }

  function onBillBand(val: string) {
    setAnswer('monthly_bill_band', val);
    goTo('income');
  }

  function onIncome(val: string, disqualifies: boolean) {
    setAnswer('income_status', val);
    disqualifies ? triggerDisqual('income_ineligible') : goTo('decision_makers');
  }

  function onDecisionMakers(val: boolean) {
    setAnswer('all_decision_makers_present', val);
    goTo(val ? 'roof' : 'co_owner');
  }

  function onCoOwner(val: boolean) {
    setAnswer('co_owner_available', val);
    val ? goTo('roof') : triggerDisqual('decision_maker_unavailable');
  }

  function onRoof(val: string, disqualifies: boolean) {
    setAnswer('roof_type', val);
    disqualifies ? triggerDisqual('roof_unsuitable') : goTo('credit');
  }

  function onCredit(val: string, disqualifies: boolean) {
    setAnswer('credit_status', val);
    disqualifies ? triggerDisqual('credit_affordability') : goTo('schedule');
  }

  // ── Form data builders ────────────────────────────────────────────────────

  function buildFormData(disqualReason?: string): FormData {
    const fd = new FormData();
    fd.set('lead_id', lead.id);
    fd.set('is_homeowner', String(answers.is_homeowner ?? false));
    fd.set('already_has_solar', String(answers.already_has_solar ?? false));
    if (answers.existing_system_size_kw)  fd.set('existing_system_size_kw', answers.existing_system_size_kw);
    if (answers.existing_system_age_years) fd.set('existing_system_age_years', answers.existing_system_age_years);
    if (answers.solar_intention)           fd.set('solar_intention', answers.solar_intention);
    if (answers.monthly_bill_band)         fd.set('monthly_bill_band', answers.monthly_bill_band);
    if (answers.income_status)             fd.set('income_status', answers.income_status);
    if (answers.all_decision_makers_present !== null)
      fd.set('all_decision_makers_present', String(answers.all_decision_makers_present));
    if (answers.co_owner_available !== null)
      fd.set('co_owner_available', String(answers.co_owner_available));
    if (answers.roof_type)    fd.set('roof_type', answers.roof_type);
    if (answers.credit_status) fd.set('credit_status', answers.credit_status);
    if (answers.notes)         fd.set('notes', answers.notes);
    if (disqualReason) {
      fd.set('wrap_disqual_reason', disqualReason);
    } else {
      fd.set('appt_date', answers.appt_date);
    }
    return fd;
  }

  function handleConfirmDisqual() {
    if (!pendingDisqual || isPending) return;
    onComplete(buildFormData(pendingDisqual));
  }

  function handleConfirmBooking() {
    if (!answers.appt_date || isPending) return;
    onComplete(buildFormData());
  }

  // ── Shared style helpers ──────────────────────────────────────────────────

  const progress = STEP_PROGRESS[step] / 8;

  function bigOption(variant: 'neutral' | 'good' | 'bad' = 'neutral') {
    const base =
      'w-full min-h-[64px] px-4 py-4 rounded-xl border-2 text-base font-medium text-left transition-colors disabled:opacity-40';
    if (variant === 'good') return `${base} bg-good/10 text-good border-good/40 hover:bg-good/20 active:bg-good/30`;
    if (variant === 'bad')  return `${base} bg-bad/10 text-bad border-bad/40 hover:bg-bad/20 active:bg-bad/30`;
    return `${base} bg-bg border-hairline text-ink hover:border-ink/40 active:bg-ink/5`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Progress header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={goBack}
          disabled={isPending}
          className="text-xs text-muted hover:text-ink transition-colors shrink-0"
        >
          ← Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted uppercase tracking-wide font-medium mb-1">
            Qualifying wrap-up
          </div>
          <div className="h-1.5 bg-hairline rounded-full overflow-hidden">
            <div
              className="h-full bg-good rounded-full transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Step: homeowner ──────────────────────────────────────────────── */}
      {step === 'homeowner' && (
        <Step title="Is the homeowner present and consenting?">
          <div className="grid grid-cols-2 gap-3">
            <button className={bigOption('good')} onClick={() => onHomeowner(true)}>
              ✓ Yes — homeowner
            </button>
            <button className={bigOption('bad')} onClick={() => onHomeowner(false)}>
              ✗ No / renting
            </button>
          </div>
        </Step>
      )}

      {/* ── Step: existing_solar ─────────────────────────────────────────── */}
      {step === 'existing_solar' && (
        <Step title="Do they already have solar panels?">
          <div className="grid grid-cols-2 gap-3">
            <button className={bigOption()} onClick={() => onExistingSolar(false)}>
              No solar panels
            </button>
            <button className={bigOption()} onClick={() => onExistingSolar(true)}>
              Yes, existing system
            </button>
          </div>
        </Step>
      )}

      {/* ── Step: solar_details ──────────────────────────────────────────── */}
      {step === 'solar_details' && (
        <Step title="Tell us about their existing system">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted mb-1">System size (kW) — if known</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={answers.existing_system_size_kw}
                onChange={(e) => setAnswer('existing_system_size_kw', e.target.value)}
                placeholder="e.g. 3.6"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Age of system (years) — if known</label>
              <input
                type="number"
                min="0"
                value={answers.existing_system_age_years}
                onChange={(e) => setAnswer('existing_system_age_years', e.target.value)}
                placeholder="e.g. 5"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">They are looking to…</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`${bigOption()} ${answers.solar_intention === 'replace' ? '!bg-ink !text-white !border-ink' : ''}`}
                  onClick={() => setAnswer('solar_intention', 'replace')}
                >
                  Replace existing system
                </button>
                <button
                  className={`${bigOption()} ${answers.solar_intention === 'add_on' ? '!bg-ink !text-white !border-ink' : ''}`}
                  onClick={() => setAnswer('solar_intention', 'add_on')}
                >
                  Add more panels
                </button>
              </div>
            </div>
            <button
              onClick={onSolarDetailsContinue}
              disabled={!answers.solar_intention}
              className="w-full py-3 rounded-xl bg-ink text-white font-medium text-sm disabled:opacity-40"
            >
              Continue →
            </button>
          </div>
        </Step>
      )}

      {/* ── Step: monthly_bill ───────────────────────────────────────────── */}
      {step === 'monthly_bill' && (
        <Step title="Monthly electricity bill">
          <div className="space-y-2">
            {BILL_OPTIONS.map((opt) => (
              <button key={opt.value} className={bigOption()} onClick={() => onBillBand(opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
        </Step>
      )}

      {/* ── Step: income ─────────────────────────────────────────────────── */}
      {step === 'income' && (
        <Step title="Income / employment status">
          <div className="space-y-2">
            {INCOME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={bigOption(opt.disqualifies ? 'bad' : 'neutral')}
                onClick={() => onIncome(opt.value, opt.disqualifies)}
              >
                {opt.label}
                {opt.disqualifies && (
                  <span className="block text-xs opacity-70 mt-0.5 font-normal">
                    — likely disqualify
                  </span>
                )}
              </button>
            ))}
          </div>
        </Step>
      )}

      {/* ── Step: decision_makers ────────────────────────────────────────── */}
      {step === 'decision_makers' && (
        <Step title="Will all owners / decision-makers be at the appointment?">
          <div className="grid grid-cols-2 gap-3">
            <button className={bigOption('good')} onClick={() => onDecisionMakers(true)}>
              ✓ Yes, all present
            </button>
            <button className={bigOption()} onClick={() => onDecisionMakers(false)}>
              No, not all
            </button>
          </div>
        </Step>
      )}

      {/* ── Step: co_owner ───────────────────────────────────────────────── */}
      {step === 'co_owner' && (
        <Step title="Can the co-owner / decision-maker attend the appointment?">
          <div className="grid grid-cols-2 gap-3">
            <button className={bigOption('good')} onClick={() => onCoOwner(true)}>
              ✓ Yes, can attend
            </button>
            <button className={bigOption('bad')} onClick={() => onCoOwner(false)}>
              ✗ No, unavailable
            </button>
          </div>
        </Step>
      )}

      {/* ── Step: roof ───────────────────────────────────────────────────── */}
      {step === 'roof' && (
        <Step title="Roof type">
          <div className="space-y-2">
            {ROOF_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={bigOption(opt.disqualifies ? 'bad' : 'neutral')}
                onClick={() => onRoof(opt.value, opt.disqualifies)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Step>
      )}

      {/* ── Step: credit ─────────────────────────────────────────────────── */}
      {step === 'credit' && (
        <Step title="Finance / affordability">
          <div className="space-y-2">
            {CREDIT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={bigOption(opt.disqualifies ? 'bad' : 'neutral')}
                onClick={() => onCredit(opt.value, opt.disqualifies)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Step>
      )}

      {/* ── Step: schedule ───────────────────────────────────────────────── */}
      {step === 'schedule' && (
        <Step title="Book the appointment">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted mb-1">Appointment date &amp; time</label>
              <input
                type="datetime-local"
                value={answers.appt_date}
                onChange={(e) => setAnswer('appt_date', e.target.value)}
                className="input w-full md:w-64"
              />
            </div>
            <div className="text-xs text-muted">
              <span className="font-medium">Address confirmed:</span>{' '}
              {lead.address ?? lead.postcode ?? '—'}
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Notes (optional)</label>
              <input
                type="text"
                value={answers.notes}
                onChange={(e) => setAnswer('notes', e.target.value)}
                placeholder="Anything useful for the installer…"
                className="input w-full"
              />
            </div>
            <button
              onClick={handleConfirmBooking}
              disabled={!answers.appt_date || isPending}
              className="w-full min-h-[64px] rounded-xl bg-good text-white text-base font-semibold
                         hover:bg-good/90 disabled:opacity-40 transition-colors"
            >
              {isPending ? 'Saving…' : '✓ Confirm booking'}
            </button>
          </div>
        </Step>
      )}

      {/* ── Step: disqual_preview ────────────────────────────────────────── */}
      {step === 'disqual_preview' && pendingDisqual && (
        <Step title="Cannot book this appointment">
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-bad/10 border border-bad/30">
              <div className="text-bad font-semibold text-sm">Disqualification reason</div>
              <div className="text-ink font-medium mt-1">
                {DISQUAL_LABELS[pendingDisqual] ?? pendingDisqual}
              </div>
            </div>
            <p className="text-sm text-muted leading-relaxed">
              This lead will be marked as <strong>disqualified</strong>. No appointment
              will be created. The owner can see the reason on the Leads screen.
            </p>
            <button
              onClick={handleConfirmDisqual}
              disabled={isPending}
              className="w-full min-h-[64px] rounded-xl bg-bad text-white text-base font-semibold
                         hover:bg-bad/90 disabled:opacity-40 transition-colors"
            >
              {isPending ? 'Saving…' : 'Confirm — mark as disqualified'}
            </button>
            <button
              type="button"
              onClick={goBack}
              disabled={isPending}
              className="w-full py-3 rounded-xl border border-hairline text-sm text-muted
                         hover:border-ink/30 hover:text-ink transition-colors"
            >
              ← Go back and revise answer
            </button>
          </div>
        </Step>
      )}
    </div>
  );
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-ink leading-snug">{title}</h3>
      {children}
    </div>
  );
}
