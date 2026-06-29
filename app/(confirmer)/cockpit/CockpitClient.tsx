'use client';
import { useState, useTransition } from 'react';
import type { CockpitAppointment, ConfirmerStats } from '@/lib/types';
import {
  CANCELLATION_REASONS,
  ATTEMPT_METHODS,
  CALL_CHECKLIST,
} from '@/lib/confirmer-config';
import {
  confirmAppointment,
  logAttempt,
  rescheduleAppointment,
  cancelAppointment,
  logInboundCall,
  searchAppointments,
} from './actions';

// ---- helpers ----

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

type UrgencyLevel = 'confirmed' | 'same-day' | 'urgent' | 'upcoming';

function getUrgency(apptDate: string, confirmedAt: string | null): UrgencyLevel {
  if (confirmedAt) return 'confirmed';
  const diff = new Date(apptDate).getTime() - Date.now();
  if (diff <= 0) return 'upcoming';
  if (diff <= 24 * 60 * 60 * 1000) return 'same-day';
  if (diff <= 48 * 60 * 60 * 1000) return 'urgent';
  return 'upcoming';
}

function UrgencyBadge({ level }: { level: UrgencyLevel }) {
  if (level === 'confirmed') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-good/10 text-good border border-good/30">
      ✓ Confirmed
    </span>
  );
  if (level === 'same-day') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-600 border border-red-400/40 animate-pulse">
      ⚠ TODAY
    </span>
  );
  if (level === 'urgent') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber/15 text-amber border border-amber/40">
      ! &lt;48h
    </span>
  );
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-hairline/30 text-muted border border-hairline">
      Upcoming
    </span>
  );
}

// ---- Stat card ----

