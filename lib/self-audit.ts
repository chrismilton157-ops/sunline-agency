// Self-audit maths for the public /for-installers funnel.
//
// Framework-free and pure so the exact same calculation runs in two places:
//   * the browser, for the instant client-side preview as the prospect types;
//   * the server action, to compute the authoritative cost-per-sale that we
//     store on the enquiry (never trust a number that came from a hidden field).
//
// Every division is guarded — with zero appointments, a zero close rate, or a
// sales figure that works out below one, we return `valid: false` so the UI can
// show a friendly "enter a few numbers" state instead of Infinity / NaN.

export const INSTALLER_SELF_AUDIT_SOURCE = 'installer_self_audit';

export interface AuditInput {
  /** £ spent per month on leads / appointments. */
  monthlySpend: number;
  /** Appointments (or leads) that spend gets, per month. */
  appointments: number;
  /** Share of those that turn into a sale, as a percentage 0–100. */
  closeRatePct: number;
}

export interface AuditResult {
  /** false → not enough real numbers to divide safely; outputs are null. */
  valid: boolean;
  /** appointments × (closeRatePct / 100). */
  sales: number;
  /** monthly spend ÷ appointments. */
  costPerAppointment: number | null;
  /** monthly spend ÷ sales — the number that actually matters. */
  costPerSale: number | null;
}

export function computeAudit(input: AuditInput): AuditResult {
  const { monthlySpend, appointments, closeRatePct } = input;

  const spendOk = Number.isFinite(monthlySpend) && monthlySpend > 0;
  const apptsOk = Number.isFinite(appointments) && appointments >= 1;
  const rateOk =
    Number.isFinite(closeRatePct) && closeRatePct > 0 && closeRatePct <= 100;

  const sales = apptsOk && rateOk ? appointments * (closeRatePct / 100) : 0;

  // Guard every division: need real spend, at least one appointment, and at
  // least one sale. Anything short of that → friendly state, never a
  // divide-by-zero, Infinity, or NaN reaching the screen or the database.
  if (!spendOk || !apptsOk || !rateOk || sales < 1) {
    return { valid: false, sales, costPerAppointment: null, costPerSale: null };
  }

  return {
    valid: true,
    sales,
    costPerAppointment: monthlySpend / appointments,
    costPerSale: monthlySpend / sales,
  };
}

/**
 * Whole-number "Nx higher" multiplier for the result-card badge: how many
 * times the real cost per sale sits above the apparent cost per appointment.
 *
 * Returns `null` when the audit isn't computable, or when the figure rounds to
 * 1 or less — in that case the number isn't striking enough to be worth a
 * badge, so the UI hides it rather than showing a limp "1x higher".
 */
export function auditMultiplier(result: AuditResult): number | null {
  if (
    !result.valid ||
    result.costPerSale == null ||
    result.costPerAppointment == null ||
    result.costPerAppointment <= 0
  ) {
    return null;
  }
  const multiple = Math.round(result.costPerSale / result.costPerAppointment);
  return multiple > 1 ? multiple : null;
}

// ---------------------------------------------------------------------------
// Enquiry row builder — maps a validated demo request + its audit numbers to
// the exact shape we insert into installer_enquiries. Pure and separately
// testable so we can assert the audit numbers (and the source tag) are
// attached without touching the database.
// ---------------------------------------------------------------------------

export interface InstallerAuditEnquiryInput {
  name: string;
  company: string;
  email: string;
  phone?: string | null;
  /** Area / postcodes they cover. */
  region?: string | null;
  /** Free-text preferred day/time for a call. */
  preferredCallTime?: string | null;
  audit: AuditInput;
}

export interface InstallerEnquiryRow {
  name: string;
  company: string;
  email: string;
  phone: string | null;
  region: string | null;
  preferred_call_time: string | null;
  source: string;
  audit_monthly_spend: number | null;
  audit_appointments: number | null;
  audit_close_rate: number | null;
  audit_cost_per_sale: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const orNull = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};

export function buildInstallerAuditRow(
  input: InstallerAuditEnquiryInput,
): InstallerEnquiryRow {
  const { monthlySpend, appointments, closeRatePct } = input.audit;
  const result = computeAudit(input.audit);

  return {
    name: input.name.trim(),
    company: input.company.trim(),
    email: input.email.trim(),
    phone: orNull(input.phone),
    region: orNull(input.region),
    preferred_call_time: orNull(input.preferredCallTime),
    source: INSTALLER_SELF_AUDIT_SOURCE,
    // Store the raw numbers the prospect entered (rounded for the column
    // scale) even when the audit is incomplete — only the derived
    // cost-per-sale is null when we couldn't compute it safely.
    audit_monthly_spend: Number.isFinite(monthlySpend) ? round2(monthlySpend) : null,
    audit_appointments: Number.isFinite(appointments) ? Math.round(appointments) : null,
    audit_close_rate: Number.isFinite(closeRatePct) ? round2(closeRatePct) : null,
    audit_cost_per_sale: result.costPerSale != null ? round2(result.costPerSale) : null,
  };
}
