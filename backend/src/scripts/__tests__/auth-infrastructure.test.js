process.env.JWT_SECRET = process.env.JWT_SECRET || 'r05-fixture-only-secret-longer-than-32';
jest.mock('../../config/database', () => ({ query: jest.fn() }));
const { query } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const tokens = require('../../services/tokens');

function response() {
  return { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; }, json(body) { this.body = body; return this; } };
}

describe('R0.5 infrastructure failures preserve session semantics', () => {
  beforeEach(() => jest.resetAllMocks());
  test.each(['database unavailable', 'timeout exceeded when trying to connect', 'Connection terminated unexpectedly'])('%s returns typed retryable 503', async message => {
    query.mockRejectedValue(new Error(message));
    const res = response(); const next = jest.fn();
    await authenticate({ headers: { authorization: `Bearer ${tokens.signSession({ userId: 1 })}` } }, res, next);
    expect(res.statusCode).toBe(503);
    expect(res.headers['Retry-After']).toBe('5');
    expect(res.body).toMatchObject({ success: false, error_code: 'authentication_unavailable', error_params: {} });
    expect(JSON.stringify(res.body)).not.toContain(message);
    expect(next).not.toHaveBeenCalled();
  });

  test.each(['malformed', 'expired'])('%s JWT remains a 401 without querying the pool', async kind => {
    const raw = kind === 'expired' ? tokens.signSession({ userId: 1 }, -1) : 'bad-token';
    const res = response();
    await authenticate({ headers: { authorization: `Bearer ${raw}` } }, res, jest.fn());
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
