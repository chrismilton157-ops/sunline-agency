export type ClientStatus = 'active' | 'paused';
export type Outcome = 'booked' | 'sat' | 'sold' | 'no_show';
export type QualityRating = 'up' | 'down';

export type Client = {
  id: string;
  company: string;
  contact: string | null;
  region: string | null;
  retainer: number;
  per_sit_fee: number;
  ad_spend_monthly: number;
  status: ClientStatus;
  joined_at: string;
  weekly_promise: number;
  priority: number;
  management_markup_pct: number;
};

export type Appointment = {
  id: string;
  client_id: string;
  lead_id: string;
  appt_date: string;
  setter: string | null;
  setter_id: string | null;
  outcome: Outcome;
  sale_value: number | null;
  invoiced: boolean;
  quality_rating: QualityRating | null;
  quality_reason: string | null;
  confirmed_at: string | null;
};

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'booked' | 'disqualified';

// The client-portal-safe Lead — only fields in the column SELECT grant
// (migration 0006). All agency-only metadata is on `LeadOwner` below.
export type Lead = {
  id: string;
  client_id: string | null; // Phase 5: nullable for unassigned leads
  campaign_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  postcode: string | null;
  monthly_bill: number | null;
  is_homeowner: boolean | null;
  bill_payer: boolean | null;
  roof_suitable: boolean | null;
  finance_interest: boolean | null;
  consent: boolean;
  status: LeadStatus;
  response_mins: number | null;
  created_at: string;
};

// Owner-only view — adds the agency-only metadata that the column-level
// grant in 0006 keeps out of the authenticated role.
export type LeadOwner = Lead & {
  notes: string | null;
  campaign_source: string | null;
  consent_at: string | null;
  consent_source: string | null;
  routing_rule_fired: string | null;
  data_retention_until: string | null;
};

// A client row WITHOUT any agency-only column. Used by the portal so
// agency figures (ad spend, routing config) cannot be surfaced even by
// mistake. Mirrors the explicit-column SELECT grant in migration 0004.
export type ClientPublic = Omit<
  Client,
  'ad_spend_monthly' | 'weekly_promise' | 'priority' | 'management_markup_pct'
>;

export type ClientPostcode = {
  client_id: string;
  postcode_prefix: string;
};

export type PostcodeVolume = {
  postcode_prefix: string;
  typical_weekly_leads: number;
};

// ---------- Phase 8: calling queue ----------

export type CallDispositionType =
  | 'no_answer'
  | 'callback'
  | 'not_interested'
  | 'wrong_number'
  | 'disqualified'
  | 'booked';

export type CallDisposition = {
  id: string;
  lead_id: string;
  disposition: CallDispositionType;
  callback_at: string | null;
  disqual_reason: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

// Extends LeadOwner with queue tracking fields (admin-client only; not in the
// column-level SELECT grant from migration 0006, so invisible to authenticated).
export type LeadQueue = LeadOwner & {
  no_answer_count: number;
  queue_claimed_by: string | null;
  queue_claimed_at: string | null;
  dispositions: CallDisposition[];
};

// ---------- Phase 10: qualifying wrap-up ----------

export type MonthlyBillBand =
  | 'band_0_50' | 'band_50_100' | 'band_100_150' | 'band_150_200' | 'band_200_plus';

export type IncomeStatus =
  | 'employed_paye' | 'self_employed' | 'self_funded_retiree'
  | 'state_pension_only' | 'no_income';

export type SolarIntention = 'replace' | 'add_on';

export type RoofType =
  | 'pitched_tiles' | 'pitched_slate' | 'flat' | 'metal' | 'other' | 'not_suitable';

export type CreditStatus =
  | 'good' | 'fair' | 'poor_declined' | 'cash_buyer' | 'not_eligible';

export type WrapDisqualReason =
  | 'not_homeowner' | 'income_ineligible' | 'decision_maker_unavailable'
  | 'roof_unsuitable' | 'credit_affordability';

// ---------- Phase 9: confirmation queue ----------

export type ConfirmationAttempt = {
  id: string;
  appointment_id: string;
  method: string;
  notes: string | null;
  attempted_by: string;
  created_at: string;
};

export type ConfirmationAppointment = {
  id: string;
  client_id: string;
  lead_id: string;
  appt_date: string;
  setter: string | null;
  outcome: Outcome;
  confirmed_at: string | null;
  // Joined from leads
  lead_name: string | null;
  lead_phone: string | null;
  lead_address: string | null;
  // Joined from clients
  client_company: string;
  // Attempt history
  attempts: ConfirmationAttempt[];
};

// ---------- Phase 20: confirmer cockpit ----------

export type AppointmentEventType =
  | 'confirmed'
  | 'attempt'
  | 'rescheduled'
  | 'cancelled'
  | 'inbound_call';

export type CancellationReason =
  | 'changed_mind'
  | 'went_with_another'
  | 'cant_afford'
  | 'circumstances_changed'
  | 'decision_makers_unavailable'
  | 'unresponsive'
  | 'other';

export type RescheduleSource = 'inbound' | 'outbound';

export type AppointmentEvent = {
  id: string;
  appointment_id: string;
  event_type: AppointmentEventType;
  actor_id: string | null;
  attempt_method: string | null;
  old_appt_date: string | null;
  new_appt_date: string | null;
  reschedule_source: RescheduleSource | null;
  cancellation_reason: CancellationReason | null;
  cancellation_note: string | null;
  inbound_outcome: string | null;
  notes: string | null;
  created_at: string;
};

// Appointment enriched with lead/client data + events — used in the cockpit.
export type CockpitAppointment = {
  id: string;
  lead_id: string;
  client_id: string;
  appt_date: string;
  setter: string | null;
  outcome: string;           // 'booked' | 'cancelled' | etc.
  confirmed_at: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_address: string | null;
  client_company: string;
  events: AppointmentEvent[];
  // Derived from events + legacy attempts
  attempt_count: number;
  last_attempt_at: string | null;
};

export type ConfirmerStats = {
  confirmer_id: string;
  confirmer_email: string;
  confirmation_rate: number | null;   // % of booked appts confirmed before date
  show_rate: number | null;           // % of confirmed appts that actually sat/sold
  save_rate: number | null;           // % of would-be cancellations converted to reschedule
  reschedules: number;
  cancellations: number;
  inbound_calls: number;
  confirmed_count: number;
  cancellation_reasons: Record<string, number>;
};

// ---------- Phase 6: invoices ----------

export type InvoiceStatus = 'draft' | 'issued' | 'paid';

// Client-visible invoice row — only fields in the column SELECT grant
// set up in 0007. Specifically excludes `ad_spend_raw` and
// `management_markup_pct_snapshot`.
export type Invoice = {
  id: string;
  client_id: string;
  period: string; // YYYY-MM
  advertising_management: number;
  appointment_count: number;
  appointment_fees: number;
  total: number;
  status: InvoiceStatus;
  issued_at: string | null;
  paid_at: string | null;
  per_sit_fee_snapshot: number;
  amount: number; // legacy mirror of total
  paid: boolean;  // legacy mirror of (status === 'paid')
  created_at: string;
  updated_at: string;
};

// Owner-only invoice — adds the agency-only money columns that the
// column grant in 0007 keeps out of the authenticated role.
export type InvoiceOwner = Invoice & {
  ad_spend_raw: number;
  management_markup_pct_snapshot: number;
};
