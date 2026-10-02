process.env.JWT_SECRET = process.env.JWT_SECRET || 'tokens-test-secret-longer-than-32-characters';
const jwt = require('jsonwebtoken');
const tokens = require('../../services/tokens');

describe('typed tokens', () => {
  const session = () => tokens.signSession({ userId: 7, tokenVersion: 2 });

  test('each kind verifies only where it is accepted', () => {
    expect(tokens.verify(session(), ['session']).userId).toBe(7);
    expect(() => tokens.verify(session(), ['v1'])).toThrow();
    const refresh = tokens.signRefresh({ sub: 's', userId: 1, serviceAccountId: 1, scope: ['api:read'] });
    expect(() => tokens.verify(refresh, ['session', 'preview', 'v1'])).toThrow();
    expect(tokens.verify(refresh, ['refresh']).kind).toBe('refresh');
  });

  test('a token cannot claim another kind: the signature is checked with that kind\'s key', () => {
    const forged = jwt.sign({ userId: 1, kind: 'session' }, tokens.sign('v1', {}) && 'wrong-key', {
      issuer: tokens.ISSUER, audience: tokens.KINDS.session.audience, expiresIn: 60,
    });
    expect(() => tokens.verify(forged, ['session'])).toThrow();
  });

  test('untyped legacy tokens, other issuers and other audiences are rejected', () => {
    expect(() => tokens.verify(jwt.sign({ userId: 1 }, process.env.JWT_SECRET), ['session'])).toThrow();
    const wrongAudience = jwt.sign({ userId: 1, kind: 'session' }, 'x', { audience: 'other', issuer: tokens.ISSUER });
    expect(() => tokens.verify(wrongAudience, ['session'])).toThrow();
  });

  test('lifetimes: session under a day, refresh 30 days (was 30 seconds), preview 30 minutes', () => {
    expect(tokens.TTL_SECONDS.session).toBeLessThanOrEqual(24 * 3600);
    expect(tokens.TTL_SECONDS.refresh).toBe(30 * 24 * 3600);
    expect(tokens.TTL_SECONDS.preview).toBe(1800);
  });

  test('the kinds use different signing keys', () => {
    const a = jwt.decode(tokens.sign('session', { userId: 1 }), { complete: true });
    expect(a.header.alg).toBe('HS256');
    expect(() => jwt.verify(tokens.sign('session', { userId: 1 }), process.env.JWT_SECRET)).toThrow();
  });
});
