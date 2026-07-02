'use client';
import { useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  submitInstallerAudit,
  type InstallerAuditState,
} from '@/app/for-installers/actions';
import { computeAudit } from '@/lib/self-audit';
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
              className="rounded-xl p-5 text-white"
              style={{ backgroundColor: '#14171C' }}
            >
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-white/50 text-xs mb-1">
                    Apparent cost per appointment
                  </div>
                  <div className="text-2xl font-bold num">
                    {fmtMoney(result.costPerAppointment)}
                  </div>
                </div>
                <div>
                  <div className="text-amber text-xs mb-1 font-medium">
                    Your real cost per sale
                  </div>
                  <div
                    className="text-2xl font-bold num"
                    style={{ color: '#E07B39' }}
                  >
                    {fmtMoney(result.costPerSale)}
                  </div>
                </div>
              </div>
              <p className="text-white/80 text-sm leading-relaxed">
                On paper you&apos;re paying about{' '}
                <strong className="text-white">
                  {fmtMoney(result.costPerAppointment)}
                </strong>{' '}
                per appointment — but your real cost per sale is about{' '}
                <strong style={{ color: '#E07B39' }}>
                  {fmtMoney(result.costPerSale)}
                </strong>
                .
              </p>
            </div>
          ) : (
            <div className="rounded-xl p-5 bg-bg border border-hairline text-center">
              <p className="text-muted text-sm">
                Enter a few numbers above to see your real cost per sale.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. The CTA + demo request ─────────────────────────────────────── */}
      <div className="card p-6 sm:p-7">
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
