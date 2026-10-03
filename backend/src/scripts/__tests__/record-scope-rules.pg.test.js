// Real PostgreSQL: every record scope rule must be runnable SQL. A rule that names a column the table does not
// have makes policy evaluation throw, and the route then fails closed for everyone ("Policy evaluation failed").
// Reproduced: the `deliveries` and `goods_receipt_notes` rules selected project_id from tables without one, so
// POST /deliveries/:id/mir and POST /grn/:id/returns could not be used at all.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'rules-test-secret-xxxxxxxxxxxxxxxxxx';
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('record scope rules run against the real schema', () => {
  let db; let policy;
  beforeAll(() => { db = require('../../config/database'); policy = require('../../services/policy'); });
  afterAll(async () => { await db.pool.end(); });

  test('every rule resolves without a SQL error', async () => {
    const failures = [];
    for (const [module, rules] of Object.entries(policy.RECORD_SCOPE_RULES)) {
      for (const [pattern, source] of rules) {
        const sql = /^SELECT\s/i.test(source) ? source : `SELECT project_id FROM ${source} WHERE id = $1`;
        try { await db.query(sql, [0]); } catch (e) { failures.push(`${module} ${pattern}: ${e.message}`); }
      }
    }
    expect(failures).toEqual([]);
  });
});
