'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadQueue, CallDispositionType } from '@/lib/types';
import {
  computePipeline,
  attemptStatusLabel,
  effectiveDailyAttempts,
  PIPELINE_SHORT,
} from '@/lib/setter-cadence';
import { submitDisposition, submitWrapUp } from '../../queue/actions';
import { claimLeadForWork, releaseWorkedLead, type ClaimResult } from '../actions';
import { WrapUpWizard } from '../../queue/WrapUpWizard';
import { HelpTooltip } from '@/components/onboarding/HelpTooltip';

const DISPOSITION_LABELS: Record<CallDispositionType, string> = {
  no_answer:          'No answer',
  callback:           'Callback (schedule)',
  qualified_callback: 'Qualified callback ★',
  not_interested:     'Not interested',
  wrong_number:       'Wrong number',
  disqualified:       'Disqualified',
  booked:             'Booked ✓',
};

const NORMAL_DISPOSITIONS: CallDispositionType[] = [
  'no_answer', 'qualified_callback', 'callback', 'not_interested', 'wrong_number', 'disqualified',
];

function YesNo({ val }: { val: boolean | null }) {
  if (val == null) return <span className="text-muted">—</span>;
  return val
    ? <span className="text-good font-medium">Yes</span>
    : <span className="text-bad font-medium">No</span>;
}

