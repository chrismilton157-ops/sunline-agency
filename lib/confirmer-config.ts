// Editable lists for the confirmer cockpit. Change these here and the UI
// picks them up everywhere — they live in exactly one place.

export const CANCELLATION_REASONS = [
  { value: 'changed_mind',               label: 'Changed mind / no longer interested' },
  { value: 'went_with_another',          label: 'Went with another installer' },
  { value: 'cant_afford',               label: "Can't afford / finance fell through" },
  { value: 'circumstances_changed',      label: 'Circumstances changed (moving, illness, etc.)' },
  { value: 'decision_makers_unavailable', label: "Couldn't get all decision-makers together" },
  { value: 'unresponsive',               label: 'Unresponsive after booking' },
  { value: 'other',                      label: 'Other (add note below)' },
] as const;

export type CancellationReasonValue =
  (typeof CANCELLATION_REASONS)[number]['value'];

export const ATTEMPT_METHODS = [
  { value: 'no_answer',      label: 'Called — no answer' },
  { value: 'left_voicemail', label: 'Left voicemail' },
  { value: 'texted',         label: 'Sent text message' },
] as const;

export type AttemptMethodValue =
  (typeof ATTEMPT_METHODS)[number]['value'];

// Call checklist shown in the cockpit. Edit the text here to change what
// appears on screen — it is NOT a rigid script.
export const CALL_CHECKLIST = [
  'Reconfirm the date and time with the homeowner',
  'Rebuild interest — re-frame the value of the free survey',
  'Confirm all decision-makers will be present on the day',
  'Confirm the address is still correct',
  'Ask if there is anything that might affect the visit',
] as const;

export const RESCHEDULE_REASONS = [
  { value: 'homeowner_busy',             label: 'Homeowner busy / away' },
  { value: 'decision_maker_unavailable', label: "Decision-maker can't make it" },
  { value: 'weather_illness',            label: 'Weather or illness' },
  { value: 'installer_requested',        label: 'Installer requested change' },
  { value: 'wants_more_time',            label: 'Wants more time to think' },
  { value: 'other',                      label: 'Other (add note)' },
] as const;
export type RescheduleReasonValue = (typeof RESCHEDULE_REASONS)[number]['value'];

export const SNOOZE_OPTIONS = [
  { value: 120,  label: '2 hours' },
  { value: 240,  label: 'This afternoon (4h)' },
  { value: 1440, label: 'Tomorrow' },
] as const;

// SMS templates are in the DB (sms_templates table) so they are editable.
// This is a fallback for when the DB has not loaded yet.
export const DEFAULT_SMS_TEMPLATES = [
  { name: 'Confirmation', body: 'Hi {name}, just confirming your free solar survey on {date} at {time}. Reply or call if anything changes!' },
  { name: 'Reminder',     body: 'Hi {name}, reminder — your solar survey is tomorrow at {time}. See you then!' },
  { name: 'Missed call',  body: 'Hi {name}, we tried to reach you about your solar survey. Please call us back when you can.' },
];

export const FLAG_REASONS = [
  { value: 'angry_homeowner',   label: 'Angry homeowner' },
  { value: 'wants_to_complain', label: 'Wants to make a complaint' },
  { value: 'dispute',           label: 'Dispute / disagreement' },
  { value: 'safeguarding',      label: 'Safeguarding concern' },
  { value: 'other',             label: 'Other (add note)' },
] as const;
export type FlagReasonValue = (typeof FLAG_REASONS)[number]['value'];
