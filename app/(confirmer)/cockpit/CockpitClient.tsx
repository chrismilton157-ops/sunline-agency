'use client';
import React, { useState, useTransition, useMemo } from 'react';
import { HelpTooltip } from '@/components/onboarding/HelpTooltip';
import type { CockpitAppointment, ConfirmerStatsRich, SmsTemplate } from '@/lib/types';
import {
  CANCELLATION_REASONS,
  ATTEMPT_METHODS,
  CALL_CHECKLIST,
  RESCHEDULE_REASONS,
  SNOOZE_OPTIONS,
  FLAG_REASONS,
} from '@/lib/confirmer-config';
import {
  confirmAppointment,
  confirmAppointmentRich,
  logAttempt,
  rescheduleAppointment,
  cancelAppointment,
  logInboundCall,
  setCallback,
  snoozeAppointment,
  saveNote,
  sendTemplateText,
  flagToOwner,
  logOutcome,
  searchAppointments,
} from './actions';
import { EmptyState } from '@/components/EmptyState';

// ── helpers ──────────────────────────────────────────────────────────────────

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

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type UrgencyLevel = 'callback-due' | 'confirmed' | 'same-day' | 'urgent' | 'snoozed' | 'upcoming';

function getUrgency(appt: CockpitAppointment): UrgencyLevel {
  const now = Date.now();
  if (appt.callback_at && new Date(appt.callback_at).getTime() <= now) return 'callback-due';
  if (appt.confirmed_at) return 'confirmed';
  if (appt.snooze_until && new Date(appt.snooze_until).getTime() > now) return 'snoozed';
  const diff = new Date(appt.appt_date).getTime() - now;
  if (diff <= 0) return 'upcoming';
  if (diff <= 24 * 60 * 60 * 1000) return 'same-day';
  if (diff <= 48 * 60 * 60 * 1000) return 'urgent';
  return 'upcoming';
}

function UrgencyBadge({ level }: { level: UrgencyLevel }) {
  if (level === 'callback-due') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-300 animate-pulse">
      ⏰ Callback due
    </span>
  );
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
  if (level === 'snoozed') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-500 border border-blue-200">
      💤 Snoozed
    </span>
  );
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-hairline/30 text-muted border border-hairline">
      Upcoming
    </span>
  );
}

function StrengthBadge({ strength }: { strength: string | null }) {
  if (!strength) return null;
  if (strength === 'confirmed') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-good/10 text-good border border-good/30">Strong ✓</span>
  );
  if (strength === 'soft_confirmed') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber/10 text-amber border border-amber/30">Soft</span>
  );
  if (strength === 'unreachable') return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-500 border border-red-200">Unreachable</span>
  );
  return null;
}

// ── Event timeline ────────────────────────────────────────────────────────────

const EVENT_ICONS: Record<string, string> = {
  confirmed:     '✓',
  attempt:       '📞',
  rescheduled:   '📅',
  cancelled:     '✗',
  inbound_call:  '📥',
  note:          '📝',
  callback_set:  '⏰',
  snoozed:       '💤',
  text_sent:     '💬',
  flagged:       '🚩',
  outcome_logged:'📊',
};

const EVENT_LABELS: Record<string, string> = {
  confirmed:     'Confirmed',
  attempt:       'Attempt',
  rescheduled:   'Rescheduled',
  cancelled:     'Cancelled',
  inbound_call:  'Inbound call',
  note:          'Note',
  callback_set:  'Callback set',
  snoozed:       'Snoozed',
  text_sent:     'Text sent',
  flagged:       'Flagged to owner',
  outcome_logged:'Outcome logged',
};

