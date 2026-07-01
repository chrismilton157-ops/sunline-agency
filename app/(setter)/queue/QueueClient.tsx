'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { LeadQueue, CallDispositionType, Pipeline } from '@/lib/types';
import {
  computePipeline,
  attemptStatusLabel,
  effectiveDailyAttempts,
  PIPELINE_SHORT,
  isFirstEverContact,
  isSecondDialOfDoubleDial,
} from '@/lib/setter-cadence';
import {
  serveNextLead,
  releaseLead,
  submitDisposition,
  submitWrapUp,
  setPipelinePref,
} from './actions';
import { WrapUpWizard } from './WrapUpWizard';
import { EmptyState } from '@/components/EmptyState';
import { HelpTooltip } from '@/components/onboarding/HelpTooltip';

const POLL_INTERVAL_MS = 15_000;

const DISPOSITION_LABELS: Record<CallDispositionType, string> = {
  no_answer:         'No answer',
  callback:          'Callback (schedule)',
  qualified_callback:'Qualified callback ★',
  not_interested:    'Not interested',
  wrong_number:      'Wrong number',
  disqualified:      'Disqualified',
  booked:            'Booked ✓',
};

// Dispositions that close the call without booking
const NORMAL_DISPOSITIONS: CallDispositionType[] = [
  'no_answer', 'qualified_callback', 'callback', 'not_interested', 'wrong_number', 'disqualified',
];

