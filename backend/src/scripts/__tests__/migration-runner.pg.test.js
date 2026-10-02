// Real PostgreSQL: schema_migrations, transactional migrations, checksums, sequences, backfill.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Pool } = require('pg');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;
const { runMigrations, MIGRATIONS } = require('../run-all-migrations');
const support = require('../migration-support');

const dbModule = path.join(__dirname, '..', '..', 'config', 'database').replace(/\\/g, '/');

describePg('migration runner (real PostgreSQL)', () => {
  let pool;
  let tmp;
  let table;
  const quiet = () => {};

  const fixture = (name, body) => {
    fs.writeFileSync(path.join(tmp, name), body);
    return name;
  };
  const legacyScript = (statements, { fail = false } = {}) => `
    const { query } = require('${dbModule}');
    (async () => {
      ${statements.map((s) => `await query(${JSON.stringify(s)});`).join('\n')}
      ${fail ? "throw new Error('boom');" : ''}
      process.exit(0);
    })().catch((e) => { console.error(e.message); process.exit(1); });
  `;
  const run = (legacy) =>
    runMigrations({ legacy, scriptsDir: tmp, versionedDir: path.join(tmp, 'v'), table, log: quiet });

  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    });
  });
  afterAll(async () => { await pool.end(); });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    fs.mkdirSync(path.join(tmp, 'v'));
    table = `test_sm_${Math.random().toString(36).slice(2, 8)}`;
  });
  afterEach(async () => {
    await pool.query(`DROP TABLE IF EXISTS "${table}"`);
    await pool.query('DROP TABLE IF EXISTS mig_t1, mig_t2, mig_seq_t');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('the real migration set is recorded in schema_migrations with checksums', async () => {
    const { rows } = await pool.query(`SELECT version, kind, checksum FROM ${support.DEFAULT_TABLE}`);
    const byVersion = new Map(rows.map((r) => [r.version, r]));
    for (const m of new Set(MIGRATIONS)) {
      expect(byVersion.get(m)).toBeDefined();
      expect(byVersion.get(m).kind).toBe('legacy');
      expect(byVersion.get(m).checksum).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(byVersion.get('0001_backfill_project_scope.sql').kind).toBe('versioned');
  });

  test('a migration that fails rolls back everything it did and later ones do not run', async () => {
    const ok = fixture('a.js', legacyScript(['CREATE TABLE mig_t1 (id SERIAL PRIMARY KEY)']));
    const bad = fixture('b.js', legacyScript(['CREATE TABLE mig_t2 (id SERIAL PRIMARY KEY)', 'INSERT INTO mig_t2 (id) VALUES (1)'], { fail: true }));
    const never = fixture('c.js', legacyScript(['CREATE TABLE mig_seq_t (id SERIAL PRIMARY KEY)']));

    await expect(run([ok, bad, never])).rejects.toThrow(/b\.js failed/);

    const tables = (await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('mig_t1','mig_t2','mig_seq_t')"
    )).rows.map((r) => r.table_name);
    expect(tables).toEqual(['mig_t1']);
    const recorded = (await pool.query(`SELECT version FROM "${table}"`)).rows.map((r) => r.version);
    expect(recorded).toEqual(['a.js']);
  });

  test('an unhandled statement error aborts the migration instead of being swallowed', async () => {
    const bad = fixture('bad.js', legacyScript(['CREATE TABLE mig_t1 (id SERIAL PRIMARY KEY)', 'ALTER TABLE does_not_exist ADD COLUMN x INT']));
    await expect(run([bad])).rejects.toThrow(/bad\.js failed/);
    const t = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'mig_t1'");
    expect(t.rows).toHaveLength(0);
  });

  test('applied migrations are skipped on the next run', async () => {
    const a = fixture('a.js', legacyScript(['CREATE TABLE mig_t1 (id SERIAL PRIMARY KEY)']));
    expect((await run([a])).applied).toEqual(['a.js']);
    const second = await run([a]);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['a.js']);
  });

  test('versioned sql runs once, in order, and a modified applied file is fatal', async () => {
    fs.writeFileSync(path.join(tmp, 'v', '0001_first.sql'), 'CREATE TABLE mig_t1 (id SERIAL PRIMARY KEY);');
    fs.writeFileSync(path.join(tmp, 'v', '0002_second.sql'), 'ALTER TABLE mig_t1 ADD COLUMN name TEXT;');
    expect((await run([])).applied).toEqual(['0001_first.sql', '0002_second.sql']);
    expect((await run([])).applied).toEqual([]);

    fs.writeFileSync(path.join(tmp, 'v', '0001_first.sql'), 'CREATE TABLE mig_t1 (id SERIAL PRIMARY KEY, extra INT);');
    await expect(run([])).rejects.toThrow(/modified after it was applied/);
  });

  test('a failing versioned sql file rolls back all of its statements', async () => {
    fs.writeFileSync(path.join(tmp, 'v', '0001_bad.sql'), 'CREATE TABLE mig_t1 (id INT); SELECT 1/0;');
    await expect(run([])).rejects.toThrow(/0001_bad\.sql failed/);
    const t = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'mig_t1'");
    expect(t.rows).toHaveLength(0);
  });

  test('sequences are moved past rows that were inserted with explicit ids', async () => {
    await pool.query('CREATE TABLE mig_seq_t (id SERIAL PRIMARY KEY, v TEXT)');
    await pool.query("INSERT INTO mig_seq_t (id, v) VALUES (1,'a'),(2,'b'),(7,'c')");
    await expect(pool.query("INSERT INTO mig_seq_t (v) VALUES ('collides')")).rejects.toThrow(/duplicate key/);

    await support.fixAllSequences((t, p) => pool.query(t, p));

    const r = await pool.query("INSERT INTO mig_seq_t (v) VALUES ('ok') RETURNING id");
    expect(r.rows[0].id).toBe(8);
  });

  test('legacy HSE conversion leaves usable sequences', async () => {
    const hse = require('../hse-migration');
    const c = await pool.connect();
    const q = (t, p) => c.query(t, p);
    try {
      await c.query('BEGIN');
      await c.query('DROP VIEW IF EXISTS safety_incidents');
      await c.query('DROP TABLE IF EXISTS safety_incidents');
      await c.query(`CREATE TABLE safety_incidents (id SERIAL PRIMARY KEY, project_id INTEGER, incident_date DATE, incident_type VARCHAR(100), severity VARCHAR(50), description TEXT, injured_party VARCHAR(255), reported_by INTEGER, corrective_action TEXT, status VARCHAR(50), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
      await c.query("INSERT INTO safety_incidents (id, incident_type, description) VALUES (1,'fall','x'),(2,'cut','y'),(3,'burn','z')");
      await c.query('DELETE FROM incidents');
      await c.query('ALTER SEQUENCE incidents_id_seq RESTART WITH 1');
      await hse.convertLegacy(q);
      const next = await c.query("INSERT INTO incidents (incident_type, description) VALUES ('after','new') RETURNING id");
      expect(Number(next.rows[0].id)).toBeGreaterThan(3);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  test('0001 backfill derives project_id for reminders and agent requests', async () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '0001_backfill_project_scope.sql'), 'utf8');
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const user = (await c.query("INSERT INTO users (name, email, password, role) VALUES ('bf', $1, 'x', 'admin') RETURNING id", [`bf-${Date.now()}@t.io`])).rows[0].id;
      const proj = (await c.query("INSERT INTO projects (code, name) VALUES ('BF-' || floor(random()*1e9)::text, 'BF') RETURNING id")).rows[0].id;
      const asset = (await c.query("INSERT INTO assets (name, current_project_id) VALUES ('crane', $1) RETURNING id", [proj])).rows[0].id;
      const rem = (await c.query("INSERT INTO maintenance_reminders (asset_id, title) VALUES ($1,'svc') RETURNING id", [asset])).rows[0].id;
      const req = (await c.query("INSERT INTO agent_action_requests (tool, operation, payload, requesting_user_id) VALUES ('t','{}', $1, $2) RETURNING id", [JSON.stringify({ project_id: proj }), user])).rows[0].id;
      const bogus = (await c.query(`INSERT INTO agent_action_requests (tool, operation, payload, requesting_user_id) VALUES ('t','{}', '{"project_id": 999999999}', $1) RETURNING id`, [user])).rows[0].id;

      await c.query(sql);

      expect((await c.query('SELECT project_id FROM maintenance_reminders WHERE id=$1', [rem])).rows[0].project_id).toBe(proj);
      expect((await c.query('SELECT project_id FROM agent_action_requests WHERE id=$1', [req])).rows[0].project_id).toBe(proj);
      expect((await c.query('SELECT project_id FROM agent_action_requests WHERE id=$1', [bogus])).rows[0].project_id).toBeNull();
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });
});