function Timeline({
  events,
  currentUserId,
}: {
  events: CockpitAppointment['events'];
  currentUserId: string;
}) {
  if (events.length === 0) return (
    <p className="text-xs text-muted px-1">No events yet.</p>
  );
  return (
    <div className="space-y-1.5">
      {events.map((ev) => (
        <div key={ev.id} className="flex items-start gap-2 text-xs">
          <span className="shrink-0 text-base leading-none mt-0.5">
            {EVENT_ICONS[ev.event_type] ?? '·'}
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-ink">{EVENT_LABELS[ev.event_type] ?? ev.event_type}</span>
            {ev.attempt_method && <span className="text-muted ml-1">— {ev.attempt_method}</span>}
            {ev.notes && <span className="text-muted ml-1 truncate">— {ev.notes}</span>}
            {ev.sms_template_name && <span className="text-muted ml-1">— {ev.sms_template_name} (simulated)</span>}
          </div>
          <div className="shrink-0 text-muted text-right">
            <div>{fmtRelative(ev.created_at)}</div>
            <div className="opacity-70">{ev.actor_id === currentUserId ? 'You' : 'Colleague'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: React.ReactNode; value: string | null; sub?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-white px-4 py-3 text-center min-w-[100px] shrink-0">
      <div className="num text-2xl font-bold text-ink">{value ?? '—'}</div>
      <div className="text-xs font-medium text-ink mt-0.5 whitespace-nowrap">{label}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-amber/60 rounded-sm min-h-[2px]"
          style={{ height: `${Math.max(2, (v / max) * 32)}px` }}
          title={`${v}`}
        />
      ))}
    </div>
  );
}

function StatsBar({ stats }: { stats: ConfirmerStatsRich }) {
  const callbacksDue = 0; // computed from queue in parent
  return (
    <div className="overflow-x-auto pb-1 -mx-1 px-1">
      <div className="flex gap-3 w-max">
        <StatCard label="Today" value={String(stats.today_confirmed)} sub="confirmed" />
        <StatCard label={<span className="flex items-center gap-1">Show rate <HelpTooltip text="% of appointments you confirmed where the homeowner actually turned up. Target: 75%+." side="bottom" /></span>} value={stats.show_rate !== null ? `${stats.show_rate}%` : null} sub="of confirmed sat" />
        <StatCard label={<span className="flex items-center gap-1">Save rate <HelpTooltip text="% of inbound calls where you rescued a lead who was about to cancel or no-show." side="bottom" /></span>} value={stats.save_rate !== null ? `${stats.save_rate}%` : null} sub="inbound saves" />
        <StatCard label={<span className="flex items-center gap-1">All-time <HelpTooltip text="Total appointments confirmed. The % is your confirmation rate — what % of all assigned appointments you've confirmed. Target: 80%+." side="bottom" /></span>} value={String(stats.confirmed_count)} sub={stats.confirmation_rate !== null ? `${stats.confirmation_rate}% rate` : undefined} />
        <StatCard label="Texts sent" value={String(stats.texts_sent)} />
        <StatCard label="Flagged" value={String(stats.flagged_count)} />
        <div className="rounded-xl border border-hairline bg-white px-4 py-3 min-w-[120px] shrink-0">
          <div className="text-xs font-medium text-ink mb-1">This week</div>
          <Sparkline values={stats.week_trend} />
        </div>
      </div>
    </div>
  );
}

// ── Modal primitives ──────────────────────────────────────────────────────────

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onClose, onSubmit, submitLabel, disabled, destructive }: {
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onClose}
        className="flex-1 py-3 rounded-xl border border-hairline text-sm text-muted hover:bg-hairline/30"
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={disabled}
        className={`flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors ${
          destructive
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-amber text-white hover:bg-amber/90'
        }`}
      >
        {submitLabel}
      </button>
    </div>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [dmPresent, setDmPresent] = useState<boolean | null>(null);
  const [strength, setStrength] = useState<string>('confirmed');
  const [pending, start] = useTransition();

  function submit() {
    if (dmPresent === null) return;
    start(async () => {
      await confirmAppointmentRich(appt.id, dmPresent, strength);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Confirm appointment">
      <div className="text-sm text-muted">{appt.lead_name} · {fmtDate(appt.appt_date)} at {fmtTime(appt.appt_date)}</div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-ink mb-1">Decision-makers present?</label>
          <div className="flex gap-2">
            {[true, false].map((v) => (
              <button
                key={String(v)}
                onClick={() => setDmPresent(v)}
                className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-colors ${
                  dmPresent === v ? 'bg-amber text-white border-amber' : 'bg-white text-ink border-hairline hover:bg-hairline/30'
                }`}
              >
                {v ? 'Yes, all present' : 'No / unknown'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1">Confirmation strength</label>
          <div className="space-y-1.5">
            {[
              { value: 'confirmed', label: 'Confirmed — definitely coming' },
              { value: 'soft_confirmed', label: 'Soft — thinks they can make it' },
              { value: 'unreachable', label: 'Unreachable — could not speak to homeowner' },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => setStrength(s.value)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${
                  strength === s.value
                    ? 'bg-amber/10 border-amber/40 text-amber font-medium'
                    : 'bg-white border-hairline text-ink hover:bg-hairline/30'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ModalActions
        onClose={onClose}
        onSubmit={submit}
        submitLabel={pending ? 'Saving…' : 'Confirm & next'}
        disabled={dmPresent === null || pending}
      />
    </Modal>
  );
}

// ── Reschedule modal ──────────────────────────────────────────────────────────

function RescheduleModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [source, setSource] = useState<'inbound' | 'outbound'>('inbound');
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();

  function submit() {
    if (!newDate || !newTime) return;
    const iso = new Date(`${newDate}T${newTime}:00`).toISOString();
    start(async () => {
      await rescheduleAppointment(appt.id, appt.appt_date, iso, source, notes || undefined, reason || undefined);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Reschedule appointment">
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
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  source === s ? 'bg-amber text-white border-amber' : 'bg-white text-ink border-hairline hover:bg-hairline/30'
                }`}
              >
                {s === 'inbound' ? 'They called in' : 'We reached out'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink mb-1">Reason (optional)</label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40 bg-white"
          >
            <option value="">— Select reason —</option>
            {RESCHEDULE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-ink mb-1">New date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink mb-1">Time</label>
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
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
            className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
          />
        </div>
      </div>

      <ModalActions
        onClose={onClose}
        onSubmit={submit}
        submitLabel={pending ? 'Saving…' : 'Confirm reschedule'}
        disabled={!newDate || !newTime || pending}
      />
    </Modal>
  );
}

// ── Cancel modal ──────────────────────────────────────────────────────────────

function CancelModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();

  function submit() {
    if (!reason) return;
    start(async () => {
      await cancelAppointment(appt.id, reason as never, note || undefined);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Cancel appointment">
      <div className="text-sm text-muted">{appt.lead_name} · {fmtDate(appt.appt_date)}</div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-ink">Reason</label>
        {CANCELLATION_REASONS.map((r) => (
          <button
            key={r.value}
            onClick={() => setReason(r.value)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${
              reason === r.value
                ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                : 'bg-white border-hairline text-ink hover:bg-hairline/30'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {reason && (
        <div>
          <label className="block text-xs font-medium text-ink mb-1">
            Note {reason === 'other' ? '(required)' : '(optional)'}
          </label>
          <input
            type="text"
            placeholder="Brief note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300/60"
          />
        </div>
      )}

      <ModalActions
        onClose={onClose}
        onSubmit={submit}
        submitLabel={pending ? 'Saving…' : 'Cancel appointment'}
        disabled={!reason || (reason === 'other' && !note.trim()) || pending}
        destructive
      />
    </Modal>
  );
}

// ── Attempt modal ─────────────────────────────────────────────────────────────

function AttemptModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();

  function submit(method: string) {
    start(async () => {
      await logAttempt(appt.id, method, notes || undefined);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Log attempt">
      <div className="space-y-2">
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
      <input
        type="text"
        placeholder="Optional note…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
      />
    </Modal>
  );
}

// ── Inbound modal ─────────────────────────────────────────────────────────────

function InboundModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState<'rescheduled' | 'cancelled' | 'no_change'>('no_change');
  const [notes, setNotes] = useState('');
  const [pending, start] = useTransition();

  const OUTCOMES = [
    { value: 'no_change',   label: 'No change — confirmed / info only' },
    { value: 'rescheduled', label: 'Rescheduled (use Reschedule next)' },
    { value: 'cancelled',   label: 'Cancelled (use Cancel next)' },
  ] as const;

  function submit() {
    start(async () => {
      await logInboundCall(appt.id, outcome, notes || undefined);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Log inbound call">
      <div className="text-sm text-muted">{appt.lead_name} called about {fmtDate(appt.appt_date)}.</div>
      <div className="space-y-2">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            onClick={() => setOutcome(o.value)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${
              outcome === o.value
                ? 'bg-amber/10 border-amber/40 text-amber font-medium'
                : 'bg-white border-hairline text-ink hover:bg-hairline/30'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="What did the homeowner say?"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
      />
      <ModalActions onClose={onClose} onSubmit={submit} submitLabel={pending ? 'Logging…' : 'Log call'} disabled={pending} />
    </Modal>
  );
}

// ── Callback modal ────────────────────────────────────────────────────────────

function CallbackModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [pending, start] = useTransition();

  function submit() {
    if (!date || !time) return;
    const iso = new Date(`${date}T${time}:00`).toISOString();
    start(async () => {
      await setCallback(appt.id, iso);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Set callback">
      <div className="text-sm text-muted">{appt.lead_name}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-ink mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink mb-1">Time</label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40" />
        </div>
      </div>
      <ModalActions onClose={onClose} onSubmit={submit} submitLabel={pending ? 'Setting…' : 'Set callback'} disabled={!date || !time || pending} />
    </Modal>
  );
}

// ── Snooze modal ──────────────────────────────────────────────────────────────

function SnoozeModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [pending, start] = useTransition();

  function snooze(minutes: number) {
    const iso = new Date(Date.now() + minutes * 60000).toISOString();
    start(async () => {
      await snoozeAppointment(appt.id, iso);
      onDone();
    });
  }

  function submitCustom() {
    if (!date || !time) return;
    const iso = new Date(`${date}T${time}:00`).toISOString();
    start(async () => {
      await snoozeAppointment(appt.id, iso);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Snooze appointment">
      <div className="text-sm text-muted">{appt.lead_name}</div>
      <div className="space-y-2">
        {SNOOZE_OPTIONS.map((o) => (
          <button
            key={o.value}
            onClick={() => snooze(o.value)}
            disabled={pending}
            className="w-full py-3 rounded-xl bg-blue-50 border border-blue-200 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors"
          >
            💤 {o.label}
          </button>
        ))}
        <button
          onClick={() => setCustom((v) => !v)}
          className="w-full py-3 rounded-xl border border-hairline text-sm text-muted hover:bg-hairline/30 transition-colors"
        >
          Custom time…
        </button>
        {custom && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              className="border border-hairline rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40" />
          </div>
        )}
        {custom && (
          <button
            onClick={submitCustom}
            disabled={!date || !time || pending}
            className="w-full py-3 rounded-xl bg-amber text-white text-sm font-semibold hover:bg-amber/90 disabled:opacity-40 transition-colors"
          >
            {pending ? 'Setting…' : 'Snooze until custom time'}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ── Note modal ────────────────────────────────────────────────────────────────

function NoteModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(appt.notes ?? '');
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      await saveNote(appt.id, text);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Add / edit note">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Notes about this appointment…"
        className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40 resize-none"
      />
      <ModalActions onClose={onClose} onSubmit={submit} submitLabel={pending ? 'Saving…' : 'Save note'} disabled={pending} />
    </Modal>
  );
}

// ── Text modal ────────────────────────────────────────────────────────────────

function resolveTemplate(body: string, appt: CockpitAppointment): string {
  return body
    .replace('{name}', appt.lead_name ?? 'there')
    .replace('{date}', fmtDate(appt.appt_date))
    .replace('{time}', fmtTime(appt.appt_date));
}

function TextModal({
  appt,
  templates,
  onClose,
  onDone,
}: {
  appt: CockpitAppointment;
  templates: SmsTemplate[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<SmsTemplate | null>(templates[0] ?? null);
  const [pending, start] = useTransition();

  const preview = selected ? resolveTemplate(selected.body, appt) : '';

  function submit() {
    if (!selected) return;
    start(async () => {
      await sendTemplateText(appt.id, selected.name, resolveTemplate(selected.body, appt));
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Send text message">
      <p className="text-xs text-muted">Simulated only — no real SMS will be sent.</p>
      <div className="space-y-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelected(t)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${
              selected?.id === t.id
                ? 'bg-amber/10 border-amber/40 text-amber font-medium'
                : 'bg-white border-hairline text-ink hover:bg-hairline/30'
            }`}
          >
            {t.name}
          </button>
        ))}
      </div>
      {preview && (
        <div className="rounded-xl bg-hairline/20 border border-hairline p-3 text-sm text-ink">
          <div className="text-xs font-medium text-muted mb-1">Preview</div>
          {preview}
        </div>
      )}
      <ModalActions
        onClose={onClose}
        onSubmit={submit}
        submitLabel={pending ? 'Logging…' : 'Log as sent (simulated)'}
        disabled={!selected || pending}
      />
    </Modal>
  );
}

// ── Flag modal ────────────────────────────────────────────────────────────────

function FlagModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();

  function submit() {
    if (!reason) return;
    start(async () => {
      await flagToOwner(appt.id, reason, note || undefined);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Flag to owner">
      <div className="text-sm text-muted">{appt.lead_name}</div>
      <div className="space-y-2">
        {FLAG_REASONS.map((r) => (
          <button
            key={r.value}
            onClick={() => setReason(r.value)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors ${
              reason === r.value
                ? 'bg-red-50 border-red-300 text-red-700 font-medium'
                : 'bg-white border-hairline text-ink hover:bg-hairline/30'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Additional note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300/60"
      />
      <ModalActions
        onClose={onClose}
        onSubmit={submit}
        submitLabel={pending ? 'Flagging…' : 'Flag to owner'}
        disabled={!reason || (reason === 'other' && !note.trim()) || pending}
        destructive
      />
    </Modal>
  );
}

// ── Outcome modal ─────────────────────────────────────────────────────────────

function OutcomeModal({ appt, onClose, onDone }: { appt: CockpitAppointment; onClose: () => void; onDone: () => void }) {
  const [pending, start] = useTransition();

  function submit(outcome: 'sat' | 'no_show') {
    start(async () => {
      await logOutcome(appt.id, outcome);
      onDone();
    });
  }

  return (
    <Modal onClose={onClose} title="Log outcome">
      <div className="text-sm text-muted">{appt.lead_name} · {fmtDate(appt.appt_date)}</div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => submit('sat')}
          disabled={pending}
          className="py-6 rounded-2xl bg-good text-white text-lg font-bold hover:bg-good/90 disabled:opacity-40 transition-colors"
        >
          SAT ✓
        </button>
        <button
          onClick={() => submit('no_show')}
          disabled={pending}
          className="py-6 rounded-2xl bg-red-500 text-white text-lg font-bold hover:bg-red-600 disabled:opacity-40 transition-colors"
        >
          NO SHOW ✗
        </button>
      </div>
    </Modal>
  );
}

// ── Appointment card ──────────────────────────────────────────────────────────

type ModalType = 'confirm' | 'attempt' | 'reschedule' | 'cancel' | 'inbound' | 'callback' | 'snooze' | 'note' | 'text' | 'flag' | 'outcome';

function AppointmentCard({
  appt,
  currentUserId,
  smsTemplates,
  compact,
}: {
  appt: CockpitAppointment;
  currentUserId: string;
  smsTemplates: SmsTemplate[];
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!compact);
  const [modal, setModal] = useState<ModalType | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);

  const urgency = getUrgency(appt);

  const cardBg =
    urgency === 'callback-due' ? 'border-purple-400/60 bg-purple-50/40' :
    urgency === 'same-day'     ? 'border-red-400/60 bg-red-50/40' :
    urgency === 'urgent'       ? 'border-amber/50 bg-amber/5' :
    urgency === 'confirmed'    ? 'border-good/40 bg-good/5' :
    urgency === 'snoozed'      ? 'border-blue-300/50 bg-blue-50/30' :
    appt.flagged               ? 'border-red-300/60 bg-red-50/30' :
    'border-hairline bg-white';

  function closeModal() { setModal(null); }
  function doneModal() { setModal(null); }

  return (
    <>
      {modal === 'confirm'   && <ConfirmModal  appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'attempt'   && <AttemptModal  appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'reschedule'&& <RescheduleModal appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'cancel'    && <CancelModal   appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'inbound'   && <InboundModal  appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'callback'  && <CallbackModal appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'snooze'    && <SnoozeModal   appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'note'      && <NoteModal     appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'text'      && <TextModal appt={appt} templates={smsTemplates} onClose={closeModal} onDone={doneModal} />}
      {modal === 'flag'      && <FlagModal     appt={appt} onClose={closeModal} onDone={doneModal} />}
      {modal === 'outcome'   && <OutcomeModal  appt={appt} onClose={closeModal} onDone={doneModal} />}

      <div className={`rounded-2xl border-2 p-4 space-y-3 transition-all ${cardBg}`}>
        {/* Header */}
        <div
          className="flex items-start justify-between gap-3 flex-wrap cursor-pointer"
          onClick={() => compact && setExpanded((v) => !v)}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold text-ink truncate">
                {appt.lead_name ?? 'Unknown homeowner'}
              </h3>
              <UrgencyBadge level={urgency} />
              <StrengthBadge strength={appt.confirmation_strength} />
              {appt.flagged && (
                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 border border-red-300">
                  🚩 Flagged
                </span>
              )}
            </div>
            <div className="text-sm text-muted mt-0.5">{appt.client_company}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="num text-base font-bold text-ink">{fmtDate(appt.appt_date)}</div>
            <div className="num text-sm font-semibold text-amber">{fmtTime(appt.appt_date)}</div>
            {compact && (
              <div className="text-xs text-muted mt-0.5">{expanded ? '▲' : '▼'}</div>
            )}
          </div>
        </div>

        {/* Contact — always visible */}
        {appt.lead_phone && (
          <a
            href={`tel:${appt.lead_phone.replace(/\s+/g, '')}`}
            className="flex items-center gap-3 rounded-xl bg-amber/10 border border-amber/30 px-4 py-3 hover:bg-amber/20 transition-colors"
          >
            <span className="text-lg">📞</span>
            <span className="num text-base font-bold text-amber tracking-wide">{appt.lead_phone}</span>
            <span className="text-xs text-amber/70 ml-auto">Tap to call</span>
          </a>
        )}

        {/* Expanded content */}
        {expanded && (
          <>
            {appt.lead_address && (
              <div className="text-sm text-muted px-1">
                <span className="text-ink/50">Address: </span>
                <span className="text-ink">{appt.lead_address}</span>
              </div>
            )}

            {appt.setter && (
              <div className="text-xs text-muted px-1">
                Booked by: <span className="text-ink">{appt.setter}</span>
              </div>
            )}

            {appt.callback_at && (
              <div className="text-xs px-1 text-purple-600 font-medium">
                ⏰ Callback: {fmtShort(appt.callback_at)}
              </div>
            )}

            {appt.snooze_until && new Date(appt.snooze_until).getTime() > Date.now() && (
              <div className="text-xs px-1 text-blue-500 font-medium">
                💤 Snoozed until {fmtShort(appt.snooze_until)}
              </div>
            )}

            {appt.decision_makers_present !== null && (
              <div className="text-xs px-1 text-muted">
                Decision-makers present: <span className="text-ink font-medium">{appt.decision_makers_present ? 'Yes' : 'No / unknown'}</span>
              </div>
            )}

            {appt.notes && (
              <div className="rounded-xl bg-hairline/20 border border-hairline px-3 py-2 text-sm text-ink">
                <span className="text-xs font-medium text-muted block mb-0.5">Notes</span>
                {appt.notes}
              </div>
            )}

            {/* Attempt summary */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {appt.attempt_count > 0 ? (
                <span className="num px-2 py-1 rounded-md bg-hairline/30 text-ink border border-hairline">
                  {appt.attempt_count} attempt{appt.attempt_count !== 1 ? 's' : ''}
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
            {!appt.confirmed_at && (
              <div className="rounded-xl border border-hairline bg-white/60 overflow-hidden">
                <button
                  onClick={() => setChecklistOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-ink hover:bg-hairline/20 transition-colors"
                >
                  <span>Call checklist</span>
                  <span className="text-muted text-xs">{checklistOpen ? '▲' : '▼'}</span>
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
            )}

            {/* Timeline */}
            {appt.events.length > 0 && (
              <div className="rounded-xl border border-hairline bg-white/60 px-3 py-2.5">
                <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Timeline</div>
                <Timeline events={appt.events} currentUserId={currentUserId} />
              </div>
            )}

            {/* Primary actions */}
            <div className="grid grid-cols-2 gap-2">
              {!appt.confirmed_at && (
                <button
                  onClick={() => setModal('confirm')}
                  className="col-span-2 py-4 rounded-2xl bg-good text-white text-base font-bold hover:bg-good/90 transition-colors shadow-sm"
                >
                  ✓ Confirm appointment
                </button>
              )}
              <button onClick={() => setModal('attempt')}
                className="py-3 rounded-xl border-2 border-hairline bg-white text-sm font-semibold text-ink hover:bg-hairline/30 transition-colors">
                Log attempt
              </button>
              <button onClick={() => setModal('reschedule')}
                className="py-3 rounded-xl border-2 border-amber/40 bg-amber/5 text-sm font-semibold text-amber hover:bg-amber/10 transition-colors">
                Reschedule
              </button>
              <button onClick={() => setModal('inbound')}
                className="py-3 rounded-xl border-2 border-hairline bg-white text-sm font-semibold text-ink hover:bg-hairline/30 transition-colors">
                Log inbound call
              </button>
              <button onClick={() => setModal('cancel')}
                className="py-3 rounded-xl border-2 border-red-300/60 bg-red-50/50 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
                Cancel
              </button>
            </div>

            {/* Secondary actions */}
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setModal('callback')}
                className="py-2.5 rounded-xl border border-purple-200 bg-purple-50 text-xs font-medium text-purple-700 hover:bg-purple-100 transition-colors">
                ⏰ Set callback
              </button>
              <button onClick={() => setModal('snooze')}
                className="py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors">
                💤 Snooze
              </button>
              <button onClick={() => setModal('note')}
                className="py-2.5 rounded-xl border border-hairline bg-white text-xs font-medium text-ink hover:bg-hairline/30 transition-colors">
                📝 Add note
              </button>
              <button onClick={() => setModal('text')}
                className="py-2.5 rounded-xl border border-hairline bg-white text-xs font-medium text-ink hover:bg-hairline/30 transition-colors">
                💬 Send text
              </button>
              <button onClick={() => setModal('flag')}
                className="py-2.5 rounded-xl border border-red-200 bg-red-50 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors">
                🚩 Flag
              </button>
              <button onClick={() => setModal('outcome')}
                className="py-2.5 rounded-xl border border-hairline bg-white text-xs font-medium text-ink hover:bg-hairline/30 transition-colors">
                📊 Log outcome
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ── Queue row ─────────────────────────────────────────────────────────────────

function QueueRow({ appt, active, onClick }: { appt: CockpitAppointment; active: boolean; onClick: () => void }) {
  const urgency = getUrgency(appt);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-center gap-3 ${
        active ? 'bg-amber/10 border-2 border-amber/40' : 'border-2 border-transparent hover:bg-hairline/30'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-ink truncate">{appt.lead_name ?? 'Unknown'}</span>
          <UrgencyBadge level={urgency} />
          {appt.flagged && <span className="text-red-500 text-xs">🚩</span>}
        </div>
        <div className="num text-xs text-muted mt-0.5">{fmtDate(appt.appt_date)} · {fmtTime(appt.appt_date)}</div>
      </div>
      {appt.attempt_count > 0 && <span className="num text-xs text-muted shrink-0">{appt.attempt_count}×</span>}
    </button>
  );
}

// ── My Day tab ────────────────────────────────────────────────────────────────

type DaySection = {
  label: string;
  emoji: string;
  color: string;
  appts: CockpitAppointment[];
};

function MyDayTab({
  appointments,
  currentUserId,
  smsTemplates,
}: {
  appointments: CockpitAppointment[];
  currentUserId: string;
  smsTemplates: SmsTemplate[];
}) {
  const now = Date.now();
  const h48 = now + 48 * 60 * 60 * 1000;

  const sections: DaySection[] = useMemo(() => [
    {
      label: 'Callbacks due now',
      emoji: '🔴',
      color: 'text-purple-700',
      appts: appointments.filter((a) =>
        a.callback_at && new Date(a.callback_at).getTime() <= now,
      ),
    },
    {
      label: 'Urgent to confirm',
      emoji: '🟠',
      color: 'text-amber',
      appts: appointments.filter((a) =>
        !a.confirmed_at &&
        !a.callback_at &&
        !(a.snooze_until && new Date(a.snooze_until).getTime() > now) &&
        new Date(a.appt_date).getTime() > now &&
        new Date(a.appt_date).getTime() <= h48,
      ),
    },
    {
      label: "Today's appointments",
      emoji: '🟡',
      color: 'text-good',
      appts: appointments.filter((a) => {
        const d = new Date(a.appt_date);
        const today = new Date(); today.setHours(0,0,0,0);
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
        return a.confirmed_at && d >= today && d < tomorrow;
      }),
    },
    {
      label: 'Snoozed returning',
      emoji: '🔵',
      color: 'text-blue-600',
      appts: appointments.filter((a) =>
        a.snooze_until &&
        new Date(a.snooze_until).getTime() <= now,
      ),
    },
    {
      label: 'To confirm',
      emoji: '📋',
      color: 'text-muted',
      appts: appointments.filter((a) =>
        !a.confirmed_at &&
        !a.callback_at &&
        !(a.snooze_until && new Date(a.snooze_until).getTime() > now) &&
        new Date(a.appt_date).getTime() > h48,
      ),
    },
  ], [appointments, now, h48]);

  const nonEmpty = sections.filter((s) => s.appts.length > 0);

  if (nonEmpty.length === 0) {
    return (
      <div className="card overflow-hidden">
        <EmptyState
          preset="alerts"
          heading="Queue is clear"
          body="Nothing needs doing right now — all upcoming appointments are confirmed or snoozed."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        if (section.appts.length === 0) return null;
        return (
          <div key={section.label}>
            <h2 className={`text-sm font-semibold mb-3 flex items-center gap-1.5 ${section.color}`}>
              {section.emoji} {section.label}
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-hairline/30 text-muted text-xs font-normal">
                {section.appts.length}
              </span>
            </h2>
            <div className="space-y-3">
              {section.appts.map((a) => (
                <AppointmentCard
                  key={a.id}
                  appt={a}
                  currentUserId={currentUserId}
                  smsTemplates={smsTemplates}
                  compact={section.appts.length > 2}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Queue tab ─────────────────────────────────────────────────────────────────

function QueueTab({
  appointments,
  currentUserId,
  smsTemplates,
}: {
  appointments: CockpitAppointment[];
  currentUserId: string;
  smsTemplates: SmsTemplate[];
}) {
  const [activeId, setActiveId] = useState<string | null>(appointments[0]?.id ?? null);
  const active = appointments.find((a) => a.id === activeId) ?? null;

  if (appointments.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-10 text-center text-muted">
        No upcoming appointments in the queue.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {active && (
        <AppointmentCard
          appt={active}
          currentUserId={currentUserId}
          smsTemplates={smsTemplates}
          compact={false}
        />
      )}
      <div className="rounded-xl border border-hairline bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-hairline bg-hairline/10">
          <span className="text-xs font-semibold text-muted uppercase tracking-wide">
            All appointments — {appointments.length}
          </span>
        </div>
        <div className="p-2 space-y-1 max-h-72 overflow-y-auto">
          {appointments.map((a) => (
            <QueueRow
              key={a.id}
              appt={a}
              active={a.id === activeId}
              onClick={() => setActiveId(a.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Callbacks tab ─────────────────────────────────────────────────────────────

function CallbacksTab({
  appointments,
  currentUserId,
  smsTemplates,
}: {
  appointments: CockpitAppointment[];
  currentUserId: string;
  smsTemplates: SmsTemplate[];
}) {
  const now = Date.now();
  const withCallbacks = appointments
    .filter((a) => a.callback_at)
    .sort((a, b) => new Date(a.callback_at!).getTime() - new Date(b.callback_at!).getTime());

  const due = withCallbacks.filter((a) => new Date(a.callback_at!).getTime() <= now);
  const upcoming = withCallbacks.filter((a) => new Date(a.callback_at!).getTime() > now);

  if (withCallbacks.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-10 text-center text-muted">
        No callbacks set.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {due.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-purple-700">⏰ Due now ({due.length})</h2>
          <div className="space-y-3">
            {due.map((a) => (
              <AppointmentCard key={a.id} appt={a} currentUserId={currentUserId} smsTemplates={smsTemplates} compact />
            ))}
          </div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3 text-muted">Upcoming ({upcoming.length})</h2>
          <div className="space-y-3">
            {upcoming.map((a) => (
              <div key={a.id} className="rounded-xl border border-hairline bg-white px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-ink">{a.lead_name ?? 'Unknown'}</div>
                  <div className="text-xs text-muted">Appt: {fmtDate(a.appt_date)} · Callback: {fmtShort(a.callback_at!)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lookup tab ────────────────────────────────────────────────────────────────

function LookupTab({ currentUserId, smsTemplates }: { currentUserId: string; smsTemplates: SmsTemplate[] }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CockpitAppointment[] | null>(null);
  const [pending, start] = useTransition();

  function search() {
    if (!query.trim()) { setResults(null); return; }
    start(async () => {
      const r = await searchAppointments(query);
      setResults(r);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Search by homeowner name or phone to find an appointment not in your queue.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Name or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          className="flex-1 border border-hairline rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
        />
        <button
          onClick={search}
          disabled={pending}
          className="px-4 py-2.5 rounded-xl bg-amber text-white text-sm font-semibold hover:bg-amber/90 disabled:opacity-40 transition-colors"
        >
          {pending ? '…' : 'Search'}
        </button>
      </div>
      {results !== null && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <EmptyState
              preset="appointments"
              heading="No appointments found"
              body="Try different search terms."
            />
          ) : (
            results.map((a) => (
              <AppointmentCard key={a.id} appt={a} currentUserId={currentUserId} smsTemplates={smsTemplates} compact />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Owner stats table ─────────────────────────────────────────────────────────

function OwnerStatsTable({ stats }: { stats: ConfirmerStatsRich[] }) {
  if (stats.length === 0) return <p className="text-sm text-muted">No confirmer stats yet.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-hairline">
      <table className="w-full text-sm">
        <thead className="bg-hairline/10 border-b border-hairline">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Confirmer</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Today</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Total</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Show%</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Save%</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Texts</th>
            <th className="text-right px-3 py-2.5 text-xs font-semibold text-muted uppercase tracking-wide">Flags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {stats.map((s) => (
            <tr key={s.confirmer_id} className="hover:bg-hairline/10">
              <td className="px-4 py-2.5 font-medium text-ink">{s.confirmer_email}</td>
              <td className="num text-right px-3 py-2.5 text-ink">{s.today_confirmed}</td>
              <td className="num text-right px-3 py-2.5 text-ink">{s.confirmed_count}</td>
              <td className="num text-right px-3 py-2.5 text-muted">{s.show_rate !== null ? `${s.show_rate}%` : '—'}</td>
              <td className="num text-right px-3 py-2.5 text-muted">{s.save_rate !== null ? `${s.save_rate}%` : '—'}</td>
              <td className="num text-right px-3 py-2.5 text-muted">{s.texts_sent}</td>
              <td className="num text-right px-3 py-2.5 text-muted">{s.flagged_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

type TabId = 'my-day' | 'queue' | 'callbacks' | 'lookup';

export function CockpitClient({
  appointments,
  smsTemplates,
  myStats,
  allConfirmerStats,
  currentUserId,
  isOwner,
}: {
  appointments: CockpitAppointment[];
  smsTemplates: SmsTemplate[];
  myStats: ConfirmerStatsRich | null;
  allConfirmerStats: ConfirmerStatsRich[];
  currentUserId: string;
  isOwner: boolean;
}) {
  const [tab, setTab] = useState<TabId>('my-day');

  const callbacksDue = appointments.filter(
    (a) => a.callback_at && new Date(a.callback_at).getTime() <= Date.now(),
  ).length;

  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: 'my-day',    label: 'My Day' },
    { id: 'queue',     label: 'Queue',     badge: appointments.filter((a) => a.outcome === 'booked').length },
    { id: 'callbacks', label: 'Callbacks', badge: callbacksDue || undefined },
    { id: 'lookup',    label: 'Lookup' },
  ];

  return (
    <div className="space-y-5">
      {/* Owner banner */}
      {isOwner && (
        <div className="rounded-xl bg-amber/10 border border-amber/30 px-4 py-3 text-sm text-amber font-medium">
          Viewing as owner — all confirmer actions are available.
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-ink">
          Confirmation cockpit
        </h1>
        <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
          Confirm, reschedule, or handle inbound calls on upcoming appointments.
          <HelpTooltip text="Urgency order: Callback due → Same-day → Urgent (within 48h) → Upcoming. Always work top-to-bottom." side="right" />
        </p>
      </div>

      {/* Stats bar */}
      {myStats && <StatsBar stats={myStats} />}

      {/* Owner: all confirmers stats */}
      {isOwner && allConfirmerStats.length > 0 && (
        <div>
          <h2 className="label mb-2">All confirmers</h2>
          <OwnerStatsTable stats={allConfirmerStats} />
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-hairline/20 rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-[80px] py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              tab === t.id
                ? 'bg-white text-ink shadow-sm'
                : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-bold ${
                tab === t.id ? 'bg-amber text-white' : 'bg-hairline/50 text-muted'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'my-day' && (
          <MyDayTab
            appointments={appointments}
            currentUserId={currentUserId}
            smsTemplates={smsTemplates}
          />
        )}
        {tab === 'queue' && (
          <QueueTab
            appointments={appointments}
            currentUserId={currentUserId}
            smsTemplates={smsTemplates}
          />
        )}
        {tab === 'callbacks' && (
          <CallbacksTab
            appointments={appointments}
            currentUserId={currentUserId}
            smsTemplates={smsTemplates}
          />
        )}
        {tab === 'lookup' && (
          <LookupTab currentUserId={currentUserId} smsTemplates={smsTemplates} />
        )}
      </div>
    </div>
  );
}
