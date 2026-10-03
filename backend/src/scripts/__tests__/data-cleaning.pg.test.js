// Real PostgreSQL: the data-cleaning report lists the rows that keep a NOT VALID constraint from being
// validated, for any CHECK or foreign key, and never changes data.
const { Pool } = require('pg');
const { findInvalidConstraints, validateConstraint } = require('../../services/dataCleaning');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('data cleaning report (real PostgreSQL)', () => {
  let pool;
  const q = (t, p) => pool.query(t, p);
  beforeAll(() => {
    pool = new Pool({ host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    await q('DROP TABLE IF EXISTS dc_child, dc_parent CASCADE');
    await q('CREATE TABLE dc_parent (id SERIAL PRIMARY KEY, qty NUMERIC)');
    await q('CREATE TABLE dc_child (id SERIAL PRIMARY KEY, parent_id INT, qty NUMERIC)');
    await q('INSERT INTO dc_parent (qty) VALUES (5), (-3), (NULL)');
    await q('INSERT INTO dc_child (parent_id, qty) VALUES (1, 1), (99, 2), (NULL, 3)');
    await q('ALTER TABLE dc_parent ADD CONSTRAINT dc_parent_qty_pos CHECK (qty > 0) NOT VALID');
    await q('ALTER TABLE dc_child ADD CONSTRAINT dc_child_fk FOREIGN KEY (parent_id) REFERENCES dc_parent(id) NOT VALID');
  });
  afterAll(async () => {
    const p = new Pool({ host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
    await p.query('DROP TABLE IF EXISTS dc_child, dc_parent CASCADE'); await p.end();
  });

  const mine = (rows) => rows.filter((r) => r.table === 'dc_parent' || r.table === 'dc_child');

  test('lists offending rows for a NOT VALID check (NULL passes a CHECK) and a NOT VALID foreign key', async () => {
    const found = mine(await findInvalidConstraints(q, { limit: 10 }));
    const check = found.find((r) => r.constraint === 'dc_parent_qty_pos');
    expect(check.type).toBe('check');
    expect(check.offenders).toBe(1);
    expect(check.sample.map((r) => r.qty)).toEqual([-3]);
    const fk = found.find((r) => r.constraint === 'dc_child_fk');
    expect(fk.type).toBe('foreign_key');
    expect(fk.offenders).toBe(1);
    expect(fk.sample[0].parent_id).toBe(99);
  });

  test('is read only', async () => {
    await findInvalidConstraints(q, { limit: 10 });
    expect((await q('SELECT count(*)::int AS n FROM dc_parent')).rows[0].n).toBe(3);
    expect((await q('SELECT count(*)::int AS n FROM dc_child')).rows[0].n).toBe(3);
  });

  test('a clean table is reported with zero offenders and can then be validated; a dirty one refuses', async () => {
    await expect(validateConstraint(q, 'dc_parent', 'dc_parent_qty_pos')).rejects.toThrow(/offending/i);
    await q('DELETE FROM dc_child WHERE parent_id = 99'); // test-only fix; the report itself never does this
    await q('UPDATE dc_parent SET qty = 1 WHERE qty < 0');
    const found = mine(await findInvalidConstraints(q, { limit: 10 }));
    expect(found.every((r) => r.offenders === 0)).toBe(true);
    await validateConstraint(q, 'dc_parent', 'dc_parent_qty_pos');
    expect(mine(await findInvalidConstraints(q, {})).find((r) => r.constraint === 'dc_parent_qty_pos')).toBeUndefined();
  });

  test('the migrations 0007/0008 constraints are either validated or reported with their rows', async () => {
    const all = await findInvalidConstraints(q, { limit: 5 });
    const ours = all.filter((r) => ['warehouse_stock_nonnegative', 'purchase_order_lines_quantities_ok'].includes(r.constraint));
    // on a clean database both are validated and absent; if present they must carry a count
    for (const r of ours) expect(typeof r.offenders).toBe('number');
  });
});
