'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { submitLead } from '@/app/apply/actions';

// Multi-step version of /apply. Data shape, server action, and consent
// rules are IDENTICAL to the previous single-page form — only the UX
// differs. Form submits via the existing `submitLead` server action; all
// answered fields are mirrored to hidden inputs so the FormData the
// server receives is exactly what it received before.

type Answers = {
  postcode: string;
  is_homeowner: '' | 'yes' | 'no';
  bill_payer: '' | 'yes' | 'no';
  monthly_bill: string;
  roof_suitable: '' | 'yes' | 'no';
  finance_interest: '' | 'yes' | 'no';
  address: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  consent: boolean;
};

const TOTAL_STEPS = 10;

// Same validation rules as lib/leads.ts — checked client-side too so the
// user can't advance past a step with bad input. The server is still the
// source of truth.
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const UK_PHONE = /^(?:\+?44|0)\s?\d(?:[\s\d]){8,11}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ApplyForm({
  campaign,
  initialError,
}: {
  campaign: string;
  initialError: string;
}) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>({
    postcode: '',
    is_homeowner: '',
    bill_payer: '',
    monthly_bill: '',
    roof_suitable: '',
    finance_interest: '',
    address: '',
    name: '',
    phone: '',
    email: '',
    notes: '',
    consent: false,
  });

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) =>
    setA((prev) => ({ ...prev, [k]: v }));

  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  // Yes/No picker auto-advances. Wrap in setTimeout so React commits the
  // state update before the step transitions — gives a beat of visual
  // feedback on the selected button.
  const pickYesNo = (
    field: 'is_homeowner' | 'bill_payer' | 'roof_suitable' | 'finance_interest',
    value: 'yes' | 'no',
  ) => {
    set(field, value);
    setTimeout(next, 140);
  };

  const valid = (s: number): boolean => {
    switch (s) {
      case 0:
        return UK_POSTCODE.test(a.postcode.trim());
      case 1:
        return a.is_homeowner !== '';
      case 2:
        return a.bill_payer !== '';
      case 3:
        // Monthly bill is optional — empty is OK, but if filled, must be sane.
        if (a.monthly_bill === '') return true;
        const n = Number(a.monthly_bill);
        return Number.isFinite(n) && n >= 0 && n <= 10000;
      case 4:
        return a.roof_suitable !== '';
      case 5:
        return a.finance_interest !== '';
      case 6:
        return a.address.trim().length > 3;
      case 7:
        return a.name.trim().length > 1;
      case 8:
        return UK_PHONE.test(a.phone.trim()) && EMAIL.test(a.email.trim());
      case 9:
        return a.consent;
      default:
        return false;
    }
  };

  // Friendly progress label — feels like progress without naming numbers.
  const progressLabel =
    step <= 2
      ? 'Quick start'
      : step <= 5
        ? 'A few quick questions'
        : step <= 8
          ? 'How to reach you'
          : 'Almost there';
  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  // Focus management: when the step changes, move focus to the step's
  // first interactive element. Each step root carries data-autofocus.
  const stepRoot = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stepRoot.current?.querySelector<HTMLElement>(
      '[data-autofocus]',
    );
    el?.focus();
  }, [step]);

  return (
    <form action={submitLead} className="space-y-6">
      {/* All answers are mirrored to hidden inputs — the FormData the
          server action receives is identical to the old long form. The
          consent hidden is rendered ONLY when checked, so unchecked
          consent never sends `on`. */}
      <input type="hidden" name="campaign_source" value={campaign} />
      <input type="hidden" name="postcode" value={a.postcode} />
      <input type="hidden" name="is_homeowner" value={a.is_homeowner} />
      <input type="hidden" name="bill_payer" value={a.bill_payer} />
      <input type="hidden" name="monthly_bill" value={a.monthly_bill} />
      <input type="hidden" name="roof_suitable" value={a.roof_suitable} />
      <input type="hidden" name="finance_interest" value={a.finance_interest} />
      <input type="hidden" name="address" value={a.address} />
      <input type="hidden" name="name" value={a.name} />
      <input type="hidden" name="phone" value={a.phone} />
      <input type="hidden" name="email" value={a.email} />
      <input type="hidden" name="notes" value={a.notes} />
      {a.consent && <input type="hidden" name="consent" value="on" />}

      {/* Progress bar — no count, just a filling bar with a soft label. */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">
            {progressLabel}
          </span>
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="text-xs text-muted hover:text-ink underline underline-offset-2"
            >
              ← Back
            </button>
          )}
        </div>
        <div className="h-1.5 bg-hairline/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Step content. `key={step}` forces a remount so the step-in
          animation plays each transition. */}
      <div
        key={step}
        ref={stepRoot}
        className="step-in card p-5 md:p-7 min-h-[260px] flex flex-col"
      >
        {step === 0 && (
          <TextStep
            label="What's your postcode?"
            hint="So we can match you with a local installer."
            value={a.postcode}
            placeholder="GU2 8AA"
            inputClass="num uppercase"
            autoComplete="postal-code"
            inputMode="text"
            onChange={(v) => set('postcode', v.toUpperCase())}
            onNext={() => valid(0) && next()}
            canAdvance={valid(0)}
            error={!a.postcode || valid(0) ? null : 'Enter a valid UK postcode.'}
          />
        )}

        {step === 1 && (
          <YesNoStep
            label="Do you own your home?"
            hint="Owner-occupiers get the best quotes."
            value={a.is_homeowner}
            onPick={(v) => pickYesNo('is_homeowner', v)}
          />
        )}

        {step === 2 && (
          <YesNoStep
            label="Are you the bill payer or decision maker?"
            hint="Helps the installer have a useful first conversation."
            value={a.bill_payer}
            onPick={(v) => pickYesNo('bill_payer', v)}
          />
        )}

        {step === 3 && (
          <TextStep
            label="Roughly, your monthly electricity bill?"
            hint="A rough number is fine — skip if you'd rather not say."
            value={a.monthly_bill}
            placeholder="£120"
            inputClass="num"
            type="number"
            inputMode="numeric"
            onChange={(v) => set('monthly_bill', v)}
            onNext={() => valid(3) && next()}
            canAdvance={valid(3)}
            optional
            error={
              valid(3) ? null : 'Enter a number between £0 and £10,000.'
            }
          />
        )}

        {step === 4 && (
          <YesNoStep
            label="Is your roof south-facing and mostly unshaded?"
            hint="If you're not sure, your best guess is fine."
            value={a.roof_suitable}
            onPick={(v) => pickYesNo('roof_suitable', v)}
          />
        )}

        {step === 5 && (
          <YesNoStep
            label="Would you consider finance options?"
            hint="Lots of installers offer 0% interest packages."
            value={a.finance_interest}
            onPick={(v) => pickYesNo('finance_interest', v)}
          />
        )}

        {step === 6 && (
          <TextStep
            label="What's your full address?"
            hint="So the installer can plan a site visit."
            value={a.address}
            placeholder="12 Oak Lane, Guildford"
            autoComplete="street-address"
            onChange={(v) => set('address', v)}
            onNext={() => valid(6) && next()}
            canAdvance={valid(6)}
            error={
              !a.address || valid(6) ? null : 'Please enter your full address.'
            }
          />
        )}

        {step === 7 && (
          <TextStep
            label="And your name?"
            hint="So we know who to introduce."
            value={a.name}
            placeholder="Alex Brown"
            autoComplete="name"
            onChange={(v) => set('name', v)}
            onNext={() => valid(7) && next()}
            canAdvance={valid(7)}
            error={
              !a.name || valid(7) ? null : 'Please enter your name.'
            }
          />
        )}

        {step === 8 && (
          <ContactStep
            phone={a.phone}
            email={a.email}
            onChange={(field, v) => set(field, v)}
            onNext={() => valid(8) && next()}
            canAdvance={valid(8)}
          />
        )}

        {step === 9 && (
          <ConsentStep
            checked={a.consent}
            onToggle={(v) => set('consent', v)}
            initialError={initialError}
          />
        )}
      </div>

      <p className="text-[11px] text-muted text-center">
        We&apos;ll never sell your details. UK residential only.
      </p>
    </form>
  );
}

