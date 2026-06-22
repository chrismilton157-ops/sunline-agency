// Sunline Phase 5b: lead-qualifying thresholds + disqualification rules.
//
// All knobs that decide whether a captured lead is a real, billable
// opportunity live in this file. Today they're code constants; a later
// phase is intended to move them behind an owner-editable settings UI
// (DB-backed) — keep them centralised here so that migration is a
// single-file replacement, not a hunt-and-replace.
//
// The form UI reads BILL_BANDS to render the tappable bands; the server
// path (lib/leads.ts → captureLead) calls assessQualification() before
// invoking the routing engine. Disqualified leads are stored with a
// reason, NEVER routed to a client, and NEVER count toward weekly
// promises.

export const MIN_MONTHLY_BILL_GBP = 80;

export type BillBandKey =
  | 'under_80'
  | '80_120'
  | '120_200'
  | '200_plus';

export type BillBand = {
  key: BillBandKey;
  label: string;
  // Representative £/month used as the lead's monthly_bill in downstream
  // analytics. `null` means the band is disqualifying (we don't store a
  // number we'd then have to caveat as "disqualified, ignore in stats").
  representative: number | null;
};

export const BILL_BANDS: BillBand[] = [
  { key: 'under_80', label: 'Under £80', representative: null },
  { key: '80_120', label: '£80–120', representative: 100 },
  { key: '120_200', label: '£120–200', representative: 160 },
  { key: '200_plus', label: '£200+', representative: 250 },
];

export function bandByKey(key: string | null | undefined): BillBand | undefined {
  if (!key) return undefined;
  return BILL_BANDS.find((b) => b.key === key);
}

// ---------- disqualification ----------

export type DisqualReason = 'not_homeowner' | 'bill_under_80';

// Used by the owner Leads screen to render the DQ chip.
export const DISQUAL_LABELS: Record<DisqualReason, string> = {
  not_homeowner: 'Not homeowner',
  bill_under_80: `Bill under £${MIN_MONTHLY_BILL_GBP}`,
};

// Sentinel that routing_rule_fired stores for disqualified leads —
// `dq_<reason>`. The Leads screen parses this prefix.
export const DQ_RULE_PREFIX = 'dq_';
export const dqRule = (r: DisqualReason) => `${DQ_RULE_PREFIX}${r}`;

export function parseDqRule(routingRule: string | null): DisqualReason | null {
  if (!routingRule || !routingRule.startsWith(DQ_RULE_PREFIX)) return null;
  const suffix = routingRule.slice(DQ_RULE_PREFIX.length) as DisqualReason;
  return suffix in DISQUAL_LABELS ? suffix : null;
}

type QualResult =
  | { qualified: true; representativeBill: number | null }
  | { qualified: false; reason: DisqualReason; representativeBill: number | null };

export function assessQualification(input: {
  is_homeowner: boolean;
  bill_band: BillBandKey | null;
}): QualResult {
  if (!input.is_homeowner) {
    return { qualified: false, reason: 'not_homeowner', representativeBill: null };
  }
  if (input.bill_band === 'under_80') {
    return { qualified: false, reason: 'bill_under_80', representativeBill: null };
  }
  const band = bandByKey(input.bill_band);
  return { qualified: true, representativeBill: band?.representative ?? null };
}
