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

  const violationCount = async (client, fragment) => Number(
    (await client.query(check(fragment).sql)).rows[0].violations
  );

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
      const before = await violationCount(client, 'payment allocations do not exceed');
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
      return (await violationCount(client, 'payment allocations do not exceed')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports a client payment allocation crossing project scope', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'client payment allocations stay within one project');
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
      return (await violationCount(client, 'client payment allocations stay within one project')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports client allocations above an invoice balance', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'client invoice allocations do not exceed');
      const projectId = await createProject(client, 'INV-BAL');
      const clientId = await createClient(client);
      const invoiceId = (await client.query(
        `INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date)
         VALUES ($1, $2, $3, 50, CURRENT_DATE) RETURNING id`,
        [`RD-INV-B-${tag}-${sequence}`, projectId, clientId]
      )).rows[0].id;
      const paymentId = (await client.query(
        `INSERT INTO payments (project_id, client_id, amount, payment_date)
         VALUES ($1, $2, 100, CURRENT_DATE) RETURNING id`, [projectId, clientId]
      )).rows[0].id;
      await client.query(
        `INSERT INTO payment_allocations (payment_id, target_type, invoice_id, amount)
         VALUES ($1, 'client_invoice', $2, 75)`, [paymentId, invoiceId]
      );
      return (await violationCount(client, 'client invoice allocations do not exceed')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports retention releases above the amount held', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'retention releases do not exceed held balances');
      const projectId = await createProject(client, 'RET');
      await client.query(
        `INSERT INTO retention_ledger (project_id, party_type, direction, amount)
         VALUES ($1, 'client', 'held', 20), ($1, 'client', 'released', 30)`, [projectId]
      );
      return (await violationCount(client, 'retention releases do not exceed held balances')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports advance restorations above prior recoveries', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'advance recovery ledger remains nonnegative');
      const projectId = await createProject(client, 'ADV');
      await client.query(
        `INSERT INTO advance_ledger (project_id, party_type, direction, amount)
         VALUES ($1, 'client', 'recovered', 20), ($1, 'client', 'restored', 30)`, [projectId]
      );
      return (await violationCount(client, 'advance recovery ledger remains nonnegative')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports warehouse stock that does not match its movement ledger', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'stock ledger reconciles with the warehouse_stock projection');
      const projectId = await createProject(client, 'STOCK');
      const material = (await client.query('SELECT id FROM item_master WHERE code = $1', ['RM-CONC-C35'])).rows[0];
      if (!material) throw new Error('C35 fixture material is missing');
      const warehouseId = (await client.query(
        `INSERT INTO warehouses (name, name_en, type, project_id)
         VALUES ($1, $1, 'site', $2) RETURNING id`, [`RD-WH-${tag}-${sequence}`, projectId]
      )).rows[0].id;
      await client.query(
        `INSERT INTO stock_movements (warehouse_id, material_id, movement_type, quantity)
         VALUES ($1, $2, 'opening', 9)`, [warehouseId, material.id]
      );
      return (await violationCount(client, 'stock ledger reconciles with the warehouse_stock projection')) - before;
    });
    expect(violations).toBe(1);
  });
});