export function LeadProfileClient({ lead, userId }: { lead: LeadQueue; userId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [claim, setClaim] = useState<ClaimResult | 'checking'>('checking');
  const [disposition, setDisposition] = useState<CallDispositionType | ''>('');
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const dialStartRef = useRef<number | null>(null);
  const dispositionedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Claim on mount; release on unmount if we still hold it un-dispositioned.
  useEffect(() => {
    let mounted = true;
    claimLeadForWork(lead.id)
      .then((r) => { if (mounted) setClaim(r); })
      .catch(() => { if (mounted) setClaim('locked'); });
    return () => {
      mounted = false;
      if (!dispositionedRef.current) {
        releaseWorkedLead(lead.id).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  function showError(msg: string) {
    setActionError(msg);
    setTimeout(() => setActionError(null), 5000);
  }

  function elapsedTalkSeconds(): number | null {
    if (dialStartRef.current == null) return null;
    return Math.round((Date.now() - dialStartRef.current) / 1000);
  }

  const editable = claim === 'claimed';

  const pipeline = computePipeline(new Date(lead.created_at), lead.no_answer_count);
  const todayAttempts = effectiveDailyAttempts(
    lead.daily_attempts, lead.daily_attempts_date, new Date(),
  );
  const attemptLabel = attemptStatusLabel(
    lead.no_answer_count, lead.daily_attempts, lead.daily_attempts_date,
  );

  function handleDispositionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!disposition || !editable) return;
    const fd = new FormData(formRef.current!);
    const secs = elapsedTalkSeconds();
    if (secs != null) fd.set('talk_time_seconds', String(secs));
    startTransition(async () => {
      try {
        await submitDisposition(fd);
        dispositionedRef.current = true;
        router.push('/all-leads');
      } catch {
        showError('Could not save this outcome — please try again.');
      }
    });
  }

  function handleWrapUpComplete(fd: FormData) {
    const secs = elapsedTalkSeconds();
    if (secs != null) fd.set('talk_time_seconds', String(secs));
    startTransition(async () => {
      try {
        await submitWrapUp(fd);
        dispositionedRef.current = true;
        router.push('/all-leads');
      } catch {
        showError('Could not save the booking — please try again.');
      }
    });
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div role="alert" aria-live="assertive"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100vw-2rem)]
                     bg-bad text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <span aria-hidden="true">⚠</span>{actionError}
        </div>
      )}

      {/* Lock / status banners */}
      {claim === 'checking' && (
        <div className="rounded-lg bg-hairline/30 text-muted text-sm px-4 py-3">Opening lead…</div>
      )}
      {claim === 'locked' && (
        <div className="rounded-lg bg-amber/10 border border-amber/30 text-amber text-sm px-4 py-3 font-medium">
          Another setter is currently working this lead. You can view it, but call actions are locked.
        </div>
      )}
      {claim === 'not_workable' && (
        <div className="rounded-lg bg-hairline/40 text-muted text-sm px-4 py-3 font-medium">
          This lead is no longer workable (already booked, disqualified, or missing consent).
        </div>
      )}

      <div className="card px-6 py-5 space-y-5">
        {/* Header */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase tracking-wide
              ${pipeline === 1 ? 'bg-amber/15 text-amber'
                : pipeline === 2 ? 'bg-blue-500/10 text-blue-600'
                : 'bg-hairline text-muted'}`}>
              {PIPELINE_SHORT[pipeline]}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-hairline/60 text-muted">
              {attemptLabel}
            </span>
            <span className="text-[10px] text-muted">
              {todayAttempts}/4 today · {lead.no_answer_count}/10 total
            </span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight">{lead.name ?? 'Unknown'}</h2>
          <p className="text-muted text-xs num mt-0.5">
            Lead captured {new Date(lead.created_at).toLocaleString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </p>
        </div>

        {/* Click-to-dial */}
        {lead.phone && (
          <a
            href={editable ? `tel:${lead.phone.replace(/\s/g, '')}` : undefined}
            onClick={() => { if (editable && dialStartRef.current == null) dialStartRef.current = Date.now(); }}
            aria-disabled={!editable}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors
              ${editable
                ? 'bg-good/10 border-good/30 hover:bg-good/20'
                : 'bg-hairline/30 border-hairline text-muted pointer-events-none opacity-60'}`}
          >
            <span className="text-2xl" aria-hidden="true">📞</span>
            <span className="font-semibold text-lg num tracking-tight">{lead.phone}</span>
            {editable && <span className="text-good/60 text-xs ml-auto">tap to dial</span>}
          </a>
        )}

        {/* Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Email"><span className="text-xs break-all">{lead.email ?? '—'}</span></Field>
          <Field label="Postcode"><span className="font-medium num">{lead.postcode ?? '—'}</span></Field>
          <Field label="Monthly bill">
            <span className="num">{lead.monthly_bill != null ? `£${lead.monthly_bill.toFixed(0)}/mo` : '—'}</span>
          </Field>
          <Field label="Consent">
            {lead.consent
              ? <span className="text-good text-xs font-medium">✓ Yes</span>
              : <span className="text-bad text-xs font-medium">✗ No</span>}
          </Field>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Homeowner"><YesNo val={lead.is_homeowner} /></Field>
          <Field label="Bill payer"><YesNo val={lead.bill_payer} /></Field>
          <Field label="Roof suitable"><YesNo val={lead.roof_suitable} /></Field>
          <Field label="Finance interest"><YesNo val={lead.finance_interest} /></Field>
        </div>

        {lead.address && <div className="text-xs text-muted">{lead.address}</div>}
        {lead.notes && (
          <div className="text-xs text-muted italic border-l-2 border-hairline pl-3">
            &ldquo;{lead.notes}&rdquo;
          </div>
        )}

        {/* Call history */}
        {lead.dispositions.length > 0 && (
          <div>
            <div className="text-[10px] text-muted uppercase tracking-wide mb-2">
              Previous attempts ({lead.dispositions.length})
            </div>
            <div className="space-y-1.5">
              {lead.dispositions.map((d) => (
                <div key={d.id} className="flex items-baseline gap-2 text-xs text-muted">
                  <span className="num shrink-0">
                    {new Date(d.created_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  <span className="text-ink font-medium">{DISPOSITION_LABELS[d.disposition]}</span>
                  {d.disqual_reason && <span className="italic">({d.disqual_reason})</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outcome actions — only when we hold the claim */}
        {editable && (
          <div className="border-t border-hairline pt-5">
            {showWrapUp ? (
              <WrapUpWizard
                lead={lead}
                onComplete={handleWrapUpComplete}
                onCancel={() => setShowWrapUp(false)}
                isPending={isPending}
              />
            ) : (
              <form ref={formRef} onSubmit={handleDispositionSubmit} className="space-y-4">
                <div className="text-xs font-semibold text-ink mb-3 uppercase tracking-wide flex items-center gap-1.5">
                  Call outcome
                  <HelpTooltip text="Same rules as the queue: no-answer starts the cadence timer, qualified callback ties the lead to you, booked launches the qualifying wizard." />
                </div>
                <input type="hidden" name="lead_id" value={lead.id} />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {NORMAL_DISPOSITIONS.map((key) => (
                    <button key={key} type="button" onClick={() => setDisposition(key)}
                      className={`px-3 py-3 rounded-lg border text-sm font-medium text-left transition-colors
                        ${disposition === key
                          ? key === 'disqualified' || key === 'not_interested'
                            ? 'bg-bad/10 text-bad border-bad/40'
                            : key === 'qualified_callback'
                            ? 'bg-good/10 text-good border-good/40'
                            : 'bg-amber/10 text-amber border-amber/40'
                          : 'bg-bg border-hairline text-ink hover:border-ink/30'}`}>
                      {DISPOSITION_LABELS[key]}
                    </button>
                  ))}
                  <button type="button" onClick={() => setShowWrapUp(true)}
                    className="px-3 py-3 rounded-lg border text-sm font-medium text-left transition-colors
                               bg-good/10 text-good border-good/40 hover:bg-good/20">
                    {DISPOSITION_LABELS.booked}
                  </button>
                </div>
                <input type="hidden" name="disposition" value={disposition} />

                {(disposition === 'callback' || disposition === 'qualified_callback') && (
                  <div>
                    <label htmlFor="profile-callback-at" className="block text-xs text-muted mb-1">
                      {disposition === 'qualified_callback'
                        ? 'Callback date & time (tied to you)'
                        : 'Callback date & time (shared pool)'}
                    </label>
                    <input id="profile-callback-at" type="datetime-local" name="callback_at"
                      required className="input w-full md:w-64" />
                  </div>
                )}
                {disposition === 'disqualified' && (
                  <div>
                    <label htmlFor="profile-disqual" className="block text-xs text-muted mb-1">Reason (optional)</label>
                    <input id="profile-disqual" type="text" name="disqual_reason"
                      placeholder="e.g. renting, flat roof" className="input w-full md:w-80" />
                  </div>
                )}
                <div>
                  <label htmlFor="profile-notes" className="block text-xs text-muted mb-1">Notes (optional)</label>
                  <input id="profile-notes" type="text" name="notes"
                    placeholder="Anything useful for the next call…" className="input w-full md:w-96" />
                </div>
                <button type="submit" disabled={!disposition || isPending}
                  className="px-6 py-2.5 rounded-lg bg-ink text-white text-sm font-medium
                             hover:bg-ink/80 disabled:opacity-40 transition-colors">
                  {isPending ? 'Saving…' : 'Save outcome'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted uppercase tracking-wide mb-1">{label}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}