function StatCard({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3 text-center">
      <div className="num text-2xl font-bold text-ink">{value ?? '—'}</div>
      <div className="text-xs font-medium text-ink mt-0.5">{label}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ---- Reschedule modal ----

function RescheduleModal({
  appt,
  onClose,
  onDone,
}: {
  appt: CockpitAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const [source, setSource] = useState<'inbound' | 'outbound'>('inbound');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!newDate || !newTime) return;
    const iso = new Date(`${newDate}T${newTime}:00`).toISOString();
    startTransition(async () => {
      await rescheduleAppointment(appt.id, appt.appt_date, iso, source, notes || undefined);
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Reschedule appointment</h2>
        <div className="text-sm text-muted">
          Current: <span className="text-ink font-medium">{fmtDate(appt.appt_date)} at {fmtTime(appt.appt_date)}</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Source</label>
            <div className="flex gap-2">
              {(['inbound', 'outbound'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    source === s
                      ? 'bg-amber text-white border-amber'
                      : 'bg-white text-ink border-hairline hover:bg-hairline/30'
                  }`}
                >
                  {s === 'inbound' ? 'Homeowner called in' : 'We reached out'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">New date</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Time</label>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Notes (optional)</label>
            <input
              type="text"
              placeholder="e.g. homeowner on holiday until…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-hairline text-sm text-muted hover:bg-hairline/30"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!newDate || !newTime || pending}
            className="flex-1 py-2 rounded-xl bg-amber text-white text-sm font-semibold hover:bg-amber/90 disabled:opacity-40 transition-colors"
          >
            {pending ? 'Saving…' : 'Confirm reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Cancel modal ----

function CancelModal({
  appt,
  onClose,
  onDone,
}: {
  appt: CockpitAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!reason) return;
    startTransition(async () => {
      await cancelAppointment(appt.id, reason as never, note || undefined);
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Cancel appointment</h2>
        <div className="text-sm text-muted">
          {appt.lead_name} · {fmtDate(appt.appt_date)}
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink">Reason</label>
          {CANCELLATION_REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm border transition-colors ${
                reason === r.value
                  ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                  : 'bg-white border-hairline text-ink hover:bg-hairline/30'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {(reason === 'other' || reason) && (
          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Note {reason === 'other' ? '(required for "other")' : '(optional)'}
            </label>
            <input
              type="text"
              placeholder="Brief note…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300/60"
            />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-hairline text-sm text-muted hover:bg-hairline/30"
          >
            Go back
          </button>
          <button
            onClick={submit}
            disabled={!reason || (reason === 'other' && !note.trim()) || pending}
            className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-40 transition-colors"
          >
            {pending ? 'Saving…' : 'Cancel appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Inbound call modal ----

function InboundModal({
  appt,
  onClose,
  onDone,
}: {
  appt: CockpitAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const [outcome, setOutcome] = useState<'rescheduled' | 'cancelled' | 'no_change'>('no_change');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await logInboundCall(appt.id, outcome, notes || undefined);
      onDone();
    });
  }

  const OUTCOMES = [
    { value: 'no_change',   label: 'No change — confirmed / info only' },
    { value: 'rescheduled', label: 'Rescheduled (use Reschedule next)' },
    { value: 'cancelled',   label: 'Cancelled (use Cancel next)' },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Log inbound call</h2>
        <div className="text-sm text-muted">
          {appt.lead_name} called in about their appointment on {fmtDate(appt.appt_date)}.
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink">What happened?</label>
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              onClick={() => setOutcome(o.value)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm border transition-colors ${
                outcome === o.value
                  ? 'bg-amber/10 border-amber/40 text-amber font-medium'
                  : 'bg-white border-hairline text-ink hover:bg-hairline/30'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1">Notes (optional)</label>
          <input
            type="text"
            placeholder="What did the homeowner say?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl border border-hairline text-sm text-muted hover:bg-hairline/30"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={pending}
            className="flex-1 py-2 rounded-xl bg-amber text-white text-sm font-semibold hover:bg-amber/90 disabled:opacity-40 transition-colors"
          >
            {pending ? 'Logging…' : 'Log call'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Attempt drawer ----

function AttemptDrawer({
  appt,
  onClose,
  onDone,
}: {
  appt: CockpitAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function submit(method: string) {
    startTransition(async () => {
      await logAttempt(appt.id, method, notes || undefined);
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">Log attempt</h2>
          <button onClick={onClose} className="text-muted hover:text-ink text-lg">✕</button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {ATTEMPT_METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => submit(m.label)}
              disabled={pending}
              className="w-full py-3 rounded-xl bg-hairline/30 border border-hairline text-sm font-medium text-ink hover:bg-amber/10 hover:border-amber/40 disabled:opacity-40 transition-colors"
            >
              {m.label}
            </button>
          ))}
        </div>

        <div>
          <input
            type="text"
            placeholder="Optional note…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-hairline rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
          />
        </div>
      </div>
    </div>
  );
}

// ---- Main appointment card (big, full-focus) ----

function ActiveCard({
  appt,
  onAction,
}: {
  appt: CockpitAppointment;
  onAction: (action: 'confirmed' | 'attempt' | 'reschedule' | 'cancel' | 'inbound') => void;
}) {
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const urgency = getUrgency(appt.appt_date, appt.confirmed_at);

  const cardBg =
    urgency === 'same-day' ? 'border-red-400/60 bg-red-50/40' :
    urgency === 'urgent'   ? 'border-amber/50 bg-amber/5' :
    urgency === 'confirmed' ? 'border-good/40 bg-good/5' :
    'border-hairline bg-white';

  function handleConfirm() {
    startTransition(async () => {
      await confirmAppointment(appt.id);
      onAction('confirmed');
    });
  }

  return (
    <div className={`rounded-2xl border-2 p-5 space-y-4 transition-all ${cardBg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-ink">
              {appt.lead_name ?? 'Unknown homeowner'}
            </h2>
            <UrgencyBadge level={urgency} />
          </div>
          <div className="text-sm text-muted mt-0.5">{appt.client_company}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="num text-lg font-bold text-ink">{fmtDate(appt.appt_date)}</div>
          <div className="num text-base font-semibold text-amber">{fmtTime(appt.appt_date)}</div>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-1.5">
        {appt.lead_phone && (
          <a
            href={`tel:${appt.lead_phone.replace(/\s+/g, '')}`}
            className="flex items-center gap-3 rounded-xl bg-amber/10 border border-amber/30 px-4 py-3 hover:bg-amber/20 transition-colors"
          >
            <span className="text-xl">📞</span>
            <span className="num text-lg font-bold text-amber tracking-wide">
              {appt.lead_phone}
            </span>
            <span className="text-xs text-amber/70 ml-auto">Tap to call</span>
          </a>
        )}
        {appt.lead_address && (
          <div className="text-sm text-muted px-1">
            <span className="text-ink/50">Address: </span>
            <span className="text-ink">{appt.lead_address}</span>
          </div>
        )}
        {appt.setter && (
          <div className="text-xs text-muted px-1">
            <span className="text-ink/50">Booked by: </span>
            <span className="text-ink">{appt.setter}</span>
          </div>
        )}
      </div>

      {/* Attempt history summary */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {appt.attempt_count > 0 ? (
          <span className="num px-2 py-1 rounded-md bg-hairline/30 text-ink border border-hairline">
            {appt.attempt_count} attempt{appt.attempt_count !== 1 ? 's' : ''} so far
          </span>
        ) : (
          <span className="text-muted">No attempts yet</span>
        )}
        {appt.last_attempt_at && (
          <span className="text-muted">Last: {fmtShort(appt.last_attempt_at)}</span>
        )}
        {appt.confirmed_at && (
          <span className="text-good font-medium">✓ Confirmed {fmtShort(appt.confirmed_at)}</span>
        )}
      </div>

      {/* Call checklist */}
      <div className="rounded-xl border border-hairline bg-white/60 overflow-hidden">
        <button
          onClick={() => setChecklistOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink hover:bg-hairline/20 transition-colors"
        >
          <span>Call checklist</span>
          <span className="text-muted text-xs">{checklistOpen ? '▲ hide' : '▼ show'}</span>
        </button>
        {checklistOpen && (
          <ul className="px-4 pb-3 space-y-1.5">
            {CALL_CHECKLIST.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-ink">
                <span className="text-amber mt-0.5">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        {!appt.confirmed_at && (
          <button
            onClick={handleConfirm}
            disabled={pending}
            className="col-span-2 py-4 rounded-2xl bg-good text-white text-base font-bold hover:bg-good/90 disabled:opacity-50 transition-colors shadow-sm"
          >
            {pending ? 'Saving…' : '✓ Confirmed'}
          </button>
        )}
        <button
          onClick={() => onAction('attempt')}
          disabled={pending}
          className="py-3 rounded-xl border-2 border-hairline bg-white text-sm font-semibold text-ink hover:bg-hairline/30 disabled:opacity-50 transition-colors"
        >
          Log attempt
        </button>
        <button
          onClick={() => onAction('reschedule')}
          disabled={pending}
          className="py-3 rounded-xl border-2 border-amber/40 bg-amber/5 text-sm font-semibold text-amber hover:bg-amber/10 disabled:opacity-50 transition-colors"
        >
          Reschedule
        </button>
        <button
          onClick={() => onAction('inbound')}
          disabled={pending}
          className="py-3 rounded-xl border-2 border-hairline bg-white text-sm font-semibold text-ink hover:bg-hairline/30 disabled:opacity-50 transition-colors"
        >
          Log inbound call
        </button>
        <button
          onClick={() => onAction('cancel')}
          disabled={pending}
          className="py-3 rounded-xl border-2 border-red-300/60 bg-red-50/50 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Queue list row ----

function QueueRow({
  appt,
  active,
  onClick,
}: {
  appt: CockpitAppointment;
  active: boolean;
  onClick: () => void;
}) {
  const urgency = getUrgency(appt.appt_date, appt.confirmed_at);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-center gap-3 ${
        active ? 'bg-amber/10 border-2 border-amber/40' : 'border-2 border-transparent hover:bg-hairline/30'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-ink truncate">
            {appt.lead_name ?? 'Unknown'}
          </span>
          <UrgencyBadge level={urgency} />
        </div>
        <div className="num text-xs text-muted mt-0.5">
          {fmtDate(appt.appt_date)} · {fmtTime(appt.appt_date)}
        </div>
      </div>
      {appt.attempt_count > 0 && (
        <span className="num text-xs text-muted shrink-0">{appt.attempt_count}×</span>
      )}
    </button>
  );
}

// ---- Search results card ----

function SearchCard({
  appt,
  onAction,
}: {
  appt: CockpitAppointment;
  onAction: (appt: CockpitAppointment, action: 'confirmed' | 'attempt' | 'reschedule' | 'cancel' | 'inbound') => void;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-ink text-sm">{appt.lead_name ?? 'Unknown'}</div>
          <div className="text-xs text-muted">{appt.client_company}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="num text-sm font-semibold text-ink">{fmtDate(appt.appt_date)}</div>
          <div className="num text-xs text-muted">{fmtTime(appt.appt_date)}</div>
        </div>
      </div>
      {appt.lead_phone && (
        <a
          href={`tel:${appt.lead_phone.replace(/\s+/g, '')}`}
          className="flex items-center gap-2 text-sm text-amber hover:underline"
        >
          📞 {appt.lead_phone}
        </a>
      )}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onAction(appt, 'confirmed')}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-good text-white hover:bg-good/90"
        >
          ✓ Confirmed
        </button>
        <button
          onClick={() => onAction(appt, 'attempt')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-hairline bg-white text-ink hover:bg-hairline/30"
        >
          Log attempt
        </button>
        <button
          onClick={() => onAction(appt, 'inbound')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-hairline bg-white text-ink hover:bg-hairline/30"
        >
          Log inbound call
        </button>
        <button
          onClick={() => onAction(appt, 'reschedule')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-amber/40 text-amber hover:bg-amber/5"
        >
          Reschedule
        </button>
        <button
          onClick={() => onAction(appt, 'cancel')}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Stats strip ----

function StatsStrip({ stats }: { stats: ConfirmerStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        label="Show-rate"
        value={stats.show_rate !== null ? `${stats.show_rate}%` : null}
        sub="of confirmed appts sat"
      />
      <StatCard
        label="Save rate"
        value={stats.save_rate !== null ? `${stats.save_rate}%` : null}
        sub="inbound saves"
      />
      <StatCard
        label="Confirmed"
        value={String(stats.confirmed_count)}
        sub={stats.confirmation_rate !== null ? `${stats.confirmation_rate}% rate` : undefined}
      />
      <StatCard
        label="Inbound calls"
        value={String(stats.inbound_calls)}
        sub={`${stats.reschedules} rescheduled`}
      />
    </div>
  );
}

// ---- Root component ----

type Modal = { type: 'attempt' | 'reschedule' | 'cancel' | 'inbound'; appt: CockpitAppointment };

export function CockpitClient({
  appointments,
  currentUserId,
  stats,
}: {
  appointments: CockpitAppointment[];
  currentUserId: string;
  stats: ConfirmerStats | null;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CockpitAppointment[] | null>(null);
  const [searchPending, startSearchTransition] = useTransition();

  void currentUserId;

  const active = appointments[activeIdx] ?? null;

  function handleAction(action: 'confirmed' | 'attempt' | 'reschedule' | 'cancel' | 'inbound') {
    if (!active) return;
    if (action === 'confirmed') {
      // Advance queue after confirm
      setActiveIdx((i) => Math.min(i + 1, appointments.length - 1));
      return;
    }
    setModal({ type: action as Modal['type'], appt: active });
  }

  function handleSearchAction(appt: CockpitAppointment, action: 'confirmed' | 'attempt' | 'reschedule' | 'cancel' | 'inbound') {
    if (action === 'confirmed') {
      // handled inline in the search card via confirmAppointment direct call
      setModal({ type: 'inbound', appt }); // fallback to inbound log
      return;
    }
    setModal({ type: action as Modal['type'], appt });
  }

  function handleModalDone() {
    setModal(null);
    if (modal?.type === 'cancel' || modal?.type === 'reschedule') {
      // After cancel/reschedule, advance queue
      setActiveIdx((i) => Math.min(i + 1, appointments.length - 1));
    }
  }

  function handleSearch() {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    startSearchTransition(async () => {
      const results = await searchAppointments(searchQuery);
      setSearchResults(results);
    });
  }

  const unconfirmedCount = appointments.filter((a) => !a.confirmed_at).length;
  const urgentCount = appointments.filter((a) =>
    !a.confirmed_at &&
    new Date(a.appt_date).getTime() - Date.now() <= 48 * 60 * 60 * 1000,
  ).length;

  return (
    <>
      {/* Modals */}
      {modal?.type === 'attempt' && (
        <AttemptDrawer
          appt={modal.appt}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); }}
        />
      )}
      {modal?.type === 'reschedule' && (
        <RescheduleModal
          appt={modal.appt}
          onClose={() => setModal(null)}
          onDone={handleModalDone}
        />
      )}
      {modal?.type === 'cancel' && (
        <CancelModal
          appt={modal.appt}
          onClose={() => setModal(null)}
          onDone={handleModalDone}
        />
      )}
      {modal?.type === 'inbound' && (
        <InboundModal
          appt={modal.appt}
          onClose={() => setModal(null)}
          onDone={() => setModal(null)}
        />
      )}

      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-ink">
            Confirmation cockpit
          </h1>
          <p className="text-sm text-muted mt-1">
            Confirm, reschedule, or handle inbound calls on upcoming appointments.
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="num px-2 py-1 rounded-md bg-hairline/40 text-ink">
              {appointments.length} upcoming
            </span>
            {unconfirmedCount > 0 && (
              <span className="num px-2 py-1 rounded-md bg-hairline/30 text-ink">
                {unconfirmedCount} unconfirmed
              </span>
            )}
            {urgentCount > 0 && (
              <span className="num px-2 py-1 rounded-md bg-amber/10 text-amber border border-amber/30 font-semibold">
                {urgentCount} need confirming now
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && <StatsStrip stats={stats} />}

        {/* Main area */}
        {appointments.length === 0 ? (
          <div className="rounded-2xl border border-hairline bg-white p-10 text-center text-muted">
            No upcoming booked appointments — the queue is clear.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Active appointment */}
            {active && (
              <ActiveCard appt={active} onAction={handleAction} />
            )}

            {/* Queue list */}
            {appointments.length > 1 && (
              <div className="rounded-xl border border-hairline bg-white overflow-hidden">
                <div className="px-4 py-2.5 border-b border-hairline bg-hairline/10">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wide">
                    Queue — {appointments.length} appointment{appointments.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
                  {appointments.map((a, i) => (
                    <QueueRow
                      key={a.id}
                      appt={a}
                      active={i === activeIdx}
                      onClick={() => setActiveIdx(i)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Appointment search */}
        <div className="rounded-xl border border-hairline bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-hairline bg-hairline/10">
            <span className="text-xs font-semibold text-muted uppercase tracking-wide">
              Find appointment (inbound call)
            </span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted">
              Search by homeowner name or phone number to handle a call about an appointment not in your queue.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name or phone…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
              />
              <button
                onClick={handleSearch}
                disabled={searchPending}
                className="px-4 py-2.5 rounded-xl bg-amber text-white text-sm font-semibold hover:bg-amber/90 disabled:opacity-40 transition-colors"
              >
                {searchPending ? '…' : 'Search'}
              </button>
            </div>

            {searchResults !== null && (
              <div className="space-y-3 pt-1">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-muted text-center py-4">No appointments found.</p>
                ) : (
                  searchResults.map((a) => (
                    <SearchCard
                      key={a.id}
                      appt={a}
                      onAction={handleSearchAction}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
