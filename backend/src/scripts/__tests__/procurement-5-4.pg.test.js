// Real PostgreSQL + real app. Phase 5.4 - procurement (spec 08):
//   award recommendation as an entity with an approval (basis, deviation from the comparison, one live per RFQ,
//   approval awards the RFQ), RFQ list and GET, PR/PO update and cancel, vendor performance and spend queries
//   (exact figures from a built dataset), and the role matrix on the internal API and /api/v1.
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const fs = require('fs');
const path = require('path');
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

describePg('5.4 procurement: awards, update/cancel, analytics (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let svc; let analytics;
  const tag = String(Date.now()).slice(-8);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const all = async (sql, params) => (await db.query(sql, params)).rows;
  const call = async (method, p, user, body) => {
    const res = await fetch(`${base}${p}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user && user.token ? user.token : ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };
  const users = {};
  const made = { projects: [], suppliers: [], items: [] };
  let day = 0;
  const makeUser = async (key, userRole, grantRole = userRole, projectId = null) => {
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ($1, $2, 'x', $3) RETURNING id, token_version",
      [`pr-${key}`, `pr-${key}-${++day}-${tag}@test.io`, userRole]);
    if (grantRole) await db.query('INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, $2, id FROM roles WHERE key = $3', [row.id, projectId, grantRole]);
    users[key] = { id: row.id, role: userRole, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
    return users[key];
  };
  const makeProject = async (s, budget = 100000) => {
    const id = (await one("INSERT INTO projects (name, name_en, code, status, budget) VALUES ($1, $1, $2, 'active', $3) RETURNING id", [`pr ${s}`, `PR${tag}${s}`.slice(0, 20), budget])).id;
    made.projects.push(id); return id;
  };
  const makeSupplier = async (s) => { const id = (await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $2, $2) RETURNING id', [`pr-${s}-${tag}`, `pr supplier ${s}`])).id; made.suppliers.push(id); return id; };
  const makeItem = async (s, category) => { const id = (await one("INSERT INTO item_master (code, category, unit, name_en, name_ar) VALUES ($1, $2, 'piece', $3, $3) RETURNING id", [`PR-${s}-${tag}`, category, `pr ${s}`])).id; made.items.push(id); return id; };
  const migrationSql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '0035_procurement_awards_cancel.sql'), 'utf8');
  const dateIn = (d) => { const x = new Date(Date.now() + d * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

  let pA; let pB; let s1; let s2; let s3; let mCem; let mPipe;
  // an RFQ with three vendors: s1 compliant best commercial score, s2 compliant cheaper but lower score, s3 non-compliant
  const makeRfq = async (project = pA) => {
    const rfq = await db.transaction((c) => svc.createRfq(c.query.bind(c), { project_id: project, title: `rfq ${tag}`, lines: [{ material_id: mCem, quantity: 100, unit: 'piece' }], created_by: users.owner.id }));
    await db.transaction((c) => svc.inviteVendors(c.query.bind(c), rfq.id, [s1, s2, s3]));
    const rfqLine = (await one('SELECT id FROM rfq_lines WHERE rfq_id = $1', [rfq.id])).id;
    const quote = async (supplier, unitPrice, scores, compliant = true) => (await db.transaction((c) => svc.submitQuotation(c.query.bind(c), {
      rfq_id: rfq.id, supplier_id: supplier, lines: [{ rfq_line_id: rfqLine, material_id: mCem, quantity: 100, unit_price: unitPrice }], compliant, ...scores, created_by: users.owner.id }))).id;
    const q1 = await quote(s1, 12, { commercial_score: 90, technical_score: 80 });
    const q2 = await quote(s2, 10, { commercial_score: 70, technical_score: 85 });
    const q3 = await quote(s3, 8, { commercial_score: 99, technical_score: 99 }, false);
    return { rfq, q1, q2, q3 };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    svc = require('../../services/procurementService');
    analytics = require('../../services/procurementAnalytics');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    pA = await makeProject('A'); pB = await makeProject('B');
    s1 = await makeSupplier('1'); s2 = await makeSupplier('2'); s3 = await makeSupplier('3');
    mCem = await makeItem('CEM', 'cement_cat'); mPipe = await makeItem('PIPE', 'pipe_cat');
    await makeUser('owner', 'owner');
    await makeUser('purchasing', 'purchasing_mgr', 'procurement_manager');      // coarse purchasing_mgr + procurement approve/void
    await makeUser('officer', 'staff', 'procurement_officer');                  // drafts and submits, no approve/void
    await makeUser('officerA', 'staff', 'procurement_officer', pA);             // the same, bound to project A
    await makeUser('keeper', 'storekeeper');
    await makeUser('client', 'client', 'client', pA);
    await makeUser('fresh', 'staff', null);
  });

  afterAll(async () => {
    const uids = [...new Set(Object.values(users).map((u) => u.id))];
    await db.query('DELETE FROM user_project_roles WHERE user_id = ANY($1)', [uids]);
    await db.query('UPDATE users SET is_active = false WHERE id = ANY($1)', [uids]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  // --------------------------------------------------------------------------------------------------
  test('1. migration: the award table, one live recommendation per RFQ, legacy awards backfilled, template seeded', async () => {
    expect((await one("SELECT count(*)::int n FROM information_schema.tables WHERE table_name = 'rfq_award_recommendations'")).n).toBe(1);
    const t = await one("SELECT t.id, (SELECT count(*)::int FROM workflow_steps s WHERE s.template_id = t.id) AS steps FROM workflow_templates t WHERE t.key = 'rfq_award'");
    expect(t.steps).toBe(3);
    const c = await db.pool.connect();
    try {
      await c.query('BEGIN');
      const rfq = (await c.query("INSERT INTO rfqs (rfq_number, title, status) VALUES ($1, 'legacy', 'awarded') RETURNING id", [`RFQ-MIG-${tag}`])).rows[0].id;
      const quote = (await c.query("INSERT INTO supplier_quotations (rfq_id, supplier_id, total_price, awarded, status) VALUES ($1, $2, 500, true, 'awarded') RETURNING id", [rfq, s1])).rows[0].id;
      await c.query('UPDATE rfqs SET awarded_quotation_id = $2 WHERE id = $1', [rfq, quote]);
      await c.query(migrationSql);
      const legacy = (await c.query('SELECT status, basis, supplier_id, total_price FROM rfq_award_recommendations WHERE rfq_id = $1', [rfq])).rows;
      expect(legacy).toEqual([{ status: 'approved', basis: 'direct_award', supplier_id: s1, total_price: '500.00' }]);
      // an award pointing at a quotation that is not on that RFQ stops the migration with a count
      const other = (await c.query("INSERT INTO rfqs (rfq_number, title) VALUES ($1, 'other') RETURNING id", [`RFQ-MIG2-${tag}`])).rows[0].id;
      await c.query('UPDATE rfqs SET awarded_quotation_id = $2 WHERE id = $1', [other, quote]);
      await c.query('SAVEPOINT pre');
      await expect(c.query(migrationSql)).rejects.toThrow(/preflight UNSAFE: 1 awarded RFQ/);
      await c.query('ROLLBACK TO SAVEPOINT pre');
    } finally { await c.query('ROLLBACK'); c.release(); }
  });

  test('2. RFQ list and GET by id: lines, vendors, quotations and the live recommendation', async () => {
    const { rfq, q1 } = await makeRfq();
    const list = await call('GET', `/api/procurement/rfq?project_id=${pA}`, users.officer);
    expect(list.status).toBe(200);
    const row = list.body.data.find((r) => r.id === rfq.id);
    expect([row.line_count, row.vendor_count, row.quotation_count]).toEqual([1, 3, 3]);
    expect((await call('GET', '/api/procurement/rfq?status=nonexistent', users.officer)).body.data).toEqual([]);
    const got = await call('GET', `/api/procurement/rfq/${rfq.id}`, users.officer);
    expect(got.status).toBe(200);
    expect([got.body.data.lines.length, got.body.data.vendors.length, got.body.data.quotations.length]).toEqual([1, 3, 3]);
    expect(got.body.data.quotations[0].lines).toHaveLength(1);
    expect(got.body.data.award_recommendation).toBeNull();
    // an id that does not exist is indistinguishable from one the caller may not see: refused, not enumerable
    expect((await call('GET', '/api/procurement/rfq/99999999', users.officer)).status).toBe(403);
    const rec = await call('POST', `/api/procurement/rfq/${rfq.id}/award-recommendations`, users.officer, { quotation_id: q1, basis: 'comparison', justification: 'highest commercial score among compliant quotes' });
    expect(rec.status).toBe(201);
    expect((await call('GET', `/api/procurement/rfq/${rfq.id}`, users.officer)).body.data.award_recommendation.id).toBe(rec.body.data.id);
  });

  test('3. recommendation rules: basis, justification, compliance, scope, one live per RFQ', async () => {
    const { rfq, q1, q2, q3 } = await makeRfq();
    const post = (b, who = 'officer') => call('POST', `/api/procurement/rfq/${rfq.id}/award-recommendations`, users[who], b);
    expect((await post({ quotation_id: q1, basis: 'comparison', justification: 'short' })).body.error_code).toBe('award_justification_required');
    expect((await post({ quotation_id: q1, basis: 'direct_award', justification: 'long enough reason' })).body.error_code).toBe('award_basis_invalid');
    expect((await post({ quotation_id: q3, basis: 'lowest_price', justification: 'cheapest by far, sadly non compliant' })).body.error_code).toBe('quotation_not_compliant');
    const foreign = (await makeRfq()).q1;
    expect((await post({ quotation_id: foreign, basis: 'comparison', justification: 'a quote of another RFQ' })).body.error_code).toBe('quotation_not_on_rfq');
    // s2 is not the comparison's pick: basis 'comparison' is refused, an honest basis is flagged as a deviation
    expect((await post({ quotation_id: q2, basis: 'comparison', justification: 'cheaper, but the comparison says otherwise' })).body.error_code).toBe('award_basis_conflicts_with_comparison');
    const ok = await post({ quotation_id: q2, basis: 'lowest_price', justification: 'cheaper by 20 percent, technical score is higher' });
    expect(ok.status).toBe(201);
    expect(ok.body.data).toMatchObject({ status: 'draft', deviates_from_comparison: true, basis: 'lowest_price', supplier_id: s2, total_price: '1000.00' });
    expect(ok.body.data.recommendation_number).toMatch(/^AWR-/);
    expect(ok.body.data.comparison_snapshot.recommendation.quotation_id).toBe(q1);
    const dup = await post({ quotation_id: q1, basis: 'comparison', justification: 'a second live recommendation' });
    expect([dup.status, dup.body.error_code]).toEqual([409, 'award_recommendation_exists']);
    // withdrawn frees the RFQ for a new recommendation
    expect((await call('POST', `/api/procurement/award-recommendations/${ok.body.data.id}/withdraw`, users.purchasing, { reason: 'changed my mind' })).body.data.status).toBe('withdrawn');
    expect((await post({ quotation_id: q1, basis: 'comparison', justification: 'now the comparison pick' })).status).toBe(201);
  });

  test('4. approval: the workflow decides, the last approval awards the RFQ in the same transaction', async () => {
    const { rfq, q1, q2 } = await makeRfq();
    const rec = (await call('POST', `/api/procurement/rfq/${rfq.id}/award-recommendations`, users.officer, { quotation_id: q1, basis: 'comparison', justification: 'highest commercial score among compliant quotes' })).body.data;
    const decide = (who, decision, comment) => call('POST', `/api/procurement/award-recommendations/${rec.id}/decide`, users[who], { decision, comment });
    // not submitted yet
    expect((await decide('owner', 'approve')).body.error_code).toBe('award_not_submitted');
    const sub = await call('POST', `/api/procurement/award-recommendations/${rec.id}/submit`, users.officer);
    expect([sub.status, sub.body.data.status]).toEqual([200, 'submitted']);
    expect((await call('POST', `/api/procurement/award-recommendations/${rec.id}/submit`, users.officer)).body.error_code).toBe('award_not_draft');
    // the officer holds no approve action: refused by policy before the workflow is asked
    expect((await decide('officer', 'approve')).status).toBe(403);
    // procurement review (purchasing manager) then authority approval (owner)
    const step1 = await decide('purchasing', 'approve', 'reviewed');
    expect([step1.status, step1.body.data.status]).toEqual([200, 'submitted']);
    expect((await one('SELECT status FROM rfqs WHERE id = $1', [rfq.id])).status).not.toBe('awarded');
    const step2 = await decide('owner', 'approve', 'approved');
    expect([step2.status, step2.body.data.status]).toEqual([200, 'approved']);
    expect(step2.body.data.decided_by).toBe(users.owner.id);
    const after = await one('SELECT status, awarded_quotation_id FROM rfqs WHERE id = $1', [rfq.id]);
    expect([after.status, after.awarded_quotation_id]).toEqual(['awarded', q1]);
    expect((await one('SELECT awarded, status FROM supplier_quotations WHERE id = $1', [q1]))).toEqual({ awarded: true, status: 'awarded' });
    expect((await one('SELECT status FROM supplier_quotations WHERE id = $1', [q2])).status).toBe('not_awarded');
    // an approved recommendation cannot be withdrawn or decided again; the RFQ cannot take another
    expect((await call('POST', `/api/procurement/award-recommendations/${rec.id}/withdraw`, users.purchasing, { reason: 'too late' })).body.error_code).toBe('award_cannot_withdraw');
    expect((await decide('owner', 'approve')).body.error_code).toBe('award_not_submitted');
    const again = await call('POST', `/api/procurement/rfq/${rfq.id}/award-recommendations`, users.officer, { quotation_id: q2, basis: 'other', justification: 'trying to award a second time' });
    expect(again.body.error_code).toBe('rfq_already_awarded');
    // a rejection leaves the RFQ open
    const second = await makeRfq();
    const rec2 = (await call('POST', `/api/procurement/rfq/${second.rfq.id}/award-recommendations`, users.officer, { quotation_id: second.q1, basis: 'comparison', justification: 'highest commercial score among compliant quotes' })).body.data;
    await call('POST', `/api/procurement/award-recommendations/${rec2.id}/submit`, users.officer);
    const rej = await call('POST', `/api/procurement/award-recommendations/${rec2.id}/decide`, users.purchasing, { decision: 'reject', comment: 'prices not competitive' });
    expect([rej.status, rej.body.data.status]).toEqual([200, 'rejected']);
    expect((await one('SELECT status FROM rfqs WHERE id = $1', [second.rfq.id])).status).not.toBe('awarded');
    expect((await call('POST', `/api/procurement/rfq/${second.rfq.id}/award-recommendations`, users.officer, { quotation_id: second.q2, basis: 'lowest_price', justification: 'cheaper, second attempt after the rejection' })).status).toBe(201);
    expect((await call('GET', `/api/procurement/award-recommendations?rfq_id=${second.rfq.id}`, users.officer)).body.data).toHaveLength(2);
  });

  test('5. direct award: owner/admin only, justification mandatory, and it leaves an approved record', async () => {
    const { rfq, q2 } = await makeRfq();
    const body = { quotation_id: q2, justification: 'urgent, single available slot at the quarry' };
    expect((await call('POST', `/api/procurement/rfq/${rfq.id}/award`, users.purchasing, body)).status).toBe(403);
    expect((await call('POST', `/api/procurement/rfq/${rfq.id}/award`, users.owner, { quotation_id: q2 })).body.error_code).toBe('award_justification_required');
    const ok = await call('POST', `/api/procurement/rfq/${rfq.id}/award`, users.owner, body);
    expect(ok.status).toBe(200);
    const rec = await one('SELECT status, basis, decided_by FROM rfq_award_recommendations WHERE rfq_id = $1', [rfq.id]);
    expect(rec).toEqual({ status: 'approved', basis: 'direct_award', decided_by: users.owner.id });
    const again = await call('POST', `/api/procurement/rfq/${rfq.id}/award`, users.owner, body);
    expect([again.status, again.body.error_code]).toEqual([409, 'award_recommendation_exists']);
  });

  test('6. requisition: edit while draft, cancel with a reason until an order exists', async () => {
    const created = await call('POST', '/api/procurement/pr', users.officer, { title: 'edit me', project_id: pA, lines: [{ material_id: mCem, quantity: 10, estimated_unit_price: 5 }] });
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect(Number(created.body.data.amount)).toBe(50);
    const edited = await call('PUT', `/api/procurement/pr/${id}`, users.officer, { title: 'edited', needed_by: dateIn(30), lines: [{ material_id: mCem, quantity: 20, estimated_unit_price: 6 }, { material_id: mPipe, quantity: 1, estimated_unit_price: 30 }] });
    expect(edited.status).toBe(200);
    expect([edited.body.data.title, Number(edited.body.data.amount), Number(edited.body.data.quantity), edited.body.data.lines.length]).toEqual(['edited', 150, 21, 2]);
    expect((await call('PUT', `/api/procurement/pr/${id}`, users.officer, { location_id: 99999999 })).body.error_code).toBe('location_not_in_project');
    expect((await call('PUT', `/api/procurement/pr/${id}`, users.officer, { cost_code_id: 99999999 })).body.error_code).toBe('cost_code_not_found');
    expect((await call('PUT', `/api/procurement/pr/${id}`, users.officer, {})).status).toBe(400);
    // submitted: no longer editable, still cancellable by a role with the cancel action
    const submitted = await call('POST', `/api/procurement/pr/${id}/submit`, users.officer);
    expect([submitted.status, submitted.body.error]).toEqual([200, undefined]);
    const locked = await call('PUT', `/api/procurement/pr/${id}`, users.officer, { title: 'late' });
    expect([locked.status, locked.body.error_code]).toEqual([409, 'pr_not_draft']);
    expect((await call('POST', `/api/procurement/pr/${id}/cancel`, users.officer, { reason: 'not needed anymore' })).status).toBe(403);
    expect((await call('POST', `/api/procurement/pr/${id}/cancel`, users.purchasing, { reason: ' ' })).body.error_code).toBe('cancel_reason_required');
    const cancelled = await call('POST', `/api/procurement/pr/${id}/cancel`, users.purchasing, { reason: 'not needed anymore' });
    expect(cancelled.status).toBe(200);
    const row = await one('SELECT status, cancel_reason, cancelled_by, cancelled_at, workflow_instance_id FROM purchase_requests WHERE id = $1', [id]);
    expect([row.status, row.cancel_reason, row.cancelled_by, row.cancelled_at != null]).toEqual(['cancelled', 'not needed anymore', users.purchasing.id, true]);
    expect((await one('SELECT status FROM workflow_instances WHERE id = $1', [row.workflow_instance_id])).status).toBe('cancelled');
    expect((await call('POST', `/api/procurement/pr/${id}/cancel`, users.purchasing, { reason: 'again' })).body.error_code).toBe('pr_cannot_cancel');
    // with an order against it the requisition cannot be cancelled until the order is
    const pr2 = (await call('POST', '/api/procurement/pr', users.officer, { title: 'with order', project_id: pA, lines: [{ material_id: mCem, quantity: 5, estimated_unit_price: 5 }] })).body.data;
    const po = await call('POST', '/api/procurement/po', users.officer, { supplier_id: s1, project_id: pA, purchase_request_id: pr2.id, lines: [{ material_id: mCem, quantity: 5, unit_rate: 5 }] });
    const blocked = await call('POST', `/api/procurement/pr/${pr2.id}/cancel`, users.purchasing, { reason: 'cancel the requisition' });
    expect([blocked.status, blocked.body.error_code, blocked.body.error_params.orders]).toEqual([409, 'pr_has_orders', 1]);
    expect((await call('POST', `/api/procurement/po/${po.body.data.id}/cancel`, users.purchasing, { reason: 'order not needed' })).status).toBe(200);
    expect((await call('POST', `/api/procurement/pr/${pr2.id}/cancel`, users.purchasing, { reason: 'cancel the requisition' })).status).toBe(200);
  });

  test('7. purchase order: edit while draft (totals derived), cancel until goods or invoices exist', async () => {
    const created = await call('POST', '/api/procurement/po', users.officer, { supplier_id: s1, project_id: pA, taxes: 10, lines: [{ material_id: mCem, quantity: 10, unit_rate: 5 }] });
    const id = created.body.data.id;
    expect(Number(created.body.data.total_amount)).toBe(60);
    const edited = await call('PUT', `/api/procurement/po/${id}`, users.officer, { supplier_id: s2, taxes: 0, freight: 5, payment_terms: 'net 30', lines: [{ material_id: mCem, quantity: 4, unit_rate: 10, discount: 5 }] });
    expect(edited.status).toBe(200);
    expect([edited.body.data.supplier_id, Number(edited.body.data.total_amount), edited.body.data.payment_terms, edited.body.data.lines.length]).toEqual([s2, 40, 'net 30', 1]);   // 4x10-5 + 0 + 5
    expect((await call('PUT', `/api/procurement/po/${id}`, users.officer, { supplier_id: 99999999 })).body.error_code).toBe('supplier_not_found');
    // issue it: no longer editable; cancellable while nothing was received or invoiced
    expect((await call('POST', `/api/procurement/po/${id}/issue`, users.owner)).status).toBe(200);
    const lockedPo = await call('PUT', `/api/procurement/po/${id}`, users.officer, { taxes: 1 });
    expect([lockedPo.status, lockedPo.body.error_code, lockedPo.body.error]).toEqual([409, 'po_not_draft', lockedPo.body.error]);
    expect((await call('POST', `/api/procurement/po/${id}/cancel`, users.officer, { reason: 'supplier withdrew' })).status).toBe(403);
    const cancelled = await call('POST', `/api/procurement/po/${id}/cancel`, users.purchasing, { reason: 'supplier withdrew' });
    expect(cancelled.status).toBe(200);
    const row = await one('SELECT status, cancel_reason, cancelled_by, workflow_instance_id FROM purchase_orders WHERE id = $1', [id]);
    expect([row.status, row.cancel_reason, row.cancelled_by]).toEqual(['cancelled', 'supplier withdrew', users.purchasing.id]);
    expect((await one('SELECT status FROM workflow_instances WHERE id = $1', [row.workflow_instance_id])).status).toBe('cancelled');
    expect((await call('POST', `/api/procurement/po/${id}/cancel`, users.purchasing, { reason: 'twice' })).body.error_code).toBe('po_cannot_cancel');
    // a cancelled order is not a commitment: the budget check stops counting it
    const poB = await call('POST', '/api/procurement/po', users.officer, { supplier_id: s1, project_id: pB, lines: [{ material_id: mCem, quantity: 100, unit_rate: 50 }] });
    await db.query("UPDATE purchase_orders SET status = 'issued' WHERE id = $1", [poB.body.data.id]);
    expect((await svc.computeBudgetCheck(db.query, { project_id: pB, amount: 10 })).committed).toBe(5000);
    expect((await call('POST', `/api/procurement/po/${poB.body.data.id}/cancel`, users.purchasing, { reason: 'budget freed up' })).status).toBe(200);
    expect((await svc.computeBudgetCheck(db.query, { project_id: pB, amount: 10 })).committed).toBe(0);
    // goods or invoices against an order stop its cancellation
    const withDelivery = await call('POST', '/api/procurement/po', users.officer, { supplier_id: s1, project_id: pA, lines: [{ material_id: mCem, quantity: 10, unit_rate: 5 }] });
    await db.query("UPDATE purchase_orders SET status = 'issued' WHERE id = $1", [withDelivery.body.data.id]);
    const wh = (await one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`pr-wh-${tag}`, pA])).id;
    const poLine = (await one('SELECT id FROM purchase_order_lines WHERE purchase_order_id = $1', [withDelivery.body.data.id])).id;
    expect((await call('POST', '/api/procurement/deliveries', users.owner, { purchase_order_id: withDelivery.body.data.id, warehouse_id: wh, lines: [{ purchase_order_line_id: poLine, quantity: 3 }] })).status).toBe(201);
    const blocked = await call('POST', `/api/procurement/po/${withDelivery.body.data.id}/cancel`, users.purchasing, { reason: 'try to cancel it' });
    // receiving goods moves the order to partially_delivered, which is not a cancellable state
    expect([blocked.status, blocked.body.error_code, blocked.body.error_params.status]).toEqual([409, 'po_cannot_cancel', 'partially_delivered']);
    // defence in depth: even if an order still says 'issued', recorded deliveries stop the cancellation
    await db.query("UPDATE purchase_orders SET status = 'issued' WHERE id = $1", [withDelivery.body.data.id]);
    const stillBlocked = await call('POST', `/api/procurement/po/${withDelivery.body.data.id}/cancel`, users.purchasing, { reason: 'try to cancel it' });
    expect([stillBlocked.status, stillBlocked.body.error_code, stillBlocked.body.error_params.deliveries]).toEqual([409, 'po_has_deliveries', 1]);
    const withInvoice = await call('POST', '/api/procurement/po', users.officer, { supplier_id: s1, project_id: pA, lines: [{ material_id: mCem, quantity: 10, unit_rate: 5 }] });
    await db.query("UPDATE purchase_orders SET status = 'issued' WHERE id = $1", [withInvoice.body.data.id]);
    await db.query("INSERT INTO supplier_invoices (invoice_number, supplier_id, purchase_order_id, total_amount) VALUES ($1, $2, $3, 50)", [`INV-${tag}`, s1, withInvoice.body.data.id]);
    expect((await call('POST', `/api/procurement/po/${withInvoice.body.data.id}/cancel`, users.purchasing, { reason: 'try to cancel it' })).body.error_code).toBe('po_has_invoices');
  });

  // --------------------------------------------------------------------------------------------------
  test('8. spend and vendor performance: exact figures from a built dataset', async () => {
    // an isolated project pair so the figures are only ours
    const projX = await makeProject('X'); const projY = await makeProject('Y');
    const supA = await makeSupplier('perfA'); const supB = await makeSupplier('perfB');
    const mA = await makeItem('PERF-A', `catA-${tag}`); const mB = await makeItem('PERF-B', `catB-${tag}`);
    const po = async (supplier, project, status, needed, issued, lines) => {
      const id = (await one("INSERT INTO purchase_orders (order_number, supplier_id, project_id, status, needed_by, issued_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id",
        [`PO-PERF-${tag}-${Math.random().toString(36).slice(2, 7)}`, supplier, project, status, needed, issued])).id;
      const ids = [];
      for (const l of lines) ids.push((await one('INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, delivered_quantity, unit_rate, discount) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [id, l.m, l.qty, l.delivered || 0, l.rate, l.discount || 0])).id);
      return { id, lines: ids };
    };
    const today = dateIn(0);
    const po1 = await po(supA, projX, 'closed', dateIn(-8), `${dateIn(-10)}T08:00:00Z`, [{ m: mA, qty: 10, delivered: 10, rate: 100 }, { m: mB, qty: 5, delivered: 5, rate: 40, discount: 20 }]);   // 1000 + 180
    const po2 = await po(supA, projY, 'issued', dateIn(-3), `${dateIn(-6)}T08:00:00Z`, [{ m: mA, qty: 2, delivered: 1, rate: 50 }]);                                                                      // 100
    const po3 = await po(supB, projX, 'partially_delivered', dateIn(5), `${dateIn(-4)}T08:00:00Z`, [{ m: mB, qty: 10, delivered: 4, rate: 25 }]);                                                      // 250
    await po(supA, projX, 'draft', null, `${dateIn(-1)}T08:00:00Z`, [{ m: mA, qty: 100, rate: 100 }]);                                                                                          // not live
    await po(supB, projX, 'cancelled', null, `${dateIn(-1)}T08:00:00Z`, [{ m: mA, qty: 100, rate: 100 }]);                                                                                     // not live
    const delivery = (poId, supplier, date) => db.query('INSERT INTO deliveries (delivery_number, purchase_order_id, supplier_id, delivery_date) VALUES ($1, $2, $3, $4)', [`D-${tag}-${Math.random().toString(36).slice(2, 7)}`, poId, supplier, date]);
    await delivery(po1.id, supA, dateIn(-9));        // needed -8: on time
    await delivery(po2.id, supA, dateIn(-1));        // needed -3: late
    await delivery(po3.id, supB, today);             // needed +5: on time
    const mir = async (supplier, project, status, accepted, rejected, inspected, material) => {
      const id = (await one("INSERT INTO material_inspection_requests (mir_number, supplier_id, project_id, status) VALUES ($1, $2, $3, $4) RETURNING id", [`MIR-${tag}-${Math.random().toString(36).slice(2, 7)}`, supplier, project, status])).id;
      await db.query('INSERT INTO mir_lines (mir_id, material_id, quantity, accepted_quantity, rejected_quantity) VALUES ($1, $2, $3, $4, $5)', [id, material, inspected, accepted, rejected]);
    };
    await mir(supA, projX, 'partially_accepted', 8, 2, 10, mA);
    await mir(supA, projY, 'accepted', 5, 0, 5, mA);
    await mir(supA, projY, 'pending', 0, 0, 7, mA);             // undecided: not counted
    await mir(supB, projX, 'accepted', 4, 0, 4, mB);
    const invoice = async (supplier, poRow, status, lines, withException) => {
      const id = (await one('INSERT INTO supplier_invoices (invoice_number, supplier_id, purchase_order_id, status, total_amount) VALUES ($1, $2, $3, $4, 0) RETURNING id', [`SI-${tag}-${Math.random().toString(36).slice(2, 7)}`, supplier, poRow, status])).id;
      for (const l of lines) await db.query('INSERT INTO supplier_invoice_lines (supplier_invoice_id, material_id, quantity, unit_price, line_total) VALUES ($1, $2, 1, $3, $3)', [id, l.m, l.total]);
      if (withException) await db.query("INSERT INTO ap_review_queue (supplier_invoice_id, exception_type) VALUES ($1, 'price_variance')", [id]);
    };
    await invoice(supA, po1.id, 'approved', [{ m: mA, total: 1000 }, { m: mB, total: 180 }], false);
    await invoice(supA, po2.id, 'approved', [{ m: mA, total: 60 }], true);
    await invoice(supA, po2.id, 'received', [{ m: mA, total: 999 }], false);       // not approved: not invoiced spend
    await invoice(supB, po3.id, 'paid', [{ m: mB, total: 100 }], false);
    const rfq = await db.transaction((c) => svc.createRfq(c.query.bind(c), { project_id: projX, title: 'perf', lines: [{ material_id: mA, quantity: 1 }], created_by: users.owner.id }));
    await db.transaction((c) => svc.inviteVendors(c.query.bind(c), rfq.id, [supA, supB]));
    await db.query('INSERT INTO supplier_quotations (rfq_id, supplier_id, total_price, awarded) VALUES ($1, $2, 10, true)', [rfq.id, supA]);

    const win = { from: dateIn(-30), to: today };
    const byProject = await analytics.spend(db.query, { group_by: 'project', ...win, projectIds: [projX, projY] });
    const rowOf = (res, key) => res.rows.find((r) => r.key === key);
    expect(rowOf(byProject, projX)).toMatchObject({ committed: 1430, delivered_value: 1000 + 200 + 100, invoiced: 1280, orders: 2 });   // po1 1180 + po3 250; invoiced 1180 + 100
    expect(rowOf(byProject, projY)).toMatchObject({ committed: 100, delivered_value: 50, invoiced: 60, orders: 1 });
    expect(byProject.totals).toMatchObject({ committed: 1530, invoiced: 1340, orders: 3 });
    const byCategory = await analytics.spend(db.query, { group_by: 'category', ...win, projectIds: [projX, projY] });
    expect(rowOf(byCategory, `catA-${tag}`)).toMatchObject({ committed: 1100, invoiced: 1060 });
    expect(rowOf(byCategory, `catB-${tag}`)).toMatchObject({ committed: 430, invoiced: 280 });
    const bySupplier = await analytics.spend(db.query, { group_by: 'supplier', ...win, projectIds: [projX, projY] });
    expect(rowOf(bySupplier, supA)).toMatchObject({ committed: 1280, invoiced: 1240 });
    expect(rowOf(bySupplier, supB)).toMatchObject({ committed: 250, invoiced: 100 });
    // the window is applied: everything is older than yesterday...
    expect((await analytics.spend(db.query, { group_by: 'project', from: dateIn(-3), to: today, projectIds: [projX, projY] })).totals.committed).toBe(0);

    const perf = await analytics.vendorPerformance(db.query, { ...win, projectIds: [projX, projY] });
    const a = perf.rows.find((r) => r.supplier_id === supA); const b = perf.rows.find((r) => r.supplier_id === supB);
    expect(a).toMatchObject({ po_count: 2, po_value: 1280, deliveries: 2, on_time_rate: 0.5, inspected_quantity: 15, accepted_quantity: 13, rejected_quantity: 2, invoices: 3, invoices_with_exceptions: 1, rfqs_invited: 1, quotations_submitted: 1, quotations_awarded: 1, response_rate: 1, win_rate: 1 });
    expect(a.acceptance_rate).toBeCloseTo(13 / 15, 3);
    expect(a.exception_rate).toBeCloseTo(1 / 3, 3);
    expect(a.avg_lead_days).toBe(3);                                     // PO1: issued -10, first delivery -9 = 1 day; PO2: -6 -> -1 = 5 days; mean 3
    expect(b).toMatchObject({ po_count: 1, po_value: 250, on_time_rate: 1, acceptance_rate: 1, exception_rate: 0, response_rate: 0 });
    expect(b.score).toBeCloseTo((1 + 1 + 1 + 0) / 4, 3);
    expect((await analytics.vendorPerformance(db.query, { ...win, supplier_id: supB, projectIds: [projX, projY] })).rows.map((r) => r.supplier_id)).toEqual([supB]);
    await expect(analytics.spend(db.query, { group_by: 'colour' })).rejects.toMatchObject({ error_code: 'group_by_invalid' });
    await expect(analytics.spend(db.query, { from: '2026-13-45x' })).rejects.toMatchObject({ error_code: 'date_invalid' });
    await expect(analytics.spend(db.query, { from: '2026-02-01', to: '2026-01-01' })).rejects.toMatchObject({ error_code: 'date_range_inverted' });
    made.perf = { projX, projY };
  });

  test('9. role matrix: internal API and /api/v1 agree; analytics need see_supplier_value; project-bound seat is scoped', async () => {
    const rfq = (await makeRfq()).rfq;
    const targets = [
      (u) => call('GET', '/api/procurement/analytics/spend?group_by=supplier', u),
      (u) => call('GET', '/api/v1/purchase-orders/analytics/spend?group_by=supplier', u),
      (u) => call('GET', '/api/procurement/analytics/vendor-performance', u),
      (u) => call('GET', '/api/v1/purchase-orders/analytics/vendor-performance', u),
      (u) => call('GET', `/api/procurement/rfq/${rfq.id}`, u),
      (u) => call('GET', `/api/v1/rfqs/${rfq.id}`, u),
      (u) => call('GET', '/api/procurement/rfq', u),
      (u) => call('GET', '/api/v1/rfqs', u),
    ];
    for (const [who, expected] of Object.entries({ owner: 200, purchasing: 200, officer: 200, keeper: 403, client: 403, fresh: 403 })) {
      for (const [i, t] of targets.entries()) expect([who, i, (await t(users[who])).status]).toEqual([who, i, expected]);
    }
    // writes: cancel needs void, decide needs approve, recommend needs create; v1 mirrors them
    const pr = (await call('POST', '/api/procurement/pr', users.officer, { title: 'matrix', project_id: pA, lines: [{ material_id: mCem, quantity: 1, estimated_unit_price: 1 }] })).body.data;
    const cancelV1 = (u) => call('POST', `/api/v1/purchase-requisitions/${pr.id}/cancel`, u, { reason: 'matrix check' });
    expect((await cancelV1(users.officer)).status).toBe(403);
    expect((await cancelV1(users.keeper)).status).toBe(403);
    expect((await cancelV1(users.client)).status).toBe(403);
    expect((await cancelV1(users.purchasing)).status).toBe(200);
    expect((await call('PUT', `/api/v1/purchase-requisitions/${pr.id}`, users.officer, { title: 'x' })).status).toBe(409);   // cancelled now: typed refusal through v1
    const rfq2 = await makeRfq();
    const rec = (u) => call('POST', `/api/v1/rfqs/${rfq2.rfq.id}/award-recommendations`, u, { quotation_id: rfq2.q1, basis: 'comparison', justification: 'highest commercial score among compliant quotes' });
    expect((await rec(users.keeper)).status).toBe(403);
    expect((await rec(users.fresh)).status).toBe(403);
    expect((await rec(users.officer)).status).toBe(201);
    // a project-bound seat: analytics only cover its own project, and another project's RFQ/recommendation is out of reach
    const spendA = await call('GET', '/api/procurement/analytics/spend?group_by=project', users.officerA);
    expect(spendA.status).toBe(200);
    expect(spendA.body.data.rows.every((r) => r.key === pA)).toBe(true);
    const rfqB = (await makeRfq(pB)).rfq;
    expect((await call('GET', `/api/procurement/rfq/${rfqB.id}`, users.officerA)).status).toBe(403);
    expect((await call('GET', `/api/procurement/rfq/${rfq.id}`, users.officerA)).status).toBe(200);
    const recB = (await call('POST', `/api/procurement/rfq/${rfqB.id}/award-recommendations`, users.owner, { quotation_id: (await one('SELECT id FROM supplier_quotations WHERE rfq_id = $1 AND supplier_id = $2', [rfqB.id, s1])).id, basis: 'comparison', justification: 'highest commercial score among compliant quotes' })).body.data;
    expect((await call('GET', `/api/procurement/award-recommendations/${recB.id}`, users.officerA)).status).toBe(403);
    expect((await call('POST', `/api/procurement/award-recommendations/${recB.id}/submit`, users.officerA)).status).toBe(403);
    expect((await call('GET', '/api/procurement/analytics/spend?group_by=nonsense', users.owner)).body.error_code).toBe('group_by_invalid');
  });
});
