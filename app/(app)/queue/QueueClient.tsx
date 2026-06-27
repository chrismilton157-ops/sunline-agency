'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { LeadQueue, CallDispositionType } from '@/lib/types';
import { claimLead, releaseLead, submitDisposition, submitWrapUp } from './actions';
import { WrapUpWizard } from './WrapUpWizard';

// No-contact outcomes: one tap → submit → auto-advance to next lead
const NO_CONTACT: ReadonlySet<CallDispositionType> = new Set([
  'no_answer', 'wrong_number', 'callback', 'not_interested',
]);

const DISPOSITION_LABELS: Record<CallDispositionType, string> = {
  no_answer:      'No answer',
  callback:       'Callback (schedule a time)',
  not_interested: 'Not interested',
  wrong_number:   'Wrong number',
  disqualified:   'Disqualified',
  booked:         'Booked ✓',
};

// Disposition buttons shown in the normal outcome form
// 'booked' is intentionally excluded — it launches the wrap-up wizard instead
const NORMAL_DISPOSITIONS: CallDispositionType[] = [
  'no_answer', 'callback', 'not_interested', 'wrong_number', 'disqualified',
];

const POLL_INTERVAL_MS = 20_000;

function timeSince(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
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
}

export function QueueClient({ leads, userId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [disposition, setDisposition] = useState<CallDispositionType | ''>('');
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [activeLead, setActiveLead] = useState<LeadQueue | null>(
    () => leads.find((l) => l.queue_claimed_by === userId) ?? null,
  );

  // Sync activeLead when server data refreshes
  useEffect(() => {
    const refreshed = leads.find((l) => l.queue_claimed_by === userId) ?? null;
    setActiveLead(refreshed);
    if (!refreshed) {
      setDisposition('');
      setShowWrapUp(false);
    }
  }, [leads, userId]);

  // Poll for new leads every 20 s
  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);

  const staleThreshold = Date.now() - 30 * 60 * 1000;
  const isStale = (l: LeadQueue) =>
    l.queue_claimed_by !== null &&
    l.queue_claimed_at !== null &&
    new Date(l.queue_claimed_at).getTime() < staleThreshold;

  const isMine   = (l: LeadQueue) => l.queue_claimed_by === userId;
  const isLocked = (l: LeadQueue) =>
    l.queue_claimed_by !== null && !isMine(l) && !isStale(l);

  function handleClaim(lead: LeadQueue) {
    startTransition(async () => {
      await claimLead(lead.id);
    });
  }

  function handleRelease() {
    if (!activeLead) return;
    setDisposition('');
    setShowWrapUp(false);
    startTransition(async () => {
      await releaseLead(activeLead.id);
    });
  }

  const formRef = useRef<HTMLFormElement>(null);

  function handleDispositionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!disposition) return;
    const fd = new FormData(formRef.current!);
    const isNoContact = NO_CONTACT.has(disposition as CallDispositionType);
    const currentLeadId = activeLead?.id;
    startTransition(async () => {
      await submitDisposition(fd);
      setDisposition('');
      if (isNoContact) {
        // Auto-advance: claim the next unclaimed lead in the queue
        const next = leads.find(
          (l) =>
            l.id !== currentLeadId &&
            l.queue_claimed_by === null &&
            l.status !== 'booked' &&
            l.status !== 'disqualified',
        );
        if (next) await claimLead(next.id);
      }
    });
  }

  function handleWrapUpComplete(fd: FormData) {
    startTransition(async () => {
      await submitWrapUp(fd);
      setShowWrapUp(false);
      setDisposition('');
    });
  }

  const queueLeads = leads.filter((l) => l.status !== 'booked');

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* ── Queue list ─────────────────────────────────── */}
      <section className="md:w-72 shrink-0 space-y-2">
        <p className="text-xs text-muted uppercase tracking-wide font-medium px-1">
          {queueLeads.length} lead{queueLeads.length !== 1 ? 's' : ''} to call
        </p>
        {queueLeads.length === 0 && (
          <div className="card px-4 py-8 text-center text-muted text-sm">
            Queue empty — great work!
          </div>
        )}
        {queueLeads.map((lead, idx) => {
          const mine   = isMine(lead);
          const locked = isLocked(lead);
          return (
            <div
              key={lead.id}
              className={`card px-4 py-3 border transition-colors
                ${mine ? 'border-amber bg-amber/5' : locked ? 'border-hairline opacity-60' : 'border-hairline'}
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {idx === 0 && !locked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber/15 text-amber font-semibold uppercase tracking-wide">
                        Next
                      </span>
                    )}
                    <span className="font-medium text-sm truncate">
                      {lead.name ?? 'Unknown'}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5 num">{lead.phone ?? '—'}</div>
                  <div className="text-[10px] text-muted mt-1 flex items-center gap-2">
                    <span className="num">{timeSince(lead.created_at)}</span>
                    {lead.no_answer_count > 0 && (
                      <span className="text-amber">
                        {lead.no_answer_count}× no answer
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {mine ? (
                    <span className="text-[10px] px-2 py-1 rounded bg-amber text-white font-medium">
                      Active
                    </span>
                  ) : locked ? (
                    <span className="text-[10px] px-2 py-1 rounded bg-hairline/60 text-muted">
                      Locked
                    </span>
                  ) : (
                    <button
                      onClick={() => handleClaim(lead)}
                      disabled={isPending || !!activeLead}
                      className="text-[11px] px-2.5 py-1 rounded bg-ink text-white hover:bg-ink/80 disabled:opacity-40 transition-colors"
                    >
                      Claim
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Active call card ─────────────────────────── */}
      <section className="flex-1 min-w-0">
        {!activeLead ? (
          <div className="card px-6 py-12 text-center">
            <p className="text-muted text-sm">
              Claim a lead from the queue to start calling.
            </p>
            <p className="text-muted text-xs mt-2">
              The newest lead is always at the top.
            </p>
          </div>
        ) : (
          <div className="card px-6 py-5 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs text-amber font-semibold uppercase tracking-wide mb-1">
                  Active call
                </div>
                <h2 className="text-xl font-semibold tracking-tight">
                  {activeLead.name ?? 'Unknown'}
                </h2>
                <p className="text-muted text-xs num mt-0.5">
                  Lead captured {timeSince(activeLead.created_at)}
                  {activeLead.no_answer_count > 0 && (
                    <span className="ml-2 text-amber">
                      · {activeLead.no_answer_count}× no answer previously
                    </span>
                  )}
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

            {/* Phone dial link */}
            {activeLead.phone && (
              <a
                href={`tel:${activeLead.phone.replace(/\s/g, '')}`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg bg-good/10 border border-good/30 hover:bg-good/20 transition-colors group"
              >
                <span className="text-2xl">📞</span>
                <span className="text-good font-semibold text-lg num tracking-tight group-hover:underline">
                  {activeLead.phone}
                </span>
                <span className="text-good/60 text-xs ml-auto">tap to dial</span>
              </a>
            )}

            {/* Lead details */}
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
                <div>
                  {activeLead.consent
                    ? <span className="text-good text-xs font-medium">✓ Yes</span>
                    : <span className="text-bad text-xs font-medium">✗ No</span>}
                </div>
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
                  Previous call attempts ({activeLead.dispositions.length})
                </div>
                <div className="space-y-1.5">
                  {activeLead.dispositions.map((d) => (
                    <div
                      key={d.id}
                      className="flex items-baseline gap-2 text-xs text-muted"
                    >
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

            {/* ── Outcome section ──────────────────────────────────────────── */}
            <div className="border-t border-hairline pt-5">
              {showWrapUp ? (
                /* Wrap-up wizard replaces the normal outcome form */
                <WrapUpWizard
                  lead={activeLead}
                  onComplete={handleWrapUpComplete}
                  onCancel={() => setShowWrapUp(false)}
                  isPending={isPending}
                />
              ) : (
                /* Normal outcome form for no-contact dispositions */
                <form ref={formRef} onSubmit={handleDispositionSubmit} className="space-y-4">
                  <div className="text-xs font-semibold text-ink mb-3 uppercase tracking-wide">
                    Call outcome
                  </div>
                  <input type="hidden" name="lead_id" value={activeLead.id} />

                  {/* No-contact disposition buttons */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {NORMAL_DISPOSITIONS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setDisposition(key)}
                        className={`px-3 py-3 rounded-lg border text-sm font-medium text-left transition-colors
                          ${disposition === key
                            ? key === 'disqualified'
                              ? 'bg-bad/10 text-bad border-bad/40'
                              : 'bg-amber/10 text-amber border-amber/40'
                            : 'bg-bg border-hairline text-ink hover:border-ink/30'
                          }`}
                      >
                        {DISPOSITION_LABELS[key]}
                      </button>
                    ))}

                    {/* Booked launches the wrap-up wizard directly */}
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

                  {/* Conditional fields for no-contact outcomes */}
                  {disposition === 'callback' && (
                    <div>
                      <label className="block text-xs text-muted mb-1">Callback date &amp; time</label>
                      <input
                        type="datetime-local"
                        name="callback_at"
                        required
                        className="input w-full md:w-64"
                      />
                    </div>
                  )}

                  {disposition === 'disqualified' && (
                    <div>
                      <label className="block text-xs text-muted mb-1">Reason (optional)</label>
                      <input
                        type="text"
                        name="disqual_reason"
                        placeholder="e.g. renting, flat roof, no interest"
                        className="input w-full md:w-80"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-muted mb-1">Notes (optional)</label>
                    <input
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
