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
