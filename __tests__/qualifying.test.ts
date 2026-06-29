import { describe, it, expect } from 'vitest';
import {
  assessQualification,
  bandByKey,
  parseDqRule,
  dqRule,
  BILL_BANDS,
  MIN_MONTHLY_BILL_GBP,
  DQ_RULE_PREFIX,
  DISQUAL_LABELS,
} from '../lib/qualifying';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('qualifying constants', () => {
  it('minimum monthly bill is £80', () => {
    expect(MIN_MONTHLY_BILL_GBP).toBe(80);
  });

  it('BILL_BANDS has four bands', () => {
    expect(BILL_BANDS).toHaveLength(4);
  });

  it('under_80 band has null representative (disqualifying)', () => {
    const band = BILL_BANDS.find((b) => b.key === 'under_80');
    expect(band?.representative).toBeNull();
  });

  it('qualifying bands have numeric representative values', () => {
    const qualifying = BILL_BANDS.filter((b) => b.key !== 'under_80');
    for (const b of qualifying) {
      expect(typeof b.representative).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// assessQualification
// ---------------------------------------------------------------------------

describe('assessQualification', () => {
  it('qualifies a homeowner with a bill ≥ £80', () => {
    const r = assessQualification({ is_homeowner: true, bill_band: '80_120' });
    expect(r.qualified).toBe(true);
  });

  it('qualifies a homeowner on the 120_200 band', () => {
    const r = assessQualification({ is_homeowner: true, bill_band: '120_200' });
    expect(r.qualified).toBe(true);
    if (r.qualified) expect(r.representativeBill).toBe(160);
  });

  it('qualifies a homeowner on 200_plus with representative £250', () => {
    const r = assessQualification({ is_homeowner: true, bill_band: '200_plus' });
    expect(r.qualified).toBe(true);
    if (r.qualified) expect(r.representativeBill).toBe(250);
  });

  it('disqualifies a non-homeowner regardless of bill band', () => {
    const r = assessQualification({ is_homeowner: false, bill_band: '200_plus' });
    expect(r.qualified).toBe(false);
    if (!r.qualified) expect(r.reason).toBe('not_homeowner');
  });

  it('disqualifies a homeowner with under_80 bill band', () => {
    const r = assessQualification({ is_homeowner: true, bill_band: 'under_80' });
    expect(r.qualified).toBe(false);
    if (!r.qualified) expect(r.reason).toBe('bill_under_80');
  });

  it('non-homeowner disqualification takes priority over bill check', () => {
    // Even with a disqualifying bill, reason is not_homeowner (checked first)
    const r = assessQualification({ is_homeowner: false, bill_band: 'under_80' });
    expect(r.qualified).toBe(false);
    if (!r.qualified) expect(r.reason).toBe('not_homeowner');
  });

  it('null bill_band is treated as unknown — still qualifies homeowner', () => {
    const r = assessQualification({ is_homeowner: true, bill_band: null });
    expect(r.qualified).toBe(true);
  });

  it('representativeBill is null for a disqualified lead', () => {
    const r = assessQualification({ is_homeowner: false, bill_band: '200_plus' });
    expect(r.representativeBill).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// bandByKey
// ---------------------------------------------------------------------------

describe('bandByKey', () => {
  it('returns the matching band', () => {
    const band = bandByKey('80_120');
    expect(band?.representative).toBe(100);
  });

  it('returns undefined for null', () => {
    expect(bandByKey(null)).toBeUndefined();
  });

  it('returns undefined for an unknown key', () => {
    expect(bandByKey('not_a_key')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// dqRule and parseDqRule
// ---------------------------------------------------------------------------

describe('dqRule / parseDqRule', () => {
  it('dqRule prefixes the reason correctly', () => {
    expect(dqRule('not_homeowner')).toBe('dq_not_homeowner');
    expect(dqRule('bill_under_80')).toBe('dq_bill_under_80');
  });

  it('parseDqRule recovers the reason from the prefixed string', () => {
    expect(parseDqRule('dq_not_homeowner')).toBe('not_homeowner');
    expect(parseDqRule('dq_bill_under_80')).toBe('bill_under_80');
  });

  it('parseDqRule returns null for a routing rule without the prefix', () => {
    expect(parseDqRule('most_behind')).toBeNull();
    expect(parseDqRule(null)).toBeNull();
    expect(parseDqRule('')).toBeNull();
  });

  it('parseDqRule returns null for an unknown suffix', () => {
    expect(parseDqRule('dq_unknown_reason')).toBeNull();
  });

  it('DISQUAL_LABELS covers both reasons', () => {
    expect(DISQUAL_LABELS.not_homeowner).toBeTruthy();
    expect(DISQUAL_LABELS.bill_under_80).toBeTruthy();
  });
});
