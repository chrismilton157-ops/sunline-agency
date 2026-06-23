'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { submitLead } from '@/app/apply/actions';
import { BILL_BANDS, type BillBandKey } from '@/lib/qualifying';

// Phase 5b multi-step apply form.
//
// UI-only — same FormData shape lands at the existing submitLead server
// action. The form mirrors every answer into hidden inputs so the
// server contract doesn't change.
//
// Disqualification rules live in lib/qualifying.ts and run server-side
// only. The homeowner always sees the same neutral thank-you, regardless
// of whether their lead gets routed, gets quietly disqualified, or has
// no postcode coverage.

type YN = '' | 'yes' | 'no';

type Answers = {
  postcode: string;
  is_homeowner: YN;
  bill_band: '' | BillBandKey;
  bill_payer: YN;
  roof_suitable: YN;
  finance_interest: YN;
  address: string;
  name: string;
  phone: string;
  email: string;
  consent: boolean;
};

const TOTAL_STEPS = 10;

// Front-loaded progress: huge jump on the first answer, smaller as the
// homeowner nears the end, 100% only when they tick consent. Indexed by
// the CURRENT step (0..9) — i.e. the value shown WHILE that step is on
// screen.
const PROGRESS_BY_STEP = [5, 30, 45, 55, 65, 73, 80, 86, 92, 97];

