// Phase 1 security closeout (Batch 3): MFA design stub (docs/MFA_DESIGN_STUB.md). This only proves
// the reserved column shape exists, defaults to inert, and that login is completely unaffected by it
// — no TOTP flow is implemented here (that is future, Phase 6+, work).
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B3 MFA design stub (real PostgreSQL)', () => {
  let db;
  beforeAll(() => { db = require('../../config/database'); });
  afterAll(async () => { await db.pool.end(); });

  test('users.mfa_enabled defaults false and mfa_secret_encrypted defaults null for a newly created user', async () => {
    const tag = `b3mfa-${Date.now()}@test.invalid`;
    const row = (await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ('b3-mfa', $1, 'x', 'staff') RETURNING mfa_enabled, mfa_secret_encrypted",
      [tag]
    )).rows[0];
    expect(row.mfa_enabled).toBe(false);
    expect(row.mfa_secret_encrypted).toBeNull();
    await db.query('UPDATE users SET is_active = false WHERE email = $1', [tag]); // users are deactivated, never deleted
  });
});
