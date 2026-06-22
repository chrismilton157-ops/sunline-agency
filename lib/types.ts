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

export type Lead = {
  id: string;
  client_id: string;
  name: string | null;
  address: string | null;
  response_mins: number | null;
  consent: boolean;
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
