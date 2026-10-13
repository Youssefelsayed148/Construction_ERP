'use strict';

const authLockout = require('../../services/authLockout');

describe('login lockout policy', () => {
  test('locks only while the configured lock window is active', () => {
    const now = Date.parse('2026-10-13T12:00:00Z');
    expect(authLockout.isLocked({ locked_until: new Date(now + 1000) }, now)).toBe(true);
    expect(authLockout.isLocked({ locked_until: new Date(now - 1000) }, now)).toBe(false);
    expect(authLockout.isLocked(null, now)).toBe(false);
  });

  test('records failures atomically and clears the account state after successful login', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [] });
    await authLockout.recordFailure(q, 'user@example.com');
    expect(q.mock.calls[0][0]).toContain('ON CONFLICT (email_key) DO UPDATE');
    expect(q.mock.calls[0][1]).toEqual(['user@example.com', 5, 15]);
    await authLockout.clearAttempt(q, 'user@example.com');
    expect(q.mock.calls[1]).toEqual(['DELETE FROM auth_login_attempts WHERE email_key = $1', ['user@example.com']]);
  });
});
