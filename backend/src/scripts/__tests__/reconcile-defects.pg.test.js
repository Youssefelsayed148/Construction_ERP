'use strict';

const { CHECKS } = require('../reconcile-database');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('reconciliation seeded defects (real PostgreSQL)', () => {
  let db;
  const tag = String(Date.now()).slice(-8);
  let sequence = 0;

  beforeAll(() => { db = require('../../config/database'); });
  afterAll(async () => { if (db?.pool) await db.pool.end(); });

  const check = (fragment) => {
    const found = CHECKS.find((item) => item.name.includes(fragment));
    if (!found || !found.sql) throw new Error(`SQL reconciliation check not found: ${fragment}`);
    return found;
  };

  const withTransaction = async (run) => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      return await run(client);
    } finally {
      try { await client.query('ROLLBACK'); } finally { client.release(); }
    }
  };

  const createProject = async (client, suffix) => (await client.query(
    `INSERT INTO projects (name, name_en, code, status, budget, contract_value)
     VALUES ($1, $1, $2, 'active', 1000, 1000) RETURNING id`,
    [`reconcile-${tag}-${suffix}`, `RD${tag}${suffix}${++sequence}`.slice(0, 50)]
  )).rows[0].id;

  const createClient = async (client) => (await client.query(
    `INSERT INTO clients (code, name_ar, name_en, client_type)
     VALUES ($1, $1, $1, 'reconciliation-test') RETURNING id`,
    [`RD-CLIENT-${tag}-${++sequence}`.slice(0, 50)]
  )).rows[0].id;

  test('reports a payment whose seeded allocations exceed its amount', async () => {
    const violations = await withTransaction(async (client) => {
      const projectId = await createProject(client, 'PAY');
      const clientId = await createClient(client);
      const invoiceId = (await client.query(
        `INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date)
         VALUES ($1, $2, $3, 100, CURRENT_DATE) RETURNING id`,
        [`RD-INV-P-${tag}-${sequence}`, projectId, clientId]
      )).rows[0].id;
      const paymentId = (await client.query(
        `INSERT INTO payments (project_id, client_id, amount, payment_date)
         VALUES ($1, $2, 50, CURRENT_DATE) RETURNING id`, [projectId, clientId]
      )).rows[0].id;
      await client.query(
        `INSERT INTO payment_allocations (payment_id, target_type, invoice_id, amount)
         VALUES ($1, 'client_invoice', $2, 75)`, [paymentId, invoiceId]
      );
      return Number((await client.query(check('payment allocations do not exceed').sql)).rows[0].violations);
    });
    expect(violations).toBe(1);
  });

  test('reports a client payment allocation crossing project scope', async () => {
    const violations = await withTransaction(async (client) => {
      const paymentProjectId = await createProject(client, 'PAY-SCOPE');
      const invoiceProjectId = await createProject(client, 'INV-SCOPE');
      const clientId = await createClient(client);
      const invoiceId = (await client.query(
        `INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date)
         VALUES ($1, $2, $3, 100, CURRENT_DATE) RETURNING id`,
        [`RD-INV-S-${tag}-${sequence}`, invoiceProjectId, clientId]
      )).rows[0].id;
      const paymentId = (await client.query(
        `INSERT INTO payments (project_id, client_id, amount, payment_date)
         VALUES ($1, $2, 50, CURRENT_DATE) RETURNING id`, [paymentProjectId, clientId]
      )).rows[0].id;
      await client.query(
        `INSERT INTO payment_allocations (payment_id, target_type, invoice_id, amount)
         VALUES ($1, 'client_invoice', $2, 25)`, [paymentId, invoiceId]
      );
      return Number((await client.query(check('client payment allocations stay within one project').sql)).rows[0].violations);
    });
    expect(violations).toBe(1);
  });
});
