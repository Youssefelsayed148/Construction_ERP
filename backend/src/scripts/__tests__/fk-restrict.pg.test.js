// Real PostgreSQL + real app. Phase 2.5b: financial, procurement, contractual, inventory and handover rows are
// never removed by a cascade. Reproduced first: deleting a purchase order, an invoice, a warehouse, a work order,
// a BOQ item or a project silently deleted every dependent row (163 ON DELETE CASCADE foreign keys).
process.env.AUTH_RATE_LIMIT_PER_15_MIN = '1000';
process.env.V1_RATE_LIMIT_PER_MIN = '100000';
const tokens = require('../../services/tokens');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;

// Child tables that must never lose rows because a parent was deleted.
const PROTECTED = [
  // procurement
  'bid_comparisons', 'deliveries', 'delivery_lines', 'grn_lines', 'mir_lines', 'purchase_order_lines', 'purchase_orders',
  'purchase_request_lines', 'purchase_requests', 'rfq_lines', 'rfq_vendors', 'supplier_invoice_lines', 'supplier_invoices',
  'supplier_quotation_lines', 'supplier_quotations', 'supplier_return_lines',
  // inventory ledger and projection
  'stock_movements', 'stock_reservations', 'warehouse_stock', 'inventory_transfer_items',
  // financial
  'advance_ledger', 'ap_review_queue', 'budget_changes', 'commitments', 'commercial_snapshots', 'journal_entry_lines',
  'payment_allocations', 'payment_certificates', 'payroll_details', 'project_budgets', 'receivable_reminders', 'retention_ledger',
  'variation_cost_buildup', 'variation_lines', 'variations',
  // contractual
  'boq_items', 'boq_sections', 'boq_location_allocations', 'client_contracts', 'contract_lines', 'engineer_instructions',
  'sub_contract_changes', 'sub_contract_lines', 'warranty_claims', 'quantity_measurements',
  // handover
  'handover_package_items', 'handover_processes',
  // cost-bearing work order records
  'work_order_materials', 'work_order_labor', 'work_order_equipment', 'work_completions',
  // documents whose links used to be SET NULL when a parent went away
  'payments', 'invoices', 'work_orders',
];

