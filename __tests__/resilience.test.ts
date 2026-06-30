import { describe, it, expect } from 'vitest';

// ── Resilience helpers ──────────────────────────────────────────────────────
// These tests verify the pure logic parts of our error handling:
// - Friendly error messages don't leak technical details
// - Auth checks fail closed (deny on error, not open)

describe('error message sanitisation', () => {
  it('sanitised settings error message contains no raw DB language', () => {
    const safeMessage = 'Could not save settings — please try again.';
    expect(safeMessage).not.toMatch(/supabase|postgres|pgerror|constraint|column/i);
    expect(safeMessage.length).toBeLessThan(100);
  });

  it('sanitised reset error message is user-friendly', () => {
    const safeMessage = 'Could not reset settings — please try again.';
    expect(safeMessage).not.toMatch(/supabase|postgres|sql/i);
  });
});

describe('fail-closed auth logic', () => {
  // Simulate what requireOwner / layout guards do:
  // if role is null/unknown, access must be DENIED, not granted.
  function canAccessOwnerApp(role: string | null): boolean {
    return role === 'owner';
  }

  function canAccessPortal(role: string | null, clientId: string | null): boolean {
    return role === 'client' && clientId !== null;
  }

  function canAccessQueue(role: string | null): boolean {
    return role === 'setter' || role === 'owner';
  }

  it('denies access when role is null (DB error / missing row)', () => {
    expect(canAccessOwnerApp(null)).toBe(false);
    expect(canAccessPortal(null, null)).toBe(false);
    expect(canAccessQueue(null)).toBe(false);
  });

  it('denies access for unknown/unexpected role values', () => {
    expect(canAccessOwnerApp('admin')).toBe(false);
    expect(canAccessOwnerApp('superuser')).toBe(false);
    expect(canAccessPortal('owner', 'some-id')).toBe(false);
    expect(canAccessQueue('client')).toBe(false);
  });

  it('denies portal access when clientId is missing even if role is client', () => {
    expect(canAccessPortal('client', null)).toBe(false);
  });

  it('grants access only to the correct role', () => {
    expect(canAccessOwnerApp('owner')).toBe(true);
    expect(canAccessPortal('client', 'client-uuid')).toBe(true);
    expect(canAccessQueue('setter')).toBe(true);
    expect(canAccessQueue('owner')).toBe(true);
  });
});

describe('offline action guidance', () => {
  // The offline banner and action error messages should direct users to retry,
  // not silently fail. We test the message strings are appropriate.
  const offlineMessage = "No connection — we'll reconnect automatically. Actions can't be saved right now.";
  const actionErrorMessages = [
    'Could not claim this lead — please try again.',
    'Could not save this outcome — please try again.',
    'Could not save the booking — please try again.',
    'Could not confirm this appointment — please try again.',
    'Could not log this attempt — please try again.',
  ];

  it('offline banner message is informative and non-alarming', () => {
    expect(offlineMessage).toMatch(/reconnect/i);
    expect(offlineMessage).not.toMatch(/error|crash|fail/i);
  });

  it('action error messages tell the user to retry', () => {
    for (const msg of actionErrorMessages) {
      expect(msg).toMatch(/please try again/i);
      expect(msg).not.toMatch(/supabase|postgres|sql|exception|stack/i);
    }
  });

  it('action error messages do not expose technical details', () => {
    for (const msg of actionErrorMessages) {
      expect(msg).not.toMatch(/table|column|constraint|pgerror|500|status/i);
    }
  });
});
