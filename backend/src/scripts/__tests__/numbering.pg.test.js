// Real PostgreSQL: document numbering is unique under concurrency and never reuses a number.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { nextNumber } = require('../../services/numbering');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('numbering service (real PostgreSQL)', () => {
  let pool;
  const spec = { table: 'num_docs', column: 'doc_number', prefix: 'DOC', pad: 5 };

  // Creates one document the way a route does: number + insert in one transaction.
  const createDoc = async (extra = {}) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const number = await nextNumber((t, p) => client.query(t, p), { ...spec, ...extra });
      await client.query('INSERT INTO num_docs (doc_number, project_id) VALUES ($1, $2)', [number, extra.where?.project_id ?? 0]);
      await client.query('COMMIT');
      return number;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  };

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1', port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, max: 30,
    });
  });
  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    await pool.query('DROP TABLE IF EXISTS num_docs');
    await pool.query('CREATE TABLE num_docs (id SERIAL PRIMARY KEY, doc_number TEXT NOT NULL, project_id INT NOT NULL DEFAULT 0, UNIQUE (doc_number, project_id))');
    await pool.query("DELETE FROM document_counters WHERE scope_key LIKE 'num_docs.%'");
  });
  afterEach(async () => {
    await pool.query('DROP TABLE IF EXISTS num_docs');
    await pool.query("DELETE FROM document_counters WHERE scope_key LIKE 'num_docs.%'");
  });

  test('50 concurrent creates produce 50 distinct numbers and no unique-violation', async () => {
    const numbers = await Promise.all(Array.from({ length: 50 }, () => createDoc()));
    expect(new Set(numbers).size).toBe(50);
    expect([...numbers].sort()[0]).toBe('DOC-00001');
    expect([...numbers].sort()[49]).toBe('DOC-00050');
  });

  test('the first use is seeded from rows that already exist', async () => {
    await pool.query("INSERT INTO num_docs (doc_number) VALUES ('DOC-00007'), ('DOC-00003'), ('OTHER-00099')");
    expect(await createDoc()).toBe('DOC-00008');
  });

  test('deleting the newest document never hands its number out again', async () => {
    await createDoc(); await createDoc(); await createDoc();
    await pool.query("DELETE FROM num_docs WHERE doc_number = 'DOC-00003'");
    expect(await createDoc()).toBe('DOC-00004');
  });

  test('a rolled-back transaction gives its number back; no duplicates result', async () => {
    const client = await pool.connect();
    await client.query('BEGIN');
    expect(await nextNumber((t, p) => client.query(t, p), spec)).toBe('DOC-00001');
    await client.query('ROLLBACK');
    client.release();
    expect(await createDoc()).toBe('DOC-00001');
  });

  test('counters are independent per prefix and per filter', async () => {
    expect(await createDoc({ prefix: 'NCR-2026' })).toBe('NCR-2026-00001');
    expect(await createDoc({ prefix: 'NCR-2027' })).toBe('NCR-2027-00001');
    expect(await createDoc({ prefix: 'NCR-2026' })).toBe('NCR-2026-00002');
    expect(await createDoc({ where: { project_id: 1 } })).toBe('DOC-00001');
    expect(await createDoc({ where: { project_id: 2 } })).toBe('DOC-00001');
    expect(await createDoc({ where: { project_id: 1 } })).toBe('DOC-00002');
  });

  test('concurrent first use of a seeded scope does not collide', async () => {
    await pool.query("INSERT INTO num_docs (doc_number) VALUES ('DOC-00010')");
    const numbers = await Promise.all(Array.from({ length: 20 }, () => createDoc()));
    expect(new Set(numbers).size).toBe(20);
    expect([...numbers].sort()[0]).toBe('DOC-00011');
  });

  test('every call site names a table and column that exist in the migrated schema', async () => {
    const srcDir = path.join(__dirname, '..', '..');
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walk(full); } else if (e.name.endsWith('.js')) files.push(full);
    });
    walk(srcDir);
    const pairs = new Set();
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/table: '(\w+)', column: '(\w+)'/g)) pairs.add(`${m[1]}.${m[2]}`);
      for (const m of text.matchAll(/nextNumber\(q, '(\w+)', '(\w+)', '\w+'\)/g)) pairs.add(`${m[1]}.${m[2]}`);
    }
    expect(pairs.size).toBeGreaterThan(30);
    const missing = [];
    for (const pair of pairs) {
      const [table, column] = pair.split('.');
      const r = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2", [table, column]
      );
      if (!r.rows.length) missing.push(pair);
    }
    expect(missing).toEqual([]);
  });

  test('50 concurrent invoices through the single creation path get unique numbers, even after a delete', async () => {
    const { createInvoiceRecord } = require('../../services/financeEngine');
    const tag = `NUM${Date.now()}`;
    const project = (await pool.query("INSERT INTO projects (code, name) VALUES ($1, 'Numbering') RETURNING id", [tag])).rows[0].id;
    const client = (await pool.query("INSERT INTO clients (code, name_ar) VALUES ($1, 'Numbering Client') RETURNING id", [tag])).rows[0].id;
    const make = () => createInvoiceRecord((t, p) => pool.query(t, p), {
      project_id: project, client_id: client, amount: 100, issue_date: '2026-01-01', status: 'sent',
    });
    try {
      const created = await Promise.all(Array.from({ length: 50 }, make));
      const numbers = created.map((i) => i.invoice_number);
      expect(new Set(numbers).size).toBe(50);

      const newest = created.map((i) => i.invoice_number).sort().pop();
      await pool.query('DELETE FROM invoices WHERE invoice_number = $1', [newest]);
      const next = await make();
      expect(next.invoice_number).not.toBe(newest);
      expect(numbers).not.toContain(next.invoice_number);
    } finally {
      await pool.query('DELETE FROM invoices WHERE project_id = $1', [project]);
      await pool.query('DELETE FROM clients WHERE id = $1', [client]);
      await pool.query('DELETE FROM projects WHERE id = $1', [project]);
    }
  });
});