// Same validation rules as lib/leads.ts — checked client-side so the
// user can't tap-advance with bad input. The server is still the source
// of truth.
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
    bill_band: '',
    bill_payer: '',
    roof_suitable: '',
    finance_interest: '',
    address: '',
    name: '',
    phone: '',
    email: '',
    consent: false,
  });

  const set = <K extends keyof Answers>(k: K, v: Answers[K]) =>
    setA((prev) => ({ ...prev, [k]: v }));

  const next = () => setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  // Any tappable choice (Yes/No or bill band) advances immediately.
  const pickAndAdvance = <K extends keyof Answers>(field: K, value: Answers[K]) => {
    set(field, value);
    next();
  };

  const valid = (s: number): boolean => {
    switch (s) {
      case 0:
        return UK_POSTCODE.test(a.postcode.trim());
      case 1:
        return a.is_homeowner !== '';
      case 2:
        return a.bill_band !== '';
      case 3:
        return a.bill_payer !== '';
      case 4:
        return a.roof_suitable !== '';
      case 5:
        return a.finance_interest !== '';
      case 6:
        return a.address.trim().length > 3;
      case 7:
        return a.name.trim().length > 1;
      case 8:
        // Phone required, email optional but format-valid if filled.
        return (
          UK_PHONE.test(a.phone.trim()) &&
          (a.email.trim() === '' || EMAIL.test(a.email.trim()))
        );
      case 9:
        return a.consent;
      default:
        return false;
    }
  };

  // Progress: front-loaded, hits 100% only when consent is ticked.
  const progressPct =
    step === 9 && a.consent ? 100 : PROGRESS_BY_STEP[step] ?? 100;
  const progressLabel =
    step <= 2
      ? 'Quick start'
      : step <= 5
        ? 'A few quick questions'
        : step <= 8
          ? 'Almost there'
          : 'Final step';

  // Auto-focus the step's primary control whenever the step changes.
  const stepRoot = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = stepRoot.current?.querySelector<HTMLElement>('[data-autofocus]');
    el?.focus();
  }, [step]);

  return (
    <form action={submitLead} className="space-y-6">
      {/* Mirror every answer to a hidden input so the server FormData
          contract is unchanged. The consent hidden is rendered ONLY
          when the box is checked — unchecked consent cannot send `on`. */}
      <input type="hidden" name="campaign_source" value={campaign} />
      <input type="hidden" name="postcode" value={a.postcode} />
      <input type="hidden" name="is_homeowner" value={a.is_homeowner} />
      <input type="hidden" name="bill_band" value={a.bill_band} />
      <input type="hidden" name="bill_payer" value={a.bill_payer} />
      <input type="hidden" name="roof_suitable" value={a.roof_suitable} />
      <input type="hidden" name="finance_interest" value={a.finance_interest} />
      <input type="hidden" name="address" value={a.address} />
      <input type="hidden" name="name" value={a.name} />
      <input type="hidden" name="phone" value={a.phone} />
      <input type="hidden" name="email" value={a.email} />
      {a.consent && <input type="hidden" name="consent" value="on" />}

      {/* Progress bar */}
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
            className="h-full bg-amber transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Step content — key={step} forces a remount so step-in animates. */}
      <div
        key={step}
        ref={stepRoot}
        className="step-in card p-5 md:p-7 min-h-[280px] flex flex-col"
      >
        {step === 0 && (
          <TextStep
            label="What's your postcode?"
            hint="So we can match you with a local installer."
            value={a.postcode}
            placeholder="GU2 8AA"
            inputClass="num uppercase tracking-wide"
            autoComplete="postal-code"
            autoCapitalize="characters"
            onChange={(v) => set('postcode', v.toUpperCase())}
            onNext={() => valid(0) && next()}
            canAdvance={valid(0)}
            error={
              a.postcode && !valid(0) ? 'Enter a valid UK postcode.' : null
            }
          />
        )}

        {step === 1 && (
          <YesNoStep
            label="Do you own your home?"
            hint="Owner-occupiers get the best quotes."
            value={a.is_homeowner}
            onPick={(v) => pickAndAdvance('is_homeowner', v)}
          />
        )}

        {step === 2 && (
          <BandStep
            label="Roughly, your monthly electricity bill?"
            hint="A rough band is fine."
            value={a.bill_band}
            onPick={(v) => pickAndAdvance('bill_band', v)}
          />
        )}

        {step === 3 && (
          <YesNoStep
            label="Are you the bill payer or decision maker?"
            hint="Helps the installer have a useful first conversation."
            value={a.bill_payer}
            onPick={(v) => pickAndAdvance('bill_payer', v)}
          />
        )}

        {step === 4 && (
          <YesNoStep
            label="Is your roof south-facing and mostly unshaded?"
            hint="A best guess is fine."
            value={a.roof_suitable}
            onPick={(v) => pickAndAdvance('roof_suitable', v)}
          />
        )}

        {step === 5 && (
          <YesNoStep
            label="Would you consider finance options?"
            hint="Many installers offer 0% interest packages."
            value={a.finance_interest}
            onPick={(v) => pickAndAdvance('finance_interest', v)}
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
              a.address && !valid(6) ? 'Please enter your full address.' : null
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
            error={a.name && !valid(7) ? 'Please enter your name.' : null}
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
    </form>
  );
}

// ---------- step building blocks ----------

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

function TextStep(props: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  inputClass?: string;
  type?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
  autoComplete?: string;
  autoCapitalize?: string;
  onChange: (v: string) => void;
  onNext: () => void;
  canAdvance: boolean;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 flex-1">
      <Heading title={props.label} hint={props.hint} />
      <input
        data-autofocus
        type={props.type ?? 'text'}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        autoCapitalize={props.autoCapitalize}
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
          Next
        </button>
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
  value: YN;
  onPick: (v: 'yes' | 'no') => void;
}) {
  return (
    <div className="flex flex-col gap-5 flex-1">
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

function BandStep({
  label,
  hint,
  value,
  onPick,
}: {
  label: string;
  hint?: string;
  value: '' | BillBandKey;
  onPick: (v: BillBandKey) => void;
}) {
  return (
    <div className="flex flex-col gap-5 flex-1">
      <Heading title={label} hint={hint} />
      <div className="grid grid-cols-1 gap-2 mt-auto">
        {BILL_BANDS.map((b, i) => (
          <button
            key={b.key}
            data-autofocus={i === 0 ? '' : undefined}
            type="button"
            onClick={() => onPick(b.key)}
            className={`rounded-md border text-base font-medium py-4 text-left px-4
              ${
                value === b.key
                  ? 'bg-amber/10 border-amber text-amber'
                  : 'bg-white border-hairline hover:bg-hairline/30 text-ink'
              }`}
          >
            <span className="num">{b.label}</span>
          </button>
        ))}
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
    <div className="flex flex-col gap-4 flex-1">
      <Heading
        title="How can we reach you?"
        hint="The installer will text or call to arrange a quote."
      />
      <div>
        <label className="label" htmlFor="step-phone">
          Phone
        </label>
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
        <label className="label" htmlFor="step-email">
          Email <span className="text-muted normal-case">(optional)</span>
        </label>
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
    <div className="flex flex-col gap-5 flex-1">
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
          Send my details
        </button>
      </div>
    </div>
  );
}
