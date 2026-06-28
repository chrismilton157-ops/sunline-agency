/**
 * Centralised alert-computation for the owner Alerts Centre.
 *
 * All alerts are derived live from current data — they clear themselves
 * automatically once the underlying problem is resolved.
 *
 * THRESHOLDS — edit here (no inline magic numbers elsewhere):
 *   ZERO_LEAD_DAYS          days with no new leads before "client starving" fires
 *   CONCENTRATION_THRESHOLD revenue share that triggers the concentration alert
 *
 * FUTURE HOOK — to add email / SMS delivery of alerts, call `computeAlerts()`
 * server-side and pass the result to your notification provider here. Nothing
 * is wired yet; this comment marks the attachment point.
 */

import type { Client, Appointment, Lead } from './types';
import type { ClientMetrics, Portfolio } from './metrics';
import { fmtMoney2, fmtPct } from './format';

// ---------------------------------------------------------------------------
// Owner-editable thresholds (centralised — not hardcoded inline)
// ---------------------------------------------------------------------------

/** Days a client can receive zero leads before "starving" fires. */
export const ZERO_LEAD_DAYS = 4;

/** Revenue share that triggers the concentration warning. */
export const CONCENTRATION_THRESHOLD = 0.4;

// ---------------------------------------------------------------------------
// Alert types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critical' | 'warning' | 'info';

export type Alert = {
  severity: AlertSeverity;
  /** Short plain-English summary shown in the list. */
  title: string;
  /** Optional extra detail sentence. */
  detail?: string;
  /** Affected entity label, e.g. client company name. */
  entity?: string;
  /** href of the screen where the problem is actioned. */
  actionHref: string;
  /** Link label. */
  actionLabel: string;
};

// Severity sort order (lower = shown first)
const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ---------------------------------------------------------------------------
// Main computation
// ---------------------------------------------------------------------------

export type AlertInputs = {
  clients: Client[];
  appointments: Appointment[];
  leads: Lead[];
  perClient: ClientMetrics[];
  pf: Portfolio;
  /** Unconfirmed future appointments within 48 h */
  needsConfirmingCount: number;
  /** Current moment (injectable for tests) */
  now?: Date;
};

export function computeAlerts({
  clients,
  leads,
  perClient,
  pf,
  needsConfirmingCount,
  now = new Date(),
}: AlertInputs): Alert[] {
  const alerts: Alert[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;

  // ── 1. Client starving: zero new leads for ≥ ZERO_LEAD_DAYS ──────────────
  for (const c of clients) {
    if (c.status !== 'active') continue;
    const clientLeads = leads.filter((l) => l.client_id === c.id);
    if (clientLeads.length === 0) {
      // Never received a lead — only flag if joined > threshold days ago
      const joinedMs = new Date(`${c.joined_at}T00:00:00Z`).getTime();
      if (now.getTime() - joinedMs < ZERO_LEAD_DAYS * DAY_MS) continue;
      alerts.push({
        severity: 'critical',
        title: `${c.company} has never received a lead`,
        detail: `Client joined more than ${ZERO_LEAD_DAYS} days ago but has no leads on record.`,
        entity: c.company,
        actionHref: '/leads',
        actionLabel: 'Go to Leads →',
      });
      continue;
    }
    const latestLeadMs = clientLeads
      .map((l) => new Date(l.created_at).getTime())
      .reduce((a, b) => Math.max(a, b), 0);
    const daysSinceLead = Math.floor(
      (now.getTime() - latestLeadMs) / DAY_MS,
    );
    if (daysSinceLead >= ZERO_LEAD_DAYS) {
      alerts.push({
        severity: 'critical',
        title: `${c.company} — no new leads for ${daysSinceLead} days`,
        detail: `Last lead arrived ${daysSinceLead} day${daysSinceLead !== 1 ? 's' : ''} ago. Check routing and campaign spend.`,
        entity: c.company,
        actionHref: '/routing',
        actionLabel: 'Check routing →',
      });
    }
  }

  // ── 2. Net margin negative ────────────────────────────────────────────────
  if (pf.netMargin < 0) {
    alerts.push({
      severity: 'critical',
      title: `Portfolio net margin is negative (${fmtMoney2(pf.netMargin)})`,
      detail:
        'Total agency revenue is below combined ad spend and overhead. Review ad budgets and billing.',
      actionHref: '/overview',
      actionLabel: 'View Overview →',
    });
  }

  // ── 3. Margin-per-sit negative for any client ─────────────────────────────
  for (const m of perClient) {
    if (m.marginPerSit != null && m.marginPerSit < 0) {
      alerts.push({
        severity: 'critical',
        title: `${m.client.company} — margin per sit is negative (${fmtMoney2(m.marginPerSit)})`,
        detail:
          'Revenue from this client does not cover their ad spend and overhead share. Consider adjusting the fee or reducing ad spend.',
        entity: m.client.company,
        actionHref: '/overview',
        actionLabel: 'View Overview →',
      });
    }
  }

  // ── 4. Revenue concentration ──────────────────────────────────────────────
  if (
    pf.revenueConcentration != null &&
    pf.revenueConcentration > CONCENTRATION_THRESHOLD
  ) {
    alerts.push({
      severity: 'warning',
      title: `Revenue concentration is high (${fmtPct(pf.revenueConcentration)})`,
      detail:
        'One client accounts for more than 40% of total revenue. Losing them would be a significant hit — consider onboarding another client.',
      actionHref: '/clients',
      actionLabel: 'View Clients →',
    });
  }

  // ── 5. Appointments needing confirmation within 48 h ─────────────────────
  if (needsConfirmingCount > 0) {
    alerts.push({
      severity: 'warning',
      title: `${needsConfirmingCount} appointment${needsConfirmingCount !== 1 ? 's' : ''} need confirming within 48 h`,
      detail:
        'Unconfirmed appointments risk no-shows. Confirm them now to protect the sit rate.',
      actionHref: '/confirmations',
      actionLabel: 'Go to Confirmations →',
    });
  }

  // ── 6. Unallocated shared-campaign spend ──────────────────────────────────
  //    Derived from allocation data loaded separately by the page.
  //    The page passes unallocatedSpend; we skip if it's zero / not provided.
  //    (Handled in the page to avoid importing heavy allocation deps here.)

  // ── 7. Speed-to-lead placeholder ─────────────────────────────────────────
  //    PLACEHOLDER — wire up once webhook timestamps are reliably recorded.
  //    When speed-to-lead data is available, compare pf.speedToLead > threshold
  //    and push a warning. For now this slot is dormant.
  //    TODO: implement when `response_mins` population via webhook is confirmed.

  // Sort: critical first, then warning, then info
  alerts.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return alerts;
}
