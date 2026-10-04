// Real PostgreSQL. 5.1b - the legacy role switch dry run is read-only and says, per seat, what changes.
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('legacy role dry run (real PostgreSQL)', () => {
  let db; let svc;
  const tag = String(Date.now()).slice(-8);
  const users = {};
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];

  const seat = async (key, legacyRole, projectId = null) => {
    const u = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id",
      [`dry-${key}`, `dry-${key}-${tag}@test.io`, legacyRole]);
    await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [u.id, projectId, legacyRole]);
    users[key] = u.id;
  };

  beforeAll(async () => {
    db = require('../../config/database');
    svc = require('../../services/legacyRoleDryRun');
    await seat('owner', 'owner');
    await seat('staff', 'staff');
    await seat('engineer', 'engineer');
    await seat('finance', 'finance_manager');
  });

  afterAll(async () => {
    const ids = Object.values(users);
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [ids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [ids]);
    await db.pool.end();
  });

  const run = async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN READ ONLY');          // any write the report attempted would throw here
      const report = await svc.buildReport((sql, params) => client.query(sql, params));
      await client.query('COMMIT');
      return report;
    } finally { client.release(); }
  };

  test('read-only: it runs inside a READ ONLY transaction and the tables are unchanged', async () => {
    const counts = async () => (await one(
      `SELECT (SELECT count(*) FROM users)::int u, (SELECT count(*) FROM user_project_roles)::int upr,
              (SELECT count(*) FROM roles)::int r, (SELECT count(*) FROM role_permissions)::int rp`));
    const before = await counts();
    await run();
    expect(await counts()).toEqual(before);
  });

  test('per seat: old role, new role, blanket flag, gained and lost permissions', async () => {
    const report = await run();
    const mine = (key) => report.seats.filter((s) => s.user_id === users[key]);
    expect(report.unmapped_legacy_roles).toEqual([]);
    expect(report.catalog_pairs).toBeGreaterThan(100);

    const [owner] = mine('owner');
    expect(owner).toMatchObject({ old_role: 'owner', new_role: 'owner_ceo', had_blanket_grant: true });
    expect(owner.permissions_before).toBe(report.catalog_pairs);       // the blanket expands to the whole catalog
    expect(owner.permissions_after).toBeLessThan(owner.permissions_before);
    expect(owner.gained).toEqual([]);                                    // nothing a blanket role lacks
    expect(owner.lost.length).toBe(owner.permissions_before - owner.permissions_after);

    const [staff] = mine('staff');
    expect(staff).toMatchObject({ old_role: 'staff', new_role: 'site_engineer', had_blanket_grant: true });
    expect(staff.lost.length).toBeGreaterThan(0);

    const [finance] = mine('finance');                                   // identity mapping: no change at all
    expect(finance).toMatchObject({ old_role: 'finance_manager', new_role: 'finance_manager' });
    expect(finance.gained).toEqual([]);
    expect(finance.lost).toEqual([]);

    const row = report.summary.find((s) => s.mapping === 'staff -> site_engineer');
    expect(row.seats).toBeGreaterThanOrEqual(1);
    expect(row.had_blanket_grant).toBe(true);
  });

  test('role level: every alias mapping shows before/after and what it loses, by module', async () => {
    const report = await run();
    const m = report.mappings.find((x) => x.old_role === 'owner');
    expect(m).toMatchObject({ new_role: 'owner_ceo', had_blanket_grant: true, gained_count: 0 });
    expect(m.lost_count).toBe(m.permissions_before - m.permissions_after);
    expect(Object.values(m.lost_by_module).reduce((a, b) => a + b, 0)).toBe(m.lost_count);
    expect(report.mappings.find((x) => x.old_role === 'finance_manager')).toMatchObject({ lost_count: 0, gained_count: 0 });
  });

  test('the CSV has one line per seat with the lost permissions', async () => {
    const report = await run();
    const lines = svc.toCsv(report).split('\n');
    expect(lines[0]).toMatch(/^seat_id,user_id,name,email/);
    expect(lines.length).toBe(report.seats.length + 1);
    expect(lines.find((l) => l.includes(`dry-owner-${tag}@test.io`))).toMatch(/owner,owner_ceo,true/);
  });

  test('expandGrants: wildcards expand against the catalog, nothing outside it appears', () => {
    const catalog = ['a|view', 'a|edit', 'b|view'];
    expect([...svc.expandGrants([{ module: '*', action: '*' }], catalog)].sort()).toEqual(['a|edit', 'a|view', 'b|view']);
    expect([...svc.expandGrants([{ module: 'a', action: '*' }], catalog)].sort()).toEqual(['a|edit', 'a|view']);
    expect([...svc.expandGrants([{ module: '*', action: 'view' }], catalog)].sort()).toEqual(['a|view', 'b|view']);
    expect([...svc.expandGrants([{ module: 'z', action: 'view' }], catalog)]).toEqual([]);
  });
});