function timeSince(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function YesNo({ val }: { val: boolean | null }) {
  if (val == null) return <span className="text-muted">—</span>;
  return val
    ? <span className="text-good font-medium">Yes</span>
    : <span className="text-bad font-medium">No</span>;
}

interface Props {
  leads: LeadQueue[];
  userId: string;
  initialPipelinePref: Pipeline | null;
}

export function QueueClient({ leads, userId, initialPipelinePref }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [disposition, setDisposition] = useState<CallDispositionType | ''>('');
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [bookedSuccess, setBookedSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [pipelinePref, setPipelinePrefState] = useState<Pipeline | null>(initialPipelinePref);
  const [noLeadAvailable, setNoLeadAvailable] = useState(false);
  const autoServedRef = useRef(false);

  const activeLead = leads.find((l) => l.queue_claimed_by === userId) ?? null;

  // Sync paused / no-lead state when leads refresh
  useEffect(() => {
    if (activeLead) {
      setNoLeadAvailable(false);
      autoServedRef.current = false;
    }
  }, [activeLead]);

  // Poll for new leads
  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  function showError(msg: string) {
    setActionError(msg);
    setTimeout(() => setActionError(null), 5000);
  }

  // Auto-serve: called on mount (if no active lead) and after each disposition
  const autoServe = useCallback(
    (pipeline: Pipeline | null = pipelinePref) => {
      if (paused) return;
      if (activeLead) return;
      if (autoServedRef.current) return;
      autoServedRef.current = true;
      startTransition(async () => {
        try {
          const id = await serveNextLead(pipeline);
          if (!id) {
            setNoLeadAvailable(true);
            autoServedRef.current = false;
          }
        } catch {
          showError('Could not load next lead — retrying shortly.');
          autoServedRef.current = false;
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paused, activeLead, pipelinePref],
  );

  // Auto-serve on first mount
  useEffect(() => {
    if (!activeLead && !paused) {
      autoServe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-trigger auto-serve if paused is toggled off and no active lead
  useEffect(() => {
    if (!paused && !activeLead) {
      autoServedRef.current = false;
      autoServe();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  function handleRelease() {
    if (!activeLead) return;
    setDisposition('');
    setShowWrapUp(false);
    startTransition(async () => {
      try {
        await releaseLead(activeLead.id);
        autoServedRef.current = false;
      } catch {
        showError('Could not release lead — please try again.');
      }
    });
  }

  async function handlePipelineChange(p: Pipeline | null) {
    setPipelinePrefState(p);
    startTransition(async () => {
      await setPipelinePref(p);
    });
    // If no active lead, immediately try to serve from new pipeline
    if (!activeLead) {
      autoServedRef.current = false;
      autoServe(p);
    }
  }

  const formRef = useRef<HTMLFormElement>(null);

  function handleDispositionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!disposition || !activeLead) return;
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      try {
        await submitDisposition(fd);
        setDisposition('');
        setShowWrapUp(false);
        // Auto-advance to next lead
        autoServedRef.current = false;
        if (!paused) {
          autoServe(pipelinePref);
        }
      } catch {
        showError('Could not save this outcome — please try again.');
      }
    });
  }

  function handleWrapUpComplete(fd: FormData) {
    startTransition(async () => {
      try {
        await submitWrapUp(fd);
        setShowWrapUp(false);
        setDisposition('');
        setBookedSuccess(true);
        setTimeout(() => setBookedSuccess(false), 2200);
        // Auto-advance
        autoServedRef.current = false;
        if (!paused) {
          autoServe(pipelinePref);
        }
      } catch {
        showError('Could not save the booking — please try again.');
      }
    });
  }

  // Derived pipeline + cadence info for the active lead
  const activePipeline = activeLead
    ? computePipeline(new Date(activeLead.created_at), activeLead.no_answer_count)
    : null;

  const todayAttempts = activeLead
    ? effectiveDailyAttempts(
        activeLead.daily_attempts,
        activeLead.daily_attempts_date,
        new Date(),
      )
    : 0;

  const attemptLabel = activeLead
    ? attemptStatusLabel(
        activeLead.no_answer_count,
        activeLead.daily_attempts,
        activeLead.daily_attempts_date,
      )
    : '';

  const showDoubleDial = activeLead
    ? isFirstEverContact(activeLead.no_answer_count) ||
      isSecondDialOfDoubleDial(activeLead.no_answer_count, todayAttempts)
    : false;

  const isPersonalCallback =
    activeLead?.callback_setter_id === userId && activeLead?.callback_at != null;

  return (
    <div className="space-y-4">
      {/* Error toast */}
      {actionError && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100vw-2rem)]
                     bg-bad text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2"
        >
          <span aria-hidden="true" className="shrink-0">⚠</span>
          {actionError}
        </div>
      )}

      {/* ── Pipeline switcher + pause control ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted uppercase tracking-wide font-medium">Pipeline:</span>
        {/* P1 is omitted — Auto already serves P1-first, so a P1 button would be redundant */}
        {([null, 2, 3] as const).map((p) => (
          <button
            key={String(p)}
            type="button"
            onClick={() => handlePipelineChange(p as Pipeline | null)}
            disabled={isPending}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${(pipelinePref === p || (p === null && (pipelinePref === null || pipelinePref === 1)))
                ? 'bg-amber text-white border-amber'
                : 'bg-bg text-muted border-hairline hover:border-ink/30'
              }`}
          >
            {p === null ? 'Auto' : PIPELINE_SHORT[p]}
          </button>
        ))}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${paused
                ? 'bg-amber/10 text-amber border-amber/30'
                : 'bg-bg text-muted border-hairline hover:border-ink/30'
              }`}
          >
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>

      {/* ── Active call card ─────────────────────────────────────────── */}
      <section className="relative">
        {/* Booked success flash */}
        <div role="status" aria-live="polite" aria-atomic="true">
          {bookedSuccess && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center
                            bg-good/10 border-2 border-good/40 rounded-xl pointer-events-none
                            animate-fade-in">
              <svg className="w-14 h-14 text-good animate-check-pop" aria-hidden="true" fill="none"
                   viewBox="0 0 56 56" stroke="currentColor" strokeWidth={2.5}>
                <circle cx="28" cy="28" r="26" className="opacity-20" fill="currentColor" stroke="none"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 28l8 8 16-16"/>
              </svg>
              <div className="mt-3 text-good font-semibold text-lg">Booked!</div>
              <div className="text-good/60 text-sm mt-1">Appointment added to the diary</div>
            </div>
          )}
        </div>

        {isPending && !activeLead ? (
          <div className="card px-6 py-10 text-center">
            <div className="text-muted text-sm animate-pulse">Finding your next lead…</div>
          </div>
        ) : !activeLead ? (
          <div className="card overflow-hidden">
            {paused ? (
              <EmptyState
                preset="queue"
                heading="Paused"
                body="Press Resume to start receiving leads."
              />
            ) : noLeadAvailable ? (
              <EmptyState
                preset="queue"
                heading="No leads available right now"
                body="All leads are either locked, waiting their re-dial gap, or have hit today's limit. New leads will appear as they arrive or resurface."
              />
            ) : (
              <EmptyState
                preset="queue"
                heading="Getting your next lead…"
                body="The system is finding the next lead to serve you."
              />
            )}
          </div>
        ) : (
          <div className="card px-6 py-5 space-y-5">
            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
              <div>
                {/* Pipeline + cadence badges */}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {activePipeline && (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide
                      ${activePipeline === 1 ? 'bg-amber/15 text-amber'
                        : activePipeline === 2 ? 'bg-blue-500/10 text-blue-600'
                        : 'bg-hairline text-muted'}`}>
                      {PIPELINE_SHORT[activePipeline]}
                    </span>
                  )}
                  {isPersonalCallback && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-good/15 text-good font-semibold uppercase tracking-wide">
                      Your callback
                    </span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold
                    ${showDoubleDial ? 'bg-bad/10 text-bad' : 'bg-hairline/60 text-muted'}`}>
                    {attemptLabel}
                  </span>
                  <span className="text-[10px] text-muted">
                    {todayAttempts}/4 today · {activeLead.no_answer_count}/10 total
                  </span>
                </div>

                <h2 className="text-xl font-semibold tracking-tight">
                  {activeLead.name ?? 'Unknown'}
                </h2>
                <p className="text-muted text-xs num mt-0.5">
                  Lead captured {timeSince(activeLead.created_at)}
                </p>
              </div>
              <button
                onClick={handleRelease}
                disabled={isPending}
                className="text-xs text-muted hover:text-bad underline underline-offset-2 shrink-0"
              >
                Release
              </button>
            </div>

            {/* Double-dial instruction banner */}
            {showDoubleDial && (
              <div className="px-4 py-3 rounded-lg bg-bad/8 border border-bad/20 text-bad text-sm font-medium">
                {activeLead.no_answer_count === 0
                  ? '📞 DOUBLE DIAL — call twice without waiting. If no answer on first dial, call immediately again. This counts as 2 attempts.'
                  : '📞 SECOND DIAL — call again right now (CE1 double-dial). If no answer, the lead resurfaces in ~2 hours.'}
              </div>
            )}

            {/* Callback reminder */}
            {isPersonalCallback && activeLead.callback_at && (
              <div className="px-4 py-3 rounded-lg bg-good/8 border border-good/20 text-good text-sm font-medium">
                ★ Qualified callback — you spoke to this person on{' '}
                {new Date(activeLead.callback_at).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}.
              </div>
            )}

            {/* Click-to-dial */}
            {activeLead.phone && (
              <a
                href={`tel:${activeLead.phone.replace(/\s/g, '')}`}
                aria-label={`Call ${activeLead.name ?? 'lead'} on ${activeLead.phone}`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-good/10 border border-good/30
                           hover:bg-good/20 transition-colors group"
              >
                <span className="text-2xl" aria-hidden="true">📞</span>
                <span className="text-good font-semibold text-lg num tracking-tight group-hover:underline">
                  {activeLead.phone}
                </span>
                <span className="text-good/60 text-xs ml-auto" aria-hidden="true">tap to dial</span>
              </a>
            )}

            {/* Lead details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Email</div>
                <div className="text-ink text-xs break-all">{activeLead.email ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Postcode</div>
                <div className="font-medium num">{activeLead.postcode ?? '—'}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Monthly bill</div>
                <div className="num">
                  {activeLead.monthly_bill != null
                    ? `£${activeLead.monthly_bill.toFixed(0)}/mo`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Consent</div>
                {activeLead.consent
                  ? <span className="text-good text-xs font-medium">✓ Yes</span>
                  : <span className="text-bad text-xs font-medium">✗ No</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Homeowner</div>
                <YesNo val={activeLead.is_homeowner} />
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Bill payer</div>
                <YesNo val={activeLead.bill_payer} />
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Roof suitable</div>
                <YesNo val={activeLead.roof_suitable} />
              </div>
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-1">Finance interest</div>
                <YesNo val={activeLead.finance_interest} />
              </div>
            </div>

            {activeLead.address && (
              <div className="text-xs text-muted">{activeLead.address}</div>
            )}
            {activeLead.notes && (
              <div className="text-xs text-muted italic border-l-2 border-hairline pl-3">
                &ldquo;{activeLead.notes}&rdquo;
              </div>
            )}

            {/* Call history */}
            {activeLead.dispositions.length > 0 && (
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wide mb-2">
                  Previous attempts ({activeLead.dispositions.length})
                </div>
                <div className="space-y-1.5">
                  {activeLead.dispositions.map((d) => (
                    <div key={d.id} className="flex items-baseline gap-2 text-xs text-muted">
                      <span className="num shrink-0">
                        {new Date(d.created_at).toLocaleString('en-GB', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      <span className="text-ink font-medium">
                        {DISPOSITION_LABELS[d.disposition]}
                      </span>
                      {d.callback_at && (
                        <span className="text-amber">
                          → {new Date(d.callback_at).toLocaleString('en-GB', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      )}
                      {d.disqual_reason && (
                        <span className="italic">({d.disqual_reason})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Outcome section ─────────────────────────────────── */}
            <div className="border-t border-hairline pt-5">
              {showWrapUp ? (
                <WrapUpWizard
                  lead={activeLead}
                  onComplete={handleWrapUpComplete}
                  onCancel={() => setShowWrapUp(false)}
                  isPending={isPending}
                />
              ) : (
                <form ref={formRef} onSubmit={handleDispositionSubmit} className="space-y-4">
                  <div className="text-xs font-semibold text-ink mb-3 uppercase tracking-wide flex items-center gap-1.5">
                    Call outcome
                    <HelpTooltip text="Pick what happened. No-answer starts the cadence timer. Qualified callback ties this lead to you at your chosen time. Booked launches the qualifying wizard." />
                  </div>
                  <input type="hidden" name="lead_id" value={activeLead.id} />

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {NORMAL_DISPOSITIONS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDisposition(key)}
                        className={`px-3 py-3 rounded-lg border text-sm font-medium text-left transition-colors
                          ${disposition === key
                            ? key === 'disqualified' || key === 'not_interested'
                              ? 'bg-bad/10 text-bad border-bad/40'
                              : key === 'qualified_callback'
                              ? 'bg-good/10 text-good border-good/40'
                              : 'bg-amber/10 text-amber border-amber/40'
                            : 'bg-bg border-hairline text-ink hover:border-ink/30'
                          }`}
                      >
                        {DISPOSITION_LABELS[key]}
                      </button>
                    ))}

                    {/* Booked launches wrap-up wizard */}
                    <button
                      type="button"
                      onClick={() => setShowWrapUp(true)}
                      className="px-3 py-3 rounded-lg border text-sm font-medium text-left transition-colors
                                 bg-good/10 text-good border-good/40 hover:bg-good/20"
                    >
                      {DISPOSITION_LABELS.booked}
                    </button>
                  </div>

                  <input type="hidden" name="disposition" value={disposition} />

                  {/* Conditional fields */}
                  {(disposition === 'callback' || disposition === 'qualified_callback') && (
                    <div>
                      <label htmlFor="queue-callback-at" className="block text-xs text-muted mb-1">
                        {disposition === 'qualified_callback'
                          ? 'Callback date & time (tied to you)'
                          : 'Callback date & time (shared pool)'}
                      </label>
                      <input
                        id="queue-callback-at"
                        type="datetime-local"
                        name="callback_at"
                        required
                        className="input w-full md:w-64"
                      />
                    </div>
                  )}

                  {disposition === 'disqualified' && (
                    <div>
                      <label htmlFor="queue-disqual-reason" className="block text-xs text-muted mb-1">
                        Reason (optional)
                      </label>
                      <input
                        id="queue-disqual-reason"
                        type="text"
                        name="disqual_reason"
                        placeholder="e.g. renting, flat roof, no interest"
                        className="input w-full md:w-80"
                      />
                    </div>
                  )}

                  <div>
                    <label htmlFor="queue-notes" className="block text-xs text-muted mb-1">
                      Notes (optional)
                    </label>
                    <input
                      id="queue-notes"
                      type="text"
                      name="notes"
                      placeholder="Anything useful for the next call…"
                      className="input w-full md:w-96"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!disposition || isPending}
                    className="px-6 py-2.5 rounded-lg bg-ink text-white text-sm font-medium
                               hover:bg-ink/80 disabled:opacity-40 transition-colors"
                  >
                    {isPending ? 'Saving…' : 'Save & next →'}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
