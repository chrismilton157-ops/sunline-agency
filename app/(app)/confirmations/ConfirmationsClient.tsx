'use client';
import { useState, useTransition } from 'react';
import type { ConfirmationAppointment } from '@/lib/types';
import { markConfirmed, logAttempt } from './actions';

const ATTEMPT_PRESETS = [
  'Called – no answer',
  'Left voicemail',
  'Texted',
  'Spoke – rescheduling',
  'Spoke – confirmed verbally',
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function urgency(apptIso: string, confirmedAt: string | null): 'confirmed' | 'same-day' | 'urgent' | 'upcoming' {
  if (confirmedAt) return 'confirmed';
  const now = Date.now();
  const appt = new Date(apptIso).getTime();
  const diffMs = appt - now;
  if (diffMs <= 0) return 'upcoming'; // past (shouldn't appear but safe)
  if (diffMs <= 24 * 60 * 60 * 1000) return 'same-day';
  if (diffMs <= 48 * 60 * 60 * 1000) return 'urgent';
  return 'upcoming';
}

function UrgencyBadge({ level }: { level: ReturnType<typeof urgency> }) {
  if (level === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-good/10 text-good border border-good/30">
        ✓ Confirmed
      </span>
    );
  }
  if (level === 'same-day') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-600 border border-red-400/40 animate-pulse">
        ⚠ TODAY – NEEDS CONFIRMING
      </span>
    );
  }
  if (level === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber/15 text-amber border border-amber/40">
        ! NEEDS CONFIRMING (&lt;48h)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-hairline/30 text-muted border border-hairline">
      Awaiting confirmation
    </span>
  );
}

function AppointmentCard({ appt }: { appt: ConfirmationAppointment }) {
  const [expanded, setExpanded] = useState(false);
  const [showAttemptForm, setShowAttemptForm] = useState(false);
  const [customMethod, setCustomMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const level = urgency(appt.appt_date, appt.confirmed_at);
  const isConfirmed = level === 'confirmed';

  const cardBorder =
    level === 'same-day' ? 'border-red-400/50 bg-red-50/30' :
    level === 'urgent'   ? 'border-amber/50 bg-amber/5' :
    isConfirmed          ? 'border-good/30 bg-good/5' :
                           'border-hairline bg-white';

  function handleMarkConfirmed() {
    startTransition(async () => {
      await markConfirmed(appt.id);
    });
  }

  function handleLogAttempt(method: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set('appointment_id', appt.id);
      fd.set('method', method);
      if (notes) fd.set('notes', notes);
      await logAttempt(fd);
      setNotes('');
      setCustomMethod('');
      setShowAttemptForm(false);
    });
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 transition-all ${cardBorder}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink text-sm">
              {appt.lead_name ?? 'Unknown homeowner'}
            </span>
            <UrgencyBadge level={level} />
          </div>
          <div className="text-xs text-muted mt-0.5">
            {appt.client_company}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="num font-semibold text-sm text-ink">
            {fmtDate(appt.appt_date)}
          </div>
          <div className="num text-xs text-muted">
            {fmtTime(appt.appt_date)}
          </div>
        </div>
      </div>

      {/* Contact details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
        {appt.lead_phone && (
          <div>
            <span className="text-ink/50">Phone: </span>
            <a
              href={`tel:${appt.lead_phone.replace(/\s+/g, '')}`}
              className="text-amber font-medium hover:underline"
            >
              {appt.lead_phone}
            </a>
          </div>
        )}
        {appt.lead_address && (
          <div>
            <span className="text-ink/50">Address: </span>
            <span className="text-ink">{appt.lead_address}</span>
          </div>
        )}
        {appt.confirmed_at && (
          <div className="sm:col-span-2">
            <span className="text-good">Confirmed {fmtDateTime(appt.confirmed_at)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      {!isConfirmed && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={handleMarkConfirmed}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-good text-white hover:bg-good/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Saving…' : '✓ Mark confirmed'}
          </button>
          <button
            onClick={() => setShowAttemptForm((v) => !v)}
            disabled={isPending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-hairline bg-white text-ink hover:bg-hairline/30 disabled:opacity-50 transition-colors"
          >
            Log attempt
          </button>
        </div>
      )}

      {/* Log attempt form */}
      {showAttemptForm && !isConfirmed && (
        <div className="rounded-lg border border-hairline bg-white p-3 space-y-2">
          <p className="text-xs font-medium text-ink">What happened?</p>
          <div className="flex flex-wrap gap-1.5">
            {ATTEMPT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => handleLogAttempt(p)}
                disabled={isPending}
                className="px-2.5 py-1 rounded-md text-xs border border-hairline bg-hairline/20 hover:bg-amber/10 hover:border-amber/40 disabled:opacity-50 transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Or type a custom note…"
              value={customMethod}
              onChange={(e) => setCustomMethod(e.target.value)}
              className="flex-1 border border-hairline rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber/50"
            />
            <button
              onClick={() => customMethod.trim() && handleLogAttempt(customMethod.trim())}
              disabled={isPending || !customMethod.trim()}
              className="px-2.5 py-1 rounded-md text-xs bg-amber text-white font-medium hover:bg-amber/90 disabled:opacity-40 transition-colors"
            >
              Log
            </button>
          </div>
          <textarea
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-hairline rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-amber/50 resize-none"
          />
        </div>
      )}

      {/* Attempt history toggle */}
      {appt.attempts.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted hover:text-ink underline underline-offset-2"
          >
            {expanded ? 'Hide' : 'Show'} {appt.attempts.length} attempt{appt.attempts.length !== 1 ? 's' : ''}
          </button>
          {expanded && (
            <ul className="mt-2 space-y-1.5">
              {appt.attempts.map((a) => (
                <li key={a.id} className="text-xs flex gap-2">
                  <span className="num text-muted shrink-0">{fmtDateTime(a.created_at)}</span>
                  <span className="text-ink font-medium">{a.method}</span>
                  {a.notes && <span className="text-muted">— {a.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function ConfirmationsClient({ appointments }: { appointments: ConfirmationAppointment[] }) {
  const needsConfirming = appointments.filter(
    (a) => !a.confirmed_at && urgency(a.appt_date, a.confirmed_at) !== 'upcoming',
  );
  const confirmed = appointments.filter((a) => a.confirmed_at);
  const upcoming = appointments.filter(
    (a) => !a.confirmed_at && urgency(a.appt_date, a.confirmed_at) === 'upcoming',
  );

  if (appointments.length === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-white p-8 text-center text-muted text-sm">
        No upcoming booked appointments. Once a homeowner is booked in via the call queue, they'll appear here for confirmation.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {needsConfirming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber"></span>
            Needs confirming now ({needsConfirming.length})
          </h2>
          <div className="space-y-3">
            {needsConfirming.map((a) => (
              <AppointmentCard key={a.id} appt={a} />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-hairline"></span>
            Upcoming – confirm closer to the date ({upcoming.length})
          </h2>
          <div className="space-y-3">
            {upcoming.map((a) => (
              <AppointmentCard key={a.id} appt={a} />
            ))}
          </div>
        </section>
      )}

      {confirmed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-good"></span>
            Already confirmed ({confirmed.length})
          </h2>
          <div className="space-y-3">
            {confirmed.map((a) => (
              <AppointmentCard key={a.id} appt={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
