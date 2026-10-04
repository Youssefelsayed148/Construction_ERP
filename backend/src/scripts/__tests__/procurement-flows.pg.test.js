// Real PostgreSQL + real app. Ported from the mock suite procurement.test.js: the RFQ → quotations →
// comparison → award leg, a PO carried through its real approval workflow to 'issued' and then closed,
// the three-way-match exception taxonomy (price variance, missing GRN, tax mismatch — with the A2.7 rule
// that a partial invoice at the PO rate is NOT a price variance), the duplicate guards around
// delivery/MIR/GRN, PO totals computed from the lines, and the branded quotation/comparison PDFs
// generated from real rows.
//
// Like golden-chain.pg.test.js: the real routes via fetch, one owner token (owner/admin decide at every
// workflow stage), every figure read back from the database.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('procurement flows (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner; let svc;
  const tag = String(Date.now()).slice(-7);
  let seq = 0;
  const PRICE = 100;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const num = (v) => Math.round(Number(v) * 100) / 100;
  const call = async (method, path, body, raw = false) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') };
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const made = { suppliers: [], materials: [], projects: [] };
  const fixtures = {};
  const newSupplier = async (label) => {
    const s = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`proc-${tag}-${label}`])).id;
    made.suppliers.push(s);
    return s;
  };
  const newMaterial = async (label) => {
    const m = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'proc-test', $1, $1, 'ea') RETURNING id", [`proc-m-${tag}-${label}`])).id;
    made.materials.push(m);
    return m;
  };
  const world = async () => {
    seq += 1;
    const key = `${tag}-${seq}`;
    const projectId = (await one("INSERT INTO projects (name, name_en, code, status, budget, contract_value) VALUES ($1, $1, $2, 'active', 200000, 300000) RETURNING id", [`proc-${key}`, `PC${key}`.slice(0, 20)])).id;
    made.projects.push(projectId);
    const supplierId = await newSupplier(`w${seq}`);
    const materialId = await newMaterial(`w${seq}`);
    const warehouseId = (await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`proc-w-${key}`, projectId])).id;
    await db.query('INSERT INTO supplier_materials (supplier_id, material_id, unit_price) VALUES ($1, $2, $3)', [supplierId, materialId, PRICE]);
    return { key, project: { id: projectId }, supplier: { id: supplierId }, material: { id: materialId }, warehouse: { id: warehouseId } };
  };
  const projectStatus = (table, id) => db.query(`SELECT status FROM ${table} WHERE id = $1`, [id]).then((r) => r.rows[0].status);
  const decideUntil = async (kind, id, want, max = 6) => {
    for (let i = 0; i < max; i += 1) {
      if (await projectStatus(kind === 'purchase_request' ? 'purchase_requests' : 'purchase_orders', id) === want) return;
      const r = await call('POST', `/api/procurement/${kind === 'purchase_request' ? 'pr' : 'po'}/${id}/decide`, { decision: 'approve' });
      expect([r.status, r.body.error]).toEqual([200, undefined]);
    }
    expect(await projectStatus(kind === 'purchase_request' ? 'purchase_requests' : 'purchase_orders', id)).toBe(want);
  };
  const toIssuedPo = async (w, quantity, opts = {}) => {
    const pr = (await call('POST', '/api/procurement/pr', {
      title: `proc ${tag} ${seq}`, project_id: w.project.id, priority: 'normal', needed_by: '2099-01-01',
      lines: [{ material_id: w.material.id, description: 'proc', quantity, unit: 'ea', estimated_unit_price: PRICE }],
    })).body.data;
    expect(await projectStatus('purchase_requests', pr.id)).toBe('draft');
    const submitted = await call('POST', `/api/procurement/pr/${pr.id}/submit`, {});
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('budget_check');
    await decideUntil('purchase_request', pr.id, 'procurement');
    const prLines = await all('SELECT * FROM purchase_request_lines WHERE purchase_request_id = $1', [pr.id]);
    const created = await call('POST', '/api/procurement/po', {
      supplier_id: w.supplier.id, purchase_request_id: pr.id, project_id: w.project.id,
      taxes: opts.taxes || 0,
      lines: prLines.map((l) => ({ material_id: l.material_id, quantity: Number(l.quantity), unit: l.unit, unit_rate: PRICE })),
    });
    expect(created.status).toBe(201);
    const po = created.body.data;
    await call('POST', `/api/procurement/po/${po.id}/issue`);
    await decideUntil('purchase_order', po.id, 'issued');
    const fresh = (await all('SELECT * FROM purchase_orders WHERE id = $1', [po.id]))[0];
    expect(fresh.status).toBe('issued');
    const poLine = (await all('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id]))[0];
    return { pr, po: fresh, poLine };
  };
  const receive = async (w, po, poLine, quantity) => {
    const delivery = await call('POST', '/api/procurement/deliveries', { purchase_order_id: po.id, warehouse_id: w.warehouse.id, lines: [{ purchase_order_line_id: poLine.id, quantity }] });
    expect(delivery.status).toBe(201);
    const mir = await call('POST', `/api/procurement/deliveries/${delivery.body.data.id}/mir`);
    expect(mir.status).toBe(201);
    expect((await call('POST', `/api/procurement/mir/${mir.body.data.id}/decide`, { decision: 'accept' })).status).toBe(200);
    const grnRes = await call('POST', `/api/procurement/mir/${mir.body.data.id}/grn`);
    expect(grnRes.status).toBe(201);
    return { delivery: delivery.body.data, mir: mir.body.data, grn: grnRes.body.data };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    svc = require('../../services/procurementService');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('proc-owner', $1, 'x', 'owner') RETURNING id, token_version", [`proc-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, role: 'owner', name: 'proc-owner', token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });

  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('1. an RFQ issued to 3 suppliers: 3 quotations, the comparison ranks them, the award is recorded', async () => {
    const w = await world();
    const rfq = (await call('POST', '/api/procurement/rfq', {
      project_id: w.project.id, title: `rfq ${tag} ${seq}`, due_date: '2099-09-30',
      lines: [{ material_id: w.material.id, description: 'cement', quantity: 100, unit: 'ea' }],
    })).body.data;
    const vendors = (await call('POST', `/api/procurement/rfq/${rfq.id}/vendors`, { supplier_ids: [w.supplier.id] })).body.data;
    expect(vendors).toHaveLength(1);
    // Two more vendors (suppliers without material link also quote on services): create unlinked ones.
    const v2 = await newSupplier('rfq-2');
    const v3 = await newSupplier('rfq-3');
    await call('POST', `/api/procurement/rfq/${rfq.id}/vendors`, { supplier_ids: [v2, v3] });

    const rfqLine = (await all('SELECT * FROM rfq_lines WHERE rfq_id = $1', [rfq.id]))[0];
    // An uninvited supplier is refused, and a quotation must cover each line exactly once.
    const stranger = await newSupplier('stranger');
    expect((await call('POST', `/api/procurement/rfq/${rfq.id}/quotations`, { supplier_id: stranger, lines: [{ rfq_line_id: rfqLine.id, quantity: 100, unit_price: 98 }] })).status).toBe(400);
    expect((await call('POST', `/api/procurement/rfq/${rfq.id}/quotations`, { supplier_id: v2, lines: [{ rfq_line_id: rfqLine.id + 1, quantity: 100, unit_price: 98 }] })).status).toBe(400);

    const quotes = {};
    quotes[v2] = (await call('POST', `/api/procurement/rfq/${rfq.id}/quotations`, {
      supplier_id: v2, lines: [{ rfq_line_id: rfqLine.id, quantity: 100, unit_price: 101 }],
      lead_time_days: 5, technical_score: 4.0, commercial_score: 4.5,
    })).body.data;
    quotes[v3] = (await call('POST', `/api/procurement/rfq/${rfq.id}/quotations`, {
      supplier_id: v3, lines: [{ rfq_line_id: rfqLine.id, quantity: 100, unit_price: 92 }],
      compliant: false, deviations: ['bulk-only packaging'],
    })).body.data;
    const quoted = (await call('POST', `/api/procurement/rfq/${rfq.id}/quotations`, {
      supplier_id: w.supplier.id, lines: [{ rfq_line_id: rfqLine.id, quantity: 100, unit_price: 98 }],
      tax_pct: 5, payment_terms: 'Net 30', lead_time_days: 7, warranty_months: 12,
      technical_score: 4.5, commercial_score: 4.2,
    })).body.data;

    const comparison = (await call('GET', `/api/procurement/rfq/${rfq.id}/comparison`)).body.data;
    expect(comparison.rows).toHaveLength(3);
    const mine = comparison.rows.find((r) => r.supplier_id === w.supplier.id);
    expect(mine.compliant).toBe(true);
    expect(mine.lead_time_days).toBe(7);
    expect(mine.unit_price).toBe(98);
    expect(Number(mine.total_price)).toBeCloseTo(10290, 2);   // 9800 + 5% tax
    expect(Number(mine.tax_amount)).toBeCloseTo(490, 2);
    expect(comparison.rows.find((r) => r.supplier_id === v3).compliant).toBe(false); // non-compliant flagged
    // Recommendation: highest commercial score among compliant quotes → the 4.5 quote.
    expect(comparison.recommendation.quotation_id).toBe(quotes[v2].id);
    expect(comparison.recommendation.supplier_id).toBe(v2);
    void quoted;

    // Vendor scoping: a vendor's view never contains a competitor's quote.
    const vendorView = await svc.quotationsForVendor(db.query, rfq.id, w.supplier.id);
    expect(vendorView).toHaveLength(1);
    expect(vendorView[0].supplier_id).toBe(w.supplier.id);

    // Award recorded on the quotation and the RFQ.
    const awarded = (await call('POST', `/api/procurement/rfq/${rfq.id}/award`, { quotation_id: quotes[v2].id, justification: 'direct award by the owner for the flow test' })).body.data;
    expect(awarded.awarded).toBe(true);
    expect((await one('SELECT status FROM supplier_quotations WHERE id = $1', [quotes[v2].id])).status).toBe('awarded');
    expect((await one('SELECT status FROM supplier_quotations WHERE id = $1', [quotes[v3].id])).status).toBe('not_awarded');
    expect((await one('SELECT status, awarded_quotation_id FROM rfqs WHERE id = $1', [rfq.id]))).toMatchObject({ status: 'awarded', awarded_quotation_id: quotes[v2].id });

    // A non-compliant quotation can never be awarded.
    const other = (await all('SELECT id FROM supplier_quotations WHERE rfq_id = $1 AND compliant = false', [rfq.id]))[0];
    expect((await call('POST', `/api/procurement/rfq/${rfq.id}/award`, { quotation_id: other.id })).status).toBe(400);
    fixtures.rfq = rfq;
    fixtures.comparisonQuotation = quotes[v2].id;
  });

  test('2. a PO from the requisition carries its approval workflow from Draft to Issued', async () => {
    const w = await world();
    const { pr, po, poLine } = await toIssuedPo(w, 30);
    expect(po.status).toBe('issued');
    expect(Number(po.total_amount)).toBe(3000);                    // Σ line nets at the PO rate
    expect((await one('SELECT workflow_instance_id FROM purchase_orders WHERE id = $1', [po.id])).workflow_instance_id).toBeTruthy();
    const wfId = (await one('SELECT workflow_instance_id FROM purchase_orders WHERE id = $1', [po.id])).workflow_instance_id;
    const wf = (await one('SELECT current_step_key, status FROM workflow_instances WHERE id = $1', [wfId]));
    expect(wf).toMatchObject({ current_step_key: 'issued', status: 'active' });
    fixtures.pr = pr;
    fixtures.po = po;
    fixtures.poLine = poLine;
    fixtures.w = w;
    // history: Draft → Commercial → Financial Authority, each a workflow action with its own step key
    const steps = (await all('SELECT step_key, decision FROM workflow_actions WHERE instance_id = $1 ORDER BY id', [wfId])).map((a) => a.step_key);
    expect(steps).toEqual(['draft', 'commercial_procurement_approval', 'financial_authority']);
  });

  test('3. closing the PO via decideOnDocument reaches Closed through the catalog state machine', async () => {
    const po = fixtures.po;
    // Delivered states are driven by real quantities: nothing was received, so the run goes
    // Partially/Fully Delivered → Closed. The final decide approves the instance at its Closed step.
    await call('POST', `/api/procurement/po/${po.id}/decide`, { decision: 'approve' }); // acknowledged
    let status = await projectStatus('purchase_orders', po.id);
    expect(status).toBe('acknowledged');
    await call('POST', `/api/procurement/po/${po.id}/decide`, { decision: 'approve' });
    status = await projectStatus('purchase_orders', po.id);
    expect(status).toBe('partially_fully_delivered');
    await call('POST', `/api/procurement/po/${po.id}/decide`, { decision: 'approve' });
    expect(await projectStatus('purchase_orders', po.id)).toBe('closed');
    const wfId = (await one('SELECT workflow_instance_id FROM purchase_orders WHERE id = $1', [po.id])).workflow_instance_id;
    expect((await one('SELECT current_step_key, status FROM workflow_instances WHERE id = $1', [wfId])))
      .toMatchObject({ current_step_key: 'closed', status: 'active' });
    // Approving at the Closed terminal step completes the instance and the document reads Closed either way.
    await call('POST', `/api/procurement/po/${po.id}/decide`, { decision: 'approve' });
    expect((await one('SELECT status FROM workflow_instances WHERE id = $1', [wfId])).status).toBe('approved');
    expect(await projectStatus('purchase_orders', po.id)).toBe('closed');
  });

  test('4. three-way match flags price variance, missing GRN and tax mismatch on an invoice; a partial invoice at the PO rate is clean', async () => {
    // 4a. variance + missing GRN + tax mismatch once.
    const w = await world();
    const { po, poLine } = await toIssuedPo(w, 10, { taxes: 100 });
    const inv = await call('POST', '/api/procurement/invoices', {
      supplier_id: w.supplier.id, purchase_order_id: po.id,
      invoice_number: `VAR-${tag}-${seq}`, total_amount: 2199, tax_amount: 999,
      lines: [{ purchase_order_line_id: poLine.id, material_id: w.material.id, quantity: 10, unit_price: 120 }],
    });
    expect(inv.status).toBe(201);
    expect(inv.body.data.match.match_status).toBe('exception');
    const types = inv.body.data.match.exceptions.map((e) => e.type);
    expect(types).toContain('price_variance');    // 120 vs PO 100 — flagged on the line and again by the header check
    expect(types).toContain('missing_grn');       // nothing delivered/accepted on the line
    expect(types).toContain('quantity_variance'); // invoiced 10 vs delivered 0
    expect(types).toContain('tax_mismatch');      // 999 vs PO taxes 100
    const stored = await one('SELECT match_status, exceptions FROM supplier_invoices WHERE id = $1', [inv.body.data.invoice.id]);
    expect(stored.match_status).toBe('exception');
    expect(stored.exceptions.map((e) => e.type)).toEqual(types);

    // 4b. A2.7: a partial invoice for what was actually received and kept, at the PO rate, is clean.
    const w2 = await world();
    const { po: po2, poLine: line2 } = await toIssuedPo(w2, 10);
    await receive(w2, po2, line2, 5);       // half delivered, half kept: GRN valued at 500
    const partial = await call('POST', '/api/procurement/invoices', {
      supplier_id: w2.supplier.id, purchase_order_id: po2.id,
      invoice_number: `PART-${tag}-${seq}`, total_amount: 500, tax_amount: 0,
      lines: [{ purchase_order_line_id: line2.id, material_id: w2.material.id, quantity: 5, unit_price: PRICE }],
    });
    expect(partial.status).toBe(201);
    expect(partial.body.data.match.match_status).toBe('matched');
    expect(partial.body.data.match.exceptions).toEqual([]);
  });

  test('5. the duplicate guards: a second GRN for the same MIR is refused and a second MIR for the same delivery is refused', async () => {
    const w = await world();
    const { po, poLine } = await toIssuedPo(w, 6);
    const chain = await receive(w, po, poLine, 6);
    expect(chain.grn.grn_number).toMatch(/^GRN-/);
    // The MIR already has its GRN.
    await expect(db.transaction((client) => svc.createGrn(client.query.bind(client), { mir_id: chain.mir.id, created_by: owner.id })))
      .rejects.toThrow(/already has GRN/);
    // The delivery already has its MIR.
    await expect(db.transaction((client) => svc.createMir(client.query.bind(client), { delivery_id: chain.delivery.id, created_by: owner.id })))
      .rejects.toThrow(/already has MIR/);
    // And the GRN constraint still holds: delivering more than ordered + tolerance is refused.
    const beyond = (await all('SELECT * FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id]))[0];
    await expect(db.transaction((client) => svc.createDelivery(client.query.bind(client), {
      purchase_order_id: po.id, warehouse_id: w.warehouse.id,
      lines: [{ purchase_order_line_id: beyond.id, quantity: 2 }],
      received_by: owner.id,
    }))).rejects.toThrow(/tolerance/);
  });

  test('6. PO totals are computed from the lines: Σ(qty × rate − discount) + taxes + freight + approved charges', async () => {
    const w = await world();
    const po = await db.transaction((client) => svc.createPurchaseOrder(client.query.bind(client), {
      supplier_id: w.supplier.id, project_id: w.project.id,
      taxes: 95, freight: 300, approved_charges: 50, tolerance_pct: 5,
      payment_terms: 'Net 30', delivery_terms: 'Delivered to site store',
      created_by: owner.id,
      lines: [
        { material_id: w.material.id, description: 'bags', quantity: 100, unit: 'ea', unit_rate: 10, discount: 0 },   // 1000
        { material_id: w.material.id, description: 'bags', quantity: 40, unit: 'ea', unit_rate: 25, discount: 100 },  // 900
      ],
    }));
    const stored = await one('SELECT total_amount, quantity, unit_price, taxes, freight, approved_charges FROM purchase_orders WHERE id = $1', [po.id]);
    expect(Number(stored.total_amount)).toBe(2345);
    expect(Number(stored.taxes)).toBe(95);
    expect(Number(stored.freight)).toBe(300);
    expect(Number(stored.approved_charges)).toBe(50);
    expect(Number(stored.quantity)).toBeCloseTo(140, 3);
    expect(Number(stored.unit_price)).toBeCloseTo(2345 / 140, 2);   // unit price stays derived, never sent
    // The pure formula agrees line by line.
    expect(svc.poLineNet(100, 10, 0)).toBe(1000);
    expect(svc.poLineNet(40, 25, 100)).toBe(900);
    expect(svc.poTotal(po.lines, po)).toBe(2345);
    void w;
  });

  test('7. the quotation cover and commercial comparison render as branded PDF buffers from real rows', async () => {
    const cover = await call('GET', `/api/procurement/documents/quotation-cover/${fixtures.comparisonQuotation}`, null, true);
    expect(cover.status).toBe(200);
    expect(cover.type).toMatch(/application\/pdf/);
    expect(cover.buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(cover.buffer.length).toBeGreaterThan(500);

    const comparison = await call('GET', `/api/procurement/documents/commercial-comparison/${fixtures.rfq.id}`, null, true);
    expect(comparison.status).toBe(200);
    expect(comparison.type).toMatch(/application\/pdf/);
    expect(comparison.buffer.slice(0, 5).toString()).toBe('%PDF-');
  });
});
