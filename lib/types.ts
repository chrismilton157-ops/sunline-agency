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
};

export type Appointment = {
  id: string;
  client_id: string;
  lead_id: string;
  appt_date: string;
  setter: string | null;
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
  'ad_spend_monthly' | 'weekly_promise' | 'priority'
>;

export type ClientPostcode = {
  client_id: string;
  postcode_prefix: string;
};

export type PostcodeVolume = {
  postcode_prefix: string;
  typical_weekly_leads: number;
};
