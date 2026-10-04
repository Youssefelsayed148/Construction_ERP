// Real PostgreSQL. Closeout B4: the database itself refuses the states the audits found possible.
// Each test attacks the constraint directly (raw SQL, no application checks in the way) AND, where the application
// has its own check, through the service.
const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('B4 constraints (real PostgreSQL)', () => {
  let db; let svc; let inventory; let journal;
  const tag = String(Date.now()).slice(-7);
  let seq = 0;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const code = async (promise) => { try { await promise; return null; } catch (e) { return e.code || e.name; } };
  // Probe a refusal without persisting the probe row: the statement runs in a transaction that
  // always rolls back, so a failed run never leaves an offending row behind (a leftover would
  // trip the next 0029-style preflight on a reused database).
  const codeRolledBack = async (sql, params) => {
    let outcome;
    try {
      await db.transaction(async (client) => { outcome = await code(client.query(sql, params)); throw new Error('__probe_rollback__'); });
    } catch (e) {
      if (e.message !== '__probe_rollback__') throw e;
    }
    return outcome;
  };
  const quiet = async (fn) => { const spy = jest.spyOn(console, 'error').mockImplementation(() => {}); try { return await fn(); } finally { spy.mockRestore(); } };
  const tx = (fn) => db.transaction((client) => fn(client.query.bind(client)));

  const world = async () => {
    seq += 1;
    const key = `${tag}-${seq}`;
    const project = await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`b4-${key}`, `B4${key}`.slice(0, 20)]);
    const supplier = await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`b4-s-${key}`]);
    const material = await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'b4', $1, $1, 'ea') RETURNING id", [`b4-m-${key}`]);
    const warehouse = await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`b4-w-${key}`, project.id]);
    const user = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', 'staff') RETURNING id", [`b4-${key}`, `b4-${key}@test.io`]);
    return { key, project, supplier, material, warehouse, user };
  };

  beforeAll(() => {
    db = require('../../config/database');
    svc = require('../../services/procurementService');
    inventory = require('../../services/inventoryEngine');
    journal = require('../../utils/journal');
  });
  afterAll(async () => { await db.pool.end(); });

  test('negative stock: the projection refuses a negative quantity, and an issue beyond stock is refused by the engine', async () => {
    const w = await world();
    expect(await code(db.query('INSERT INTO warehouse_stock (warehouse_id, item_id, quantity, available_quantity) VALUES ($1, $2, -1, -1)', [w.warehouse.id, w.material.id]))).toBe('23514');
    await inventory.createMovement(db.query, { warehouse_id: w.warehouse.id, material_id: w.material.id, movement_type: 'opening', quantity: 5, unit_cost: 1 });
    await expect(inventory.createMovement(db.query, { warehouse_id: w.warehouse.id, material_id: w.material.id, movement_type: 'issue', quantity: 6 })).rejects.toThrow(/Insufficient stock/);
    expect(await code(db.query('UPDATE warehouse_stock SET quantity = -1 WHERE warehouse_id = $1 AND item_id = $2', [w.warehouse.id, w.material.id]))).toBe('23514');
    expect(await codeRolledBack("INSERT INTO stock_movements (warehouse_id, material_id, movement_type, quantity) VALUES ($1, $2, 'issue', -3)", [w.warehouse.id, w.material.id])).not.toBeNull();
  });

  test('over-delivery: the service refuses beyond order + tolerance, and the table CHECK refuses it even from raw SQL', async () => {
    const w = await world();
    const po = await tx((q) => svc.createPurchaseOrder(q, { supplier_id: w.supplier.id, project_id: w.project.id, warehouse_id: w.warehouse.id, lines: [{ material_id: w.material.id, quantity: 10, unit_rate: 5 }], created_by: w.user.id }));
    await expect(tx((q) => svc.createDelivery(q, { purchase_order_id: po.id, warehouse_id: w.warehouse.id, lines: [{ purchase_order_line_id: po.lines[0].id, material_id: w.material.id, quantity: 11 }], received_by: w.user.id }))).rejects.toThrow();
    expect(await code(db.query('UPDATE purchase_order_lines SET delivered_quantity = 11 WHERE id = $1', [po.lines[0].id]))).toBe('23514');
    expect(await code(db.query('UPDATE purchase_order_lines SET quantity = 0 WHERE id = $1', [po.lines[0].id]))).toBe('23514');
  });

  test('FK RESTRICT: financial, procurement and stock records cannot be deleted from under their children; users are never deleted', async () => {
    const w = await world();
    const po = await tx((q) => svc.createPurchaseOrder(q, { supplier_id: w.supplier.id, project_id: w.project.id, warehouse_id: w.warehouse.id, lines: [{ material_id: w.material.id, quantity: 1, unit_rate: 5 }], created_by: w.user.id }));
    expect(po.id).toBeTruthy();
    expect(await code(db.query('DELETE FROM suppliers WHERE id = $1', [w.supplier.id]))).toBe('23503');
    expect(await code(db.query('DELETE FROM purchase_orders WHERE id = $1', [po.id]))).toBe('23503');   // its lines restrict it
    await db.query("INSERT INTO project_costs (project_id, source_type, source_id, amount) VALUES ($1, 'b4', $2, 1)", [w.project.id, Number(String(Date.now()).slice(-6))]);
    expect(await code(db.query('DELETE FROM projects WHERE id = $1', [w.project.id]))).toBe('23503');
    await inventory.createMovement(db.query, { warehouse_id: w.warehouse.id, material_id: w.material.id, movement_type: 'opening', quantity: 1, unit_cost: 1 });
    expect(await code(db.query('DELETE FROM warehouses WHERE id = $1', [w.warehouse.id]))).toBe('23503');
    expect(await code(db.query('DELETE FROM users WHERE id = $1', [w.user.id]))).toBe('23001');          // the BEFORE DELETE trigger
  });

  test('duplicate pending approval: one pending request per (module, type, record)', async () => {
    const w = await world();
    const rid = Number(tag) * 10 + seq + 8000000;
    await db.query("INSERT INTO approval_requests (module_name, request_type, request_id, requester_id, status) VALUES ('expenses', 'create', $1, $2, 'pending')", [rid, w.user.id]);
    expect(await code(db.query("INSERT INTO approval_requests (module_name, request_type, request_id, requester_id, status) VALUES ('expenses', 'create', $1, $2, 'pending')", [rid, w.user.id]))).toBe('23505');
    await db.query("UPDATE approval_requests SET status = 'cancelled' WHERE module_name = 'expenses' AND request_id = $1", [rid]);
    await db.query("INSERT INTO approval_requests (module_name, request_type, request_id, requester_id, status) VALUES ('expenses', 'create', $1, $2, 'pending')", [rid, w.user.id]);   // a decided one frees the slot
  });

  test('duplicate supplier invoice: (supplier, invoice number) is unique, in SQL and in the service (stable code)', async () => {
    const w = await world();
    await db.query("INSERT INTO supplier_invoices (invoice_number, supplier_id, total_amount, tax_amount, status) VALUES ($1, $2, 10, 0, 'received')", [`B4-${w.key}`, w.supplier.id]);
    expect(await code(db.query("INSERT INTO supplier_invoices (invoice_number, supplier_id, total_amount, tax_amount, status) VALUES ($1, $2, 10, 0, 'received')", [`B4-${w.key}`, w.supplier.id]))).toBe('23505');
    await expect(tx((q) => svc.recordSupplierInvoice(q, { supplier_id: w.supplier.id, invoice_number: `B4-${w.key}`, total_amount: 10, lines: [{ quantity: 1, unit_price: 10 }] }))).rejects.toThrow(/Duplicate invoice/);
  });

  test('unbalanced journal: the entry cannot commit, and the service refuses it before the database does', async () => {
    const acct = await one("SELECT id FROM accounts ORDER BY id LIMIT 1");
    await quiet(async () => {
      await expect(db.transaction(async (client) => {
        const e = (await client.query("INSERT INTO journal_entries (entry_number, date, description, total_amount) VALUES ($1, CURRENT_DATE, 'b4 unbalanced', 10) RETURNING id", [`B4-JE-${tag}-${seq += 1}`])).rows[0];
        await client.query('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order) VALUES ($1, $2, 10, 0, 1)', [e.id, acct.id]);
      })).rejects.toThrow();
      await expect(tx((q) => journal.postJournalEntry(q, { date: '2026-10-01', description: 'x', reference_type: 'b4', reference_id: 1, lines: [{ account: 'cash', debit: '10.00' }, { account: 'payable', credit: '9.00' }] }))).rejects.toThrow(/balance/i);
      const line = await code(db.query('INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, line_order) VALUES (NULL, $1, 1, 1, 1)', [acct.id]));
      expect(line).not.toBeNull();                                                  // both sides on one line is refused too
    });
  });

  test('unmapped ledger account: the posting fails naming the key and nothing is written', async () => {
    const before = Number((await one('SELECT count(*)::int n FROM journal_entries')).n);
    await quiet(async () => {
      await expect(tx((q) => journal.postJournalEntry(q, { date: '2026-10-01', description: 'x', reference_type: 'b4', reference_id: 2, lines: [{ account: 'no_such_account_key', debit: '5.00' }, { account: 'cash', credit: '5.00' }] }))).rejects.toThrow(/no_such_account_key/);
    });
    expect(Number((await one('SELECT count(*)::int n FROM journal_entries')).n)).toBe(before);
  });
});
