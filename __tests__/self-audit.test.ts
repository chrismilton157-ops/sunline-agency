import { describe, it, expect } from 'vitest';
import {
  computeAudit,
  auditMultiplier,
  buildInstallerAuditRow,
  INSTALLER_SELF_AUDIT_SOURCE,
} from '../lib/self-audit';

// ---------------------------------------------------------------------------
// computeAudit — the cost-per-sale maths
// ---------------------------------------------------------------------------

describe('computeAudit', () => {
  it('computes real cost per sale and apparent cost per appointment', () => {
    // £2,000, 20 appointments, 20% close → 4 sales.
    const r = computeAudit({
      monthlySpend: 2000,
      appointments: 20,
      closeRatePct: 20,
    });
    expect(r.valid).toBe(true);
    expect(r.sales).toBe(4);
    expect(r.costPerAppointment).toBe(100); // 2000 / 20
    expect(r.costPerSale).toBe(500); // 2000 / 4
  });

  it('real cost per sale is always ≥ apparent cost per appointment', () => {
    const r = computeAudit({
      monthlySpend: 5000,
      appointments: 25,
      closeRatePct: 40,
    });
    expect(r.costPerAppointment).toBe(200); // 5000 / 25
    expect(r.costPerSale).toBe(500); // 5000 / 10
    expect(r.costPerSale!).toBeGreaterThanOrEqual(r.costPerAppointment!);
  });

  it('handles a 100% close rate (cost per sale equals cost per appointment)', () => {
    const r = computeAudit({
      monthlySpend: 1000,
      appointments: 10,
      closeRatePct: 100,
    });
    expect(r.valid).toBe(true);
    expect(r.costPerSale).toBe(r.costPerAppointment);
    expect(r.costPerSale).toBe(100);
  });

  // --- Divide-by-zero / guard cases ---------------------------------------

  it('guards against zero appointments (no divide-by-zero)', () => {
    const r = computeAudit({
      monthlySpend: 2000,
      appointments: 0,
      closeRatePct: 20,
    });
    expect(r.valid).toBe(false);
    expect(r.costPerAppointment).toBeNull();
    expect(r.costPerSale).toBeNull();
  });

  it('guards against a zero close rate (sales would be 0)', () => {
    const r = computeAudit({
      monthlySpend: 2000,
      appointments: 20,
      closeRatePct: 0,
    });
    expect(r.valid).toBe(false);
    expect(r.costPerSale).toBeNull();
  });

  it('guards when sales work out below 1 (e.g. 3 appts × 20% = 0.6)', () => {
    const r = computeAudit({
      monthlySpend: 2000,
      appointments: 3,
      closeRatePct: 20,
    });
    expect(r.sales).toBeCloseTo(0.6);
    expect(r.valid).toBe(false);
    expect(r.costPerSale).toBeNull();
    expect(r.costPerAppointment).toBeNull();
  });

  it('guards against zero / missing spend', () => {
    expect(
      computeAudit({ monthlySpend: 0, appointments: 20, closeRatePct: 20 }).valid,
    ).toBe(false);
    expect(
      computeAudit({ monthlySpend: NaN, appointments: 20, closeRatePct: 20 })
        .valid,
    ).toBe(false);
  });

  it('guards against NaN inputs (empty fields)', () => {
    const r = computeAudit({
      monthlySpend: NaN,
      appointments: NaN,
      closeRatePct: NaN,
    });
    expect(r.valid).toBe(false);
    expect(Number.isFinite(r.costPerSale as number)).toBe(false);
    expect(r.costPerSale).toBeNull();
  });

  it('guards against negative and out-of-range inputs', () => {
    expect(
      computeAudit({ monthlySpend: -100, appointments: 10, closeRatePct: 20 })
        .valid,
    ).toBe(false);
    expect(
      computeAudit({ monthlySpend: 1000, appointments: -5, closeRatePct: 20 })
        .valid,
    ).toBe(false);
    expect(
      computeAudit({ monthlySpend: 1000, appointments: 10, closeRatePct: 150 })
        .valid,
    ).toBe(false);
  });

  it('never returns Infinity or NaN for cost figures', () => {
    for (const input of [
      { monthlySpend: 1000, appointments: 0, closeRatePct: 0 },
      { monthlySpend: 0, appointments: 0, closeRatePct: 0 },
      { monthlySpend: 1000, appointments: 1, closeRatePct: 0 },
    ]) {
      const r = computeAudit(input);
      expect(r.costPerSale).toBeNull();
      expect(r.costPerAppointment).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// auditMultiplier — the "Nx higher" badge number
// ---------------------------------------------------------------------------

describe('auditMultiplier', () => {
  it('rounds the real-cost-to-apparent-cost ratio to a whole number', () => {
    // £2,000, 20 appts, 20% close → £100/appt vs £500/sale → 5x.
    const r = computeAudit({
      monthlySpend: 2000,
      appointments: 20,
      closeRatePct: 20,
    });
    expect(auditMultiplier(r)).toBe(5);
  });

  it('hides the badge (null) when the ratio rounds to 1 or less', () => {
    // 100% close → cost per sale equals cost per appointment → 1x, not striking.
    const r = computeAudit({
      monthlySpend: 1000,
      appointments: 10,
      closeRatePct: 100,
    });
    expect(auditMultiplier(r)).toBeNull();
  });

  it('hides the badge (null) for the divide-by-zero guard state', () => {
    const r = computeAudit({
      monthlySpend: 2000,
      appointments: 0,
      closeRatePct: 20,
    });
    expect(auditMultiplier(r)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildInstallerAuditRow — the enquiry row we insert
// ---------------------------------------------------------------------------

describe('buildInstallerAuditRow', () => {
  const base = {
    name: 'Jane Smith',
    company: 'Apex Solar Ltd',
    email: 'jane@apexsolar.co.uk',
    audit: { monthlySpend: 2000, appointments: 20, closeRatePct: 20 },
  };

  it('tags the enquiry as installer_self_audit', () => {
    const row = buildInstallerAuditRow(base);
    expect(row.source).toBe(INSTALLER_SELF_AUDIT_SOURCE);
    expect(row.source).toBe('installer_self_audit');
  });

  it('attaches the three audit numbers and the computed cost per sale', () => {
    const row = buildInstallerAuditRow(base);
    expect(row.audit_monthly_spend).toBe(2000);
    expect(row.audit_appointments).toBe(20);
    expect(row.audit_close_rate).toBe(20);
    expect(row.audit_cost_per_sale).toBe(500); // 2000 / (20 × 0.2)
  });

  it('carries the contact details, trimming and nulling blanks', () => {
    const row = buildInstallerAuditRow({
      ...base,
      name: '  Jane Smith  ',
      phone: '',
      region: '  BA, BS  ',
      preferredCallTime: '   ',
    });
    expect(row.name).toBe('Jane Smith');
    expect(row.phone).toBeNull();
    expect(row.region).toBe('BA, BS');
    expect(row.preferred_call_time).toBeNull();
  });

  it('stores raw audit inputs but null cost-per-sale when it cannot be computed', () => {
    const row = buildInstallerAuditRow({
      ...base,
      audit: { monthlySpend: 2000, appointments: 3, closeRatePct: 20 }, // 0.6 sales
    });
    expect(row.audit_monthly_spend).toBe(2000);
    expect(row.audit_appointments).toBe(3);
    expect(row.audit_close_rate).toBe(20);
    expect(row.audit_cost_per_sale).toBeNull();
  });

  it('nulls audit numbers when fields were left empty (NaN)', () => {
    const row = buildInstallerAuditRow({
      ...base,
      audit: { monthlySpend: NaN, appointments: NaN, closeRatePct: NaN },
    });
    expect(row.audit_monthly_spend).toBeNull();
    expect(row.audit_appointments).toBeNull();
    expect(row.audit_close_rate).toBeNull();
    expect(row.audit_cost_per_sale).toBeNull();
  });

  it('rounds money to 2dp and appointments to a whole number', () => {
    const row = buildInstallerAuditRow({
      ...base,
      audit: { monthlySpend: 1999.999, appointments: 19.6, closeRatePct: 33.333 },
    });
    expect(row.audit_monthly_spend).toBe(2000);
    expect(row.audit_appointments).toBe(20);
    expect(row.audit_close_rate).toBe(33.33);
  });
});