// ---------- step building blocks ----------

function TextStep(props: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  inputClass?: string;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  autoComplete?: string;
  onChange: (v: string) => void;
  onNext: () => void;
  canAdvance: boolean;
  optional?: boolean;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Heading title={props.label} hint={props.hint} />
      <input
        data-autofocus
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            props.onNext();
          }
        }}
        className={`input text-base py-3 ${props.inputClass ?? ''}`}
      />
      {props.error && (
        <p role="alert" className="text-bad text-xs">
          {props.error}
        </p>
      )}
      <div className="mt-auto pt-2">
        <button
          type="button"
          onClick={props.onNext}
          disabled={!props.canAdvance}
          className="btn btn-primary w-full text-base py-3"
        >
          {props.optional ? 'Next' : 'Next'}
        </button>
        {props.optional && (
          <button
            type="button"
            onClick={() => {
              props.onChange('');
              setTimeout(props.onNext, 0);
            }}
            className="block w-full text-center text-xs text-muted hover:text-ink mt-2 underline underline-offset-2"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

function YesNoStep({
  label,
  hint,
  value,
  onPick,
}: {
  label: string;
  hint?: string;
  value: 'yes' | 'no' | '';
  onPick: (v: 'yes' | 'no') => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Heading title={label} hint={hint} />
      <div className="grid grid-cols-2 gap-3 mt-auto">
        <button
          data-autofocus
          type="button"
          onClick={() => onPick('yes')}
          className={`rounded-md border text-base font-medium py-5
            ${
              value === 'yes'
                ? 'bg-amber/10 border-amber text-amber'
                : 'bg-white border-hairline hover:bg-hairline/30 text-ink'
            }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onPick('no')}
          className={`rounded-md border text-base font-medium py-5
            ${
              value === 'no'
                ? 'bg-amber/10 border-amber text-amber'
                : 'bg-white border-hairline hover:bg-hairline/30 text-ink'
            }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

function ContactStep({
  phone,
  email,
  onChange,
  onNext,
  canAdvance,
}: {
  phone: string;
  email: string;
  onChange: (field: 'phone' | 'email', v: string) => void;
  onNext: () => void;
  canAdvance: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Heading
        title="How can we reach you?"
        hint="The installer will text or call to arrange a quote."
      />
      <div>
        <label className="label" htmlFor="step-phone">Phone</label>
        <input
          id="step-phone"
          data-autofocus
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          placeholder="07…"
          onChange={(e) => onChange('phone', e.target.value)}
          className="input mt-1 text-base py-3 num"
        />
      </div>
      <div>
        <label className="label" htmlFor="step-email">Email</label>
        <input
          id="step-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          placeholder="you@example.com"
          onChange={(e) => onChange('email', e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onNext();
            }
          }}
          className="input mt-1 text-base py-3"
        />
      </div>
      <div className="mt-auto pt-2">
        <button
          type="button"
          onClick={onNext}
          disabled={!canAdvance}
          className="btn btn-primary w-full text-base py-3"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ConsentStep({
  checked,
  onToggle,
  initialError,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  initialError: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Heading
        title="One last thing"
        hint="Tick to agree, then send us your enquiry."
      />
      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-md border border-hairline bg-white">
        <input
          data-autofocus
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 w-5 h-5 accent-amber"
        />
        <span className="text-sm text-ink leading-relaxed">
          I agree that Sunline and the matched installer may contact me by
          phone, SMS and email about my solar enquiry. See our{' '}
          <Link
            href="/privacy"
            target="_blank"
            className="text-amber underline underline-offset-2"
          >
            privacy policy
          </Link>
          . You can opt out at any time.
        </span>
      </label>
      {initialError && (
        <p
          role="alert"
          className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-3 py-2"
        >
          {initialError}
        </p>
      )}
      <div className="mt-auto pt-2">
        <button
          type="submit"
          disabled={!checked}
          className="btn btn-primary w-full text-base py-3"
        >
          Get my quote
        </button>
      </div>
    </div>
  );
}

function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-xl md:text-2xl font-semibold tracking-tight leading-snug">
        {title}
      </h2>
      {hint && <p className="text-muted text-sm mt-1.5">{hint}</p>}
    </div>
  );
}
