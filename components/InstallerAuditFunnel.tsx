'use client';
import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  submitInstallerAudit,
  type InstallerAuditState,
} from '@/app/for-installers/actions';
import { computeAudit, auditMultiplier } from '@/lib/self-audit';
import { fmtMoney } from '@/lib/format';

// ───────────────────────────────────────────────────────────────────────────
// OWNER: paste your Calendly / scheduling link here to turn the confirmation
// into a real booking step. Leave it empty ('') to keep the simple
// "we'll be in touch" message. Nothing else needs to change.
const SCHEDULING_URL = '';
// ───────────────────────────────────────────────────────────────────────────

const initial: InstallerAuditState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn btn-primary w-full py-3 text-base font-semibold disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Book my 15-minute demo →'}
    </button>
  );
}

export function InstallerAuditFunnel() {
  const [spend, setSpend] = useState('');
  const [appts, setAppts] = useState('');
  const [rate, setRate] = useState('');

  const [state, action] = useFormState(submitInstallerAudit, initial);

  const result = useMemo(
    () =>
      computeAudit({
        monthlySpend: parseFloat(spend),
        appointments: parseFloat(appts),
        closeRatePct: parseFloat(rate),
      }),
    [spend, appts, rate],
  );

  // Whole-number "Nx higher" badge — null when not computable or ≤ 1x.
  const multiplier = useMemo(() => auditMultiplier(result), [result]);

  // Confirmation state — replaces the whole funnel after a successful submit.
  if (state.status === 'success') {
    return (
      <div className="card p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-good/20 mb-4">
          <svg
            className="w-7 h-7 text-good"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-ink mb-2">
          Thanks — we&apos;ve got your numbers.
        </h3>
        <p className="text-muted text-sm max-w-sm mx-auto">
          We&apos;ll be in touch to lock a 15-minute call.
        </p>
        {SCHEDULING_URL && (
          <a
            href={SCHEDULING_URL}
            className="btn btn-primary mt-6 px-6 py-3 font-semibold inline-block"
          >
            Pick a time now →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── 1. The self-audit ─────────────────────────────────────────────── */}
      <div className="card p-6 sm:p-7">
        <h2 className="text-xl font-bold text-ink mb-1">
          Is your current lead spend actually working?
        </h2>
        <p className="text-muted text-sm mb-6">
          Three quick numbers. We&apos;ll show you what you&apos;re really paying
          per sale — nothing to sign up for.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label block mb-1" htmlFor="sa-spend">
              Monthly lead / appointment spend
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">
                £
              </span>
              <input
                id="sa-spend"
                inputMode="numeric"
                value={spend}
                onChange={(e) => setSpend(e.target.value)}
                className="input w-full pl-7 num"
                placeholder="2,000"
                // Subtle brand-amber border so it's clear where to start.
                // (amber is a custom token with no shade scale — inline colour,
                // never a bg-amber-500-style utility, which resolves to yellow.)
                style={{ borderColor: 'rgba(224,123,57,0.55)' }}
              />
            </div>
          </div>
          <div>
            <label className="label block mb-1" htmlFor="sa-appts">
              Appointments (or leads) a month
            </label>
            <input
              id="sa-appts"
              inputMode="numeric"
              value={appts}
              onChange={(e) => setAppts(e.target.value)}
              className="input w-full num"
              placeholder="20"
            />
          </div>
          <div>
            <label className="label block mb-1" htmlFor="sa-rate">
              Share that turn into a sale
            </label>
            <div className="relative">
              <input
                id="sa-rate"
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="input w-full pr-8 num"
                placeholder="20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-sm">
                %
              </span>
            </div>
          </div>
        </div>

        {/* Result */}
        <div className="mt-6">
          {result.valid ? (
            <div
              className="rounded-xl p-5 sm:p-6 text-white"
              style={{ backgroundColor: '#14171C' }}
            >
              {/* Before / after — not two neutral numbers. */}
              <div className="flex items-center gap-3 sm:gap-5">
                {/* You think you pay */}
                <div className="flex-1 min-w-0">
                  <div className="text-white/50 text-xs mb-1.5">
                    You think you pay
                  </div>
                  <div className="text-lg sm:text-xl font-bold num text-white/60 line-through decoration-white/30 decoration-2">
                    {fmtMoney(result.costPerAppointment)}
                  </div>
                  <div className="text-white/40 text-xs mt-1">
                    / appointment
                  </div>
                </div>

                {/* Arrow */}
                <div className="shrink-0 text-white/30" aria-hidden="true">
                  <svg
                    className="w-6 h-6 sm:w-7 sm:h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 5l7 7-7 7M20 12H4"
                    />
                  </svg>
                </div>

                {/* You actually pay */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-xs mb-1.5 font-medium"
                    style={{ color: '#E07B39' }}
                  >
                    You actually pay
                  </div>
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span
                      className="text-3xl sm:text-4xl font-extrabold num leading-none"
                      style={{ color: '#E07B39' }}
                    >
                      {fmtMoney(result.costPerSale)}
                    </span>
                    <span className="text-white/50 text-sm font-medium">
                      / sale
                    </span>
                  </div>
                  {multiplier != null && (
                    <span
                      className="inline-flex items-center mt-2.5 px-2.5 py-1 rounded-full text-xs font-bold text-white num"
                      style={{ backgroundColor: '#E07B39' }}
                    >
                      {multiplier}× higher
                    </span>
                  )}
                </div>
              </div>

              {/* One-line explainer */}
              <p className="text-white/70 text-sm leading-relaxed mt-5 pt-4 border-t border-white/10">
                {multiplier != null ? (
                  <>
                    Once no-shows and dead leads are stripped out, your real cost
                    per sale is{' '}
                    <strong className="text-white num">{multiplier}</strong> times
                    what you thought you were paying per appointment.
                  </>
                ) : (
                  <>
                    That&apos;s your real cost per sale once no-shows and dead
                    leads are stripped out — the number that actually decides
                    whether the spend works.
                  </>
                )}
              </p>
            </div>
          ) : (
            <div className="rounded-xl p-5 bg-bg border border-hairline text-center">
              <p className="text-muted text-sm">
                Enter a few numbers above to see your real cost per sale.
              </p>
            </div>
          )}

          {/* Full-width CTA — scrolls to / reveals the demo request form. */}
          <a
            href="#demo-request"
            className="btn btn-primary w-full mt-4 py-3.5 text-base font-semibold"
          >
            See what qualified, confirmed appointments would do to that number
          </a>
        </div>
      </div>

      {/* ── 2. The demo request ───────────────────────────────────────────── */}
      <div id="demo-request" className="card p-6 sm:p-7 scroll-mt-20">
        <h3 className="text-lg font-bold text-ink mb-1">
          Want to see what qualified, confirmed appointments would do to that
          number?
        </h3>
        <p className="text-muted text-sm mb-6">
          Book a 15-minute demo. We&apos;ll bring your numbers to the call.
        </p>

        <form action={action} className="space-y-4">
          {/* Carry the raw audit inputs so the server recomputes + stores them. */}
          <input type="hidden" name="audit_monthly_spend" value={spend} />
          <input type="hidden" name="audit_appointments" value={appts} />
          <input type="hidden" name="audit_close_rate" value={rate} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label block mb-1" htmlFor="di-name">
                Your name <span className="text-bad">*</span>
              </label>
              <input
                id="di-name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="input w-full"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="label block mb-1" htmlFor="di-company">
                Company <span className="text-bad">*</span>
              </label>
              <input
                id="di-company"
                name="company"
                type="text"
                required
                className="input w-full"
                placeholder="Apex Solar Ltd"
              />
            </div>
            <div>
              <label className="label block mb-1" htmlFor="di-email">
                Email <span className="text-bad">*</span>
              </label>
              <input
                id="di-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="input w-full"
                placeholder="jane@apexsolar.co.uk"
              />
            </div>
            <div>
              <label className="label block mb-1" htmlFor="di-phone">
                Phone <span className="text-muted">(optional)</span>
              </label>
              <input
                id="di-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                className="input w-full"
                placeholder="07700 900000"
              />
            </div>
          </div>
          <div>
            <label className="label block mb-1" htmlFor="di-region">
              Area / postcodes you cover{' '}
              <span className="text-muted">(optional)</span>
            </label>
            <input
              id="di-region"
              name="region"
              type="text"
              className="input w-full"
              placeholder="e.g. South West — BA, BS, TA, EX"
            />
          </div>
          <div>
            <label className="label block mb-1" htmlFor="di-time">
              Preferred day / time for a call{' '}
              <span className="text-muted">(optional)</span>
            </label>
            <input
              id="di-time"
              name="preferred_call_time"
              type="text"
              className="input w-full"
              placeholder="e.g. Weekday mornings, or Tue 2pm"
            />
          </div>

          {state.status === 'error' && (
            <p className="text-bad text-sm">{state.message}</p>
          )}

          <SubmitButton />
          <p className="text-xs text-muted text-center">
            No obligation. We&apos;ll bring your self-audit numbers to the call.
          </p>
        </form>
      </div>
    </div>
  );
}
