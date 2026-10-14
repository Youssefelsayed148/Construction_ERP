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

  test('reports supplier payment allocations crossing project scope', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'supplier payment allocations stay within one project');
      const paymentProjectId = await createProject(client, 'SUP-PAY');
      const invoiceProjectId = await createProject(client, 'SUP-INV');
      const supplierId = (await client.query(
        `INSERT INTO suppliers (code, name_en, name_ar)
         VALUES ($1, $1, $1) RETURNING id`, [`RD-SUP-${tag}-${sequence}`]
      )).rows[0].id;
      const material = (await client.query('SELECT id FROM item_master WHERE code = $1', ['RM-CONC-C35'])).rows[0];
      const poId = (await client.query(
        `INSERT INTO purchase_orders (order_number, supplier_id, project_id, material_id, quantity)
         VALUES ($1, $2, $3, $4, 1) RETURNING id`,
        [`RD-PO-${tag}-${sequence}`, supplierId, invoiceProjectId, material.id]
      )).rows[0].id;
      const invoiceId = (await client.query(
        `INSERT INTO supplier_invoices (invoice_number, supplier_id, purchase_order_id, total_amount)
         VALUES ($1, $2, $3, 100) RETURNING id`, [`RD-SI-${tag}-${sequence}`, supplierId, poId]
      )).rows[0].id;
      const paymentId = (await client.query(
        `INSERT INTO payments (project_id, amount, payment_date, direction)
         VALUES ($1, 50, CURRENT_DATE, 'ap') RETURNING id`, [paymentProjectId]
      )).rows[0].id;
      await client.query(
        `INSERT INTO payment_allocations (payment_id, target_type, supplier_invoice_id, amount)
         VALUES ($1, 'supplier_invoice', $2, 25)`, [paymentId, invoiceId]
      );
      return (await violationCount(client, 'supplier payment allocations stay within one project')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports inventory transfers between project warehouses', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'project warehouse transfers do not cross projects');
      const sourceProjectId = await createProject(client, 'WH-SRC');
      const targetProjectId = await createProject(client, 'WH-DST');
      const sourceId = (await client.query(
        `INSERT INTO warehouses (name, type, project_id) VALUES ($1, 'site', $2) RETURNING id`,
        [`RD-SRC-${tag}-${sequence}`, sourceProjectId]
      )).rows[0].id;
      const targetId = (await client.query(
        `INSERT INTO warehouses (name, type, project_id) VALUES ($1, 'site', $2) RETURNING id`,
        [`RD-DST-${tag}-${sequence}`, targetProjectId]
      )).rows[0].id;
      await client.query(
        `INSERT INTO inventory_transfers (from_warehouse_id, to_warehouse_id, status)
         VALUES ($1, $2, 'draft')`, [sourceId, targetId]
      );
      return (await violationCount(client, 'project warehouse transfers do not cross projects')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports an active workflow with no pending step', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'active workflows have a current pending step');
      await client.query(
        `INSERT INTO workflow_instances (template_key, entity_type, entity_id, status)
         VALUES ('reconcile-test', 'reconcile-test', $1, 'active')`, [Number(tag) + ++sequence]
      );
      return (await violationCount(client, 'active workflows have a current pending step')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports project costs without their source document or ledger entry', async () => {
    const result = await withTransaction(async (client) => {
      const beforeLedger = await violationCount(client, 'project cost rows reconcile with their ledger entries');
      const beforeSource = await violationCount(client, 'project cost rows retain their source documents');
      const projectId = await createProject(client, 'COST');
      const sourceId = 2000000000 + Number(tag);
      await client.query(
        `INSERT INTO project_costs (project_id, source_type, source_id, amount)
         VALUES ($1, 'expense', $2, 10)`, [projectId, sourceId]
      );
      const ledger = (await violationCount(client, 'project cost rows reconcile with their ledger entries')) - beforeLedger;
      const source = (await violationCount(client, 'project cost rows retain their source documents')) - beforeSource;
      return { ledger, source };
    });
    expect(result).toEqual({ ledger: 1, source: 1 });
  });

  test('reports money-movement journal entries with no live payment document', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'AP and AR money moves stay tied to live documents');
      await client.query(
        `INSERT INTO journal_entries (entry_number, date, reference_type, reference_id, total_amount)
         VALUES ($1, CURRENT_DATE, 'client_payment', $2, 0)`,
        [`RD-JE-${tag}-${sequence}`, 2000000000 + Number(tag)]
      );
      return (await violationCount(client, 'AP and AR money moves stay tied to live documents')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports unbalanced journal entry lines before transaction rollback', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'journal entry lines balance and match the header total');
      const entryId = (await client.query(
        `INSERT INTO journal_entries (entry_number, date, total_amount)
         VALUES ($1, CURRENT_DATE, 100) RETURNING id`, [`RD-UNBAL-${tag}-${sequence}`]
      )).rows[0].id;
      await client.query(
        `INSERT INTO journal_entry_lines (journal_entry_id, debit, credit)
         VALUES ($1, 100, 0), ($1, 0, 90)`, [entryId]
      );
      return (await violationCount(client, 'journal entry lines balance and match the header total')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports PO delivered quantities that differ from delivery lines', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'PO delivered and accepted quantities reconcile');
      const projectId = await createProject(client, 'DELIVERY');
      const material = (await client.query('SELECT id FROM item_master WHERE code = $1', ['RM-CONC-C35'])).rows[0];
      const poId = (await client.query(
        `INSERT INTO purchase_orders (order_number, project_id, material_id, quantity)
         VALUES ($1, $2, $3, 5) RETURNING id`, [`RD-PO-D-${tag}-${sequence}`, projectId, material.id]
      )).rows[0].id;
      const lineId = (await client.query(
        `INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, delivered_quantity)
         VALUES ($1, $2, 5, 0) RETURNING id`, [poId, material.id]
      )).rows[0].id;
      const deliveryId = (await client.query(
        `INSERT INTO deliveries (delivery_number, purchase_order_id, status)
         VALUES ($1, $2, 'received') RETURNING id`, [`RD-DEL-${tag}-${sequence}`, poId]
      )).rows[0].id;
      await client.query(
        `INSERT INTO delivery_lines (delivery_id, purchase_order_line_id, material_id, quantity)
         VALUES ($1, $2, $3, 1)`, [deliveryId, lineId, material.id]
      );
      return (await violationCount(client, 'PO delivered and accepted quantities reconcile')) - before;
    });
    expect(violations).toBe(1);
  });

  test('reports approvals without their workflow mirror', async () => {
    const violations = await withTransaction(async (client) => {
      const before = await violationCount(client, 'approvals mirror their workflow instances');
      await client.query(
        `INSERT INTO approval_requests (module_name, request_type, request_id, status)
         VALUES ('reconcile-test', 'approval', $1, 'approved')`, [Number(tag) + ++sequence]
      );
      return (await violationCount(client, 'approvals mirror their workflow instances')) - before;
    });
    expect(violations).toBe(1);
  });
});