describePg('foreign keys protect financial, procurement and contractual rows (real PostgreSQL, real app)', () => {
  let app; let server; let base; let db; let owner;
  const tag = String(Date.now()).slice(-7);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body: json };
  };

  beforeAll(async () => {
    ({ app } = require('../../../server'));
    db = require('../../config/database');
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
    const row = await one("INSERT INTO users (name, email, password, role) VALUES ('fk-owner', $1, 'x', 'owner') RETURNING id, token_version", [`fk-${tag}@test.io`]);
    await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [row.id]);
    owner = { id: row.id, token: tokens.signSession({ userId: row.id, tokenVersion: row.token_version }) };
  });
  afterAll(async () => {
    await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [owner.id]);
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [owner.id]);
    await new Promise((resolve) => server.close(resolve));
    await db.pool.end();
  });

  test('no foreign key from a protected table cascades or sets null (except to users, policy in 2.5c)', async () => {
    const rows = (await db.query(
      `SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent, conname, confdeltype
         FROM pg_constraint WHERE contype = 'f' AND confdeltype IN ('c', 'n') AND conrelid::regclass::text = ANY($1)
          AND confrelid::regclass::text <> 'users' ORDER BY 1, 2`, [PROTECTED])).rows;
    expect(rows).toEqual([]);
  });

  test('every protected table name exists (the list cannot rot)', async () => {
    const found = (await db.query('SELECT relname FROM pg_class WHERE relkind = $1 AND relname = ANY($2)', ['r', PROTECTED])).rows.map((r) => r.relname);
    expect(found.sort()).toEqual([...PROTECTED].sort());
  });

  test('every remaining cascade is a classified child (new cascades must be added here on purpose)', async () => {
    const remaining = (await db.query(
      `SELECT DISTINCT conrelid::regclass::text AS child FROM pg_constraint WHERE contype = 'f' AND confdeltype = 'c' ORDER BY 1`)).rows.map((r) => r.child);
    // Configuration, workflow engine internals, quality/HSE registers, templates, schedule, documents, links.
    // These hold no ledger value; deleting their parent may remove them.
    const ALLOWED = new Set([
      'activity_relationships', 'asset_register', 'baselines', 'buildings', 'calendars', 'calibration_records', 'checklist_instances',
      'checklist_templates', 'corrective_actions', 'correspondence', 'correspondence_history', 'document_numbering_sequences', 'document_number_sequences',
      'document_versions', 'emergency_drills', 'equipment_assignments', 'equipment_inspections', 'equipment_usage_logs', 'escalation_rules',
      'hse_inspections', 'incidents', 'inductions', 'itp_points', 'itps', 'jsas', 'material_recipes', 'material_requirements', 'mock_ups', 'ncrs',
      'near_misses', 'numbering_sequences', 'observation_comments', 'observation_status_history', 'observations', 'organization_contacts',
      'organization_documents', 'organization_users', 'permits', 'photos', 'portal_submissions', 'ppe_records', 'preventive_actions',
      'project_dashboard_preferences', 'project_documents', 'project_folders', 'project_locations', 'project_milestones',
      'project_numbering_settings', 'project_participant_users', 'project_participants', 'project_phases', 'project_registers', 'project_rfis',
      'project_submittals', 'project_team', 'project_workflows', 'punch_items', 'quality_tests', 'recipe_lines', 'replenishment_alerts', 'rfi_responses',
      'risk_assessments', 'role_permissions', 'saved_views', 'schedule_activities', 'scheduled_report_runs', 'scheduled_reports', 'site_daily_reports',
      'site_visits', 'sticky_notes', 'submittal_revisions', 'supplier_materials', 'template_approval_rules', 'template_folders', 'template_locations',
      'template_wbs', 'template_workflows', 'toolbox_talks', 'transmittal_items', 'transmittals', 'units', 'user_project_roles', 
      'wbs_nodes', 'webhook_deliveries', 'wirs', 'work_packages', 'workflow_actions', 'workflow_step_instances', 'workflow_steps',
    ]);
    const unclassified = remaining.filter((t) => !ALLOWED.has(t));
    expect(unclassified).toEqual([]);
  });

  test('deleting a purchase order with lines is refused by the database', async () => {
    const supplier = (await one("INSERT INTO suppliers (name_ar, name_en) VALUES ($1, $1) RETURNING id", [`fk-${tag}`])).id;
    const item = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'other', $1, $1, 'piece') RETURNING id", [`FK-${tag}`])).id;
    const po = (await one("INSERT INTO purchase_orders (order_number, supplier_id, status) VALUES ($1, $2, 'issued') RETURNING id", [`FK-PO-${tag}`, supplier])).id;
    await db.query('INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, unit_rate) VALUES ($1, $2, 5, 10)', [po, item]);
    await expect(db.query('DELETE FROM purchase_orders WHERE id = $1', [po])).rejects.toMatchObject({ code: '23503' });
    // the PO -> supplier link used to be SET NULL: deleting the supplier silently detached the order
    await expect(db.query('DELETE FROM suppliers WHERE id = $1', [supplier])).rejects.toMatchObject({ code: '23503' });
    expect((await one('SELECT supplier_id FROM purchase_orders WHERE id = $1', [po])).supplier_id).toBe(supplier);
    expect((await one('SELECT count(*)::int AS n FROM purchase_order_lines WHERE purchase_order_id = $1', [po])).n).toBe(1);
  });

  test('deleting a warehouse that holds stock movements is refused', async () => {
    const item = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'other', $1, $1, 'piece') RETURNING id", [`FKW-${tag}`])).id;
    const wh = (await one("INSERT INTO warehouses (name, name_en, type) VALUES ($1, $1, 'central') RETURNING id", [`fkw-${tag}`])).id;
    await db.query("INSERT INTO stock_movements (warehouse_id, material_id, movement_type, quantity, created_by) VALUES ($1, $2, 'opening', 10, $3)", [wh, item, owner.id]);
    await expect(db.query('DELETE FROM warehouses WHERE id = $1', [wh])).rejects.toMatchObject({ code: '23503' });
  });

  test('deleting an invoice that has payment allocations is refused', async () => {
    const client = (await one('INSERT INTO clients (name_en, name_ar) VALUES ($1, $1) RETURNING id', [`fk-${tag}`])).id;
    const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`fk-${tag}`, `FK${tag}`])).id;
    const inv = (await call('POST', '/api/invoices', { project_id: project, client_id: client, amount: 1000, issue_date: '2026-01-01', due_date: '2099-01-01' })).body.data;
    const pay = (await call('POST', '/api/payments', { invoice_id: inv.id, project_id: project, client_id: client, amount: 400, payment_date: '2026-01-02' })).body.data;
    await expect(db.query('DELETE FROM invoices WHERE id = $1', [inv.id])).rejects.toMatchObject({ code: '23503' });
    await expect(db.query('DELETE FROM payments WHERE id = $1', [pay.id])).rejects.toMatchObject({ code: '23503' });
    // a project with budgets, contracts or invoices cannot be removed either
    await db.query('INSERT INTO project_budgets (project_id, budget_amount) VALUES ($1, 10)', [project]);
    await db.query("INSERT INTO client_contracts (contract_number, project_id, client_id, title, original_value) VALUES ($1, $2, $3, 't', 1000)", [`FK-C-${tag}`, project, client]);
    await expect(db.query('DELETE FROM projects WHERE id = $1', [project])).rejects.toMatchObject({ code: '23503' });
  });

  describe('work orders are cancelled, never deleted', () => {
    const newWorkOrder = async (label) => {
      const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`fkwo-${label}-${tag}`, `FW${label}${tag}`])).id;
      const wo = (await one("INSERT INTO work_orders (project_id, title, title_ar, status) VALUES ($1, 'wo', 'wo', 'planned') RETURNING id", [project])).id;
      const item = (await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'other', $1, $1, 'piece') RETURNING id", [`FKO-${label}-${tag}`])).id;
      await db.query('INSERT INTO work_order_materials (work_order_id, item_id, planned_quantity, actual_quantity, unit_cost, total_cost) VALUES ($1, $2, 5, 5, 10, 50)', [wo, item]);
      return { project, wo };
    };

    test('DELETE cancels the work order and keeps it and its materials', async () => {
      const { wo } = await newWorkOrder('a');
      const res = await call('DELETE', `/api/work-orders/${wo}`, { reason: 'scope removed' });
      expect(res.status).toBe(200);
      const row = await one('SELECT status, cancelled_at, cancelled_by, cancel_reason FROM work_orders WHERE id = $1', [wo]);
      expect(row.status).toBe('cancelled');
      expect(row.cancelled_by).toBe(owner.id);
      expect(row.cancel_reason).toBe('scope removed');
      expect((await one('SELECT count(*)::int AS n FROM work_order_materials WHERE work_order_id = $1', [wo])).n).toBe(1);
      expect((await call('DELETE', `/api/work-orders/${wo}`)).status).toBe(409);
    });

    test('the database refuses to delete a work order that has cost records', async () => {
      const { wo } = await newWorkOrder('b');
      await expect(db.query('DELETE FROM work_orders WHERE id = $1', [wo])).rejects.toMatchObject({ code: '23503' });
    });
  });

  describe('BOQ rows that are referenced are protected, with a readable answer', () => {
    test('an item with measurements answers 409; an unreferenced item can still be removed', async () => {
      const project = (await one("INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id", [`fkb-${tag}`, `FB${tag}`])).id;
      const section = (await one("INSERT INTO boq_sections (project_id, code, name) VALUES ($1, 'S1', 's') RETURNING id", [project])).id;
      const used = (await one("INSERT INTO boq_items (project_id, section_id, code, description, unit, quantity, unit_rate) VALUES ($1, $2, 'I1', 'd', 'm3', 10, 5) RETURNING id", [project, section])).id;
      const free = (await one("INSERT INTO boq_items (project_id, section_id, code, description, unit, quantity, unit_rate) VALUES ($1, $2, 'I2', 'd', 'm3', 10, 5) RETURNING id", [project, section])).id;
      await db.query("INSERT INTO quantity_measurements (project_id, boq_item_id, measured_date, quantity) VALUES ($1, $2, '2026-01-01', 3)", [project, used]);
      const blocked = await call('DELETE', `/api/boq/items/${used}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error).toMatch(/referenced|in use/i);
      expect((await one('SELECT count(*)::int AS n FROM boq_items WHERE id = $1', [used])).n).toBe(1);
      expect((await call('DELETE', `/api/boq/sections/${section}`)).status).toBe(409); // section still has items
      expect((await call('DELETE', `/api/boq/items/${free}`)).status).toBe(200);
    });
  });
});
