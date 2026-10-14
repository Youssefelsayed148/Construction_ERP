process.env.JWT_SECRET = process.env.JWT_SECRET || 'r03-fixture-only-secret-longer-than-32';
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../../config/database', () => ({ query: jest.fn(), pool: { query: jest.fn(), on: jest.fn() }, healthCheck: jest.fn() }));

describe('R0.3 unknown API routes', () => {
  let server; let base;
  beforeAll(async () => {
    const { app } = require('../../../server');
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

  test.each(['GET', 'POST', 'DELETE'])('%s unknown /api route has a typed JSON 404', async method => {
    const result = await fetch(`${base}/api/r03-does-not-exist`, { method });
    expect(result.status).toBe(404);
    expect(result.headers.get('content-type')).toContain('application/json');
    expect(await result.json()).toMatchObject({ success: false, error_code: 'api_route_not_found', error_params: {} });
  });
});
