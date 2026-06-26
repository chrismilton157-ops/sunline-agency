'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { LeadQueue } from '@/lib/types';
import {
  setterClaimLead,
  setterReleaseLead,
  setterSubmitDisposition,
} from './actions';

type Disposition = 'booked' | 'no_answer' | 'not_interested' | 'callback' | 'wrong_number';

const DISPOSITIONS: { key: Disposition; label: string; colour: string }[] = [
  {
    key: 'booked',
    label: '✓ Booked',
    colour: 'bg-good text-white border-good',
  },
  {
    key: 'no_answer',
    label: 'No answer',
    colour: 'bg-amber/10 text-amber border-amber/40',
  },
  {
    key: 'callback',
    label: 'Callback',
    colour: 'bg-amber/10 text-amber border-amber/40',
  },
  {
    key: 'not_interested',
    label: 'Not interested',
    colour: 'bg-bad/10 text-bad border-bad/40',
  },
  {
    key: 'wrong_number',
    label: 'Wrong number',
    colour: 'bg-bad/10 text-bad border-bad/40',
  },
];

const POLL_MS = 20_000;

function timeSince(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

interface Props {
  leads: LeadQueue[];
  userId: string;
}

export function SetterQueueClient({ leads, userId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [disposition, setDisposition] = useState<Disposition | ''>('');
  const [activeLead, setActiveLead] = useState<LeadQueue | null>(
    () => leads.find((l) => l.queue_claimed_by === userId) ?? null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const refreshed = leads.find((l) => l.queue_claimed_by === userId) ?? null;
    setActiveLead(refreshed);
    if (!refreshed) setDisposition('');
  }, [leads, userId]);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  const staleAt = Date.now() - 30 * 60 * 1000;
  const isStale = (l: LeadQueue) =>
    l.queue_claimed_by !== null &&
    l.queue_claimed_at !== null &&
    new Date(l.queue_claimed_at).getTime() < staleAt;

  const isMine = (l: LeadQueue) => l.queue_claimed_by === userId;
  const isLocked = (l: LeadQueue) =>
    l.queue_claimed_by !== null && !isMine(l) && !isStale(l);

  const queueLeads = leads.filter((l) => l.status !== 'booked');

  function handleClaim(lead: LeadQueue) {
    startTransition(async () => {
      await setterClaimLead(lead.id);
    });
  }

  function handleRelease() {
    if (!activeLead) return;
    setDisposition('');
    startTransition(async () => {
      await setterReleaseLead(activeLead.id);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!disposition) return;
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      await setterSubmitDisposition(fd);
      setDisposition('');
    });
  }

  // ── Active call card ──────────────────────────────────────────────────
  if (activeLead) {
    return (
      <div className="space-y-4">
        {/* Lead card */}
        <div className="card px-5 py-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-amber uppercase tracking-wider mb-0.5">
                Active call
              </p>
              <h2 className="text-2xl font-semibold tracking-tight">
                {activeLead.name ?? 'Unknown'}
              </h2>
              <p className="text-muted text-xs num mt-0.5">
                Lead came in {timeSince(activeLead.created_at)}
                {activeLead.no_answer_count > 0 && (
                  <span className="ml-2 text-amber">
                    · {activeLead.no_answer_count}× no answer
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={handleRelease}
              disabled={isPending}
              className="text-xs text-muted hover:text-bad underline underline-offset-2 shrink-0 mt-1"
            >
              Release
            </button>
          </div>

          {/* Big dial button */}
          {activeLead.phone ? (
            <a
              href={`tel:${activeLead.phone.replace(/\s/g, '')}`}
              className="flex items-center gap-3 w-full px-5 py-4 rounded-xl
                         bg-good/10 border-2 border-good/40 hover:bg-good/20
                         active:bg-good/30 transition-colors"
            >
              <span className="text-3xl">📞</span>
              <div>
                <p className="text-good font-bold text-xl num tracking-tight leading-none">
                  {activeLead.phone}
                </p>
                <p className="text-good/70 text-xs mt-0.5">Tap to dial</p>
              </div>
            </a>
          ) : (
            <div className="px-5 py-4 rounded-xl bg-hairline/40 text-muted text-sm">
              No phone number recorded
            </div>
          )}

          {/* Key details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {activeLead.postcode && (
              <div className="bg-bg rounded-lg px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Postcode</p>
                <p className="font-medium num">{activeLead.postcode}</p>
              </div>
            )}
            {activeLead.monthly_bill != null && (
              <div className="bg-bg rounded-lg px-3 py-2">
                <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Monthly bill</p>
                <p className="font-medium num">£{activeLead.monthly_bill.toFixed(0)}/mo</p>
              </div>
            )}
            <div className="bg-bg rounded-lg px-3 py-2">
              <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Homeowner</p>
              <p className="font-medium">
                {activeLead.is_homeowner === true ? '✓ Yes' : activeLead.is_homeowner === false ? '✗ No' : '—'}
              </p>
            </div>
            <div className="bg-bg rounded-lg px-3 py-2">
              <p className="text-[10px] text-muted uppercase tracking-wide mb-0.5">Consent</p>
              <p className={`font-medium text-sm ${activeLead.consent ? 'text-good' : 'text-bad'}`}>
                {activeLead.consent ? '✓ Yes' : '✗ No'}
              </p>
            </div>
          </div>

          {activeLead.address && (
            <p className="text-xs text-muted">{activeLead.address}</p>
          )}
        </div>

        {/* Outcome */}
        <div className="card px-5 py-5 space-y-4">
          <p className="text-xs font-semibold text-ink uppercase tracking-wider">
            What happened?
          </p>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="lead_id" value={activeLead.id} />
            <input type="hidden" name="disposition" value={disposition} />

            {/* Fat disposition buttons */}
            <div className="grid grid-cols-1 gap-2">
              {DISPOSITIONS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDisposition(d.key)}
                  className={`w-full px-4 py-4 rounded-xl border-2 text-base font-semibold text-left
                    transition-all active:scale-[0.98]
                    ${disposition === d.key
                      ? d.colour
                      : 'bg-bg border-hairline text-ink hover:border-ink/30'
                    }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Conditional extras */}
            {disposition === 'callback' && (
              <div>
                <label className="block text-xs text-muted mb-1.5">
                  When should we call back?
                </label>
                <input
                  type="datetime-local"
                  name="callback_at"
                  required
                  className="input w-full"
                />
              </div>
            )}

            {disposition === 'booked' && (
              <div className="space-y-3 p-4 rounded-xl bg-good/5 border border-good/20">
                <p className="text-xs font-semibold text-good">Appointment details</p>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Date &amp; time</label>
                  <input
                    type="datetime-local"
                    name="appt_date"
                    required
                    className="input w-full"
                  />
                </div>
                {(activeLead.address || activeLead.postcode) && (
                  <p className="text-xs text-muted">
                    Address: {activeLead.address ?? activeLead.postcode}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs text-muted mb-1.5">
                Notes (optional)
              </label>
              <input
                type="text"
                name="notes"
                placeholder="Anything useful…"
                className="input w-full"
              />
            </div>

            <button
              type="submit"
              disabled={!disposition || isPending}
              className="w-full py-4 rounded-xl bg-ink text-white font-semibold text-base
                         hover:bg-ink/80 disabled:opacity-40 transition-colors
                         active:scale-[0.98]"
            >
              {isPending ? 'Saving…' : 'Save & next →'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Queue list (no active lead) ───────────────────────────────────────
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted uppercase tracking-wide font-medium px-1">
        {queueLeads.length} lead{queueLeads.length !== 1 ? 's' : ''} to call
      </p>

      {queueLeads.length === 0 && (
        <div className="card px-5 py-12 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="font-medium text-ink">Queue empty!</p>
          <p className="text-muted text-sm mt-1">Great work — check back soon.</p>
        </div>
      )}

      {queueLeads.map((lead, idx) => {
        const mine = isMine(lead);
        const locked = isLocked(lead);
        return (
          <div
            key={lead.id}
            className={`card px-4 py-4 border-2 transition-colors
              ${mine ? 'border-amber bg-amber/5' : locked ? 'border-hairline opacity-50' : 'border-hairline'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {idx === 0 && !locked && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber/15 text-amber font-bold uppercase tracking-wide">
                      Next up
                    </span>
                  )}
                  <span className="font-semibold truncate">
                    {lead.name ?? 'Unknown'}
                  </span>
                </div>
                <p className="text-xs text-muted num mt-0.5">
                  {lead.phone ?? 'No number'} · {timeSince(lead.created_at)}
                  {lead.no_answer_count > 0 && (
                    <span className="text-amber ml-1">· {lead.no_answer_count}× NA</span>
                  )}
                </p>
              </div>

              {mine ? (
                <span className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-amber text-white font-semibold">
                  Active
                </span>
              ) : locked ? (
                <span className="shrink-0 text-xs px-3 py-1.5 rounded-full bg-hairline/60 text-muted">
                  Taken
                </span>
              ) : (
                <button
                  onClick={() => handleClaim(lead)}
                  disabled={isPending}
                  className="shrink-0 px-4 py-2 rounded-xl bg-ink text-white font-semibold text-sm
                             hover:bg-ink/80 disabled:opacity-40 transition-colors active:scale-95"
                >
                  Claim
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
