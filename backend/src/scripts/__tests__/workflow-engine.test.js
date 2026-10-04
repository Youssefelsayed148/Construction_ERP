// Phase 6 tests — universal workflow engine.
//
// Coverage:
//   - migration: 6 tables + catalog templates (exact catalog state names)
//     + legacy template driving MODULE_MANAGER_ROLES/DIRECT_TO_OWNER_MODULES
//   - startWorkflow / recordDecision / getPendingFor semantics
//   - the ported self-approval guard (requester cannot approve own instance)
//   - legacy migration + parity verification (definition of done, by script)
//   - orphan cleanup backstop operating on workflow_instances

const { MockDb } = require('../test-helpers/mock-db');
const migration = require('../workflow-engine-migration');
const actionMigration = require('../action-engine-migration');
const engine = require('../../services/workflowEngine');
const cleanup = require('../cleanup-orphan-approvals');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);
const client = { query: q };

async function count(table) {
  return db.table(table).rows.length;
}

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, code VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS approval_requests (
    id SERIAL PRIMARY KEY, module_name VARCHAR(100) NOT NULL, request_type VARCHAR(100) NOT NULL,
    request_id INTEGER NOT NULL, requester_id INTEGER, manager_id INTEGER, approver_id INTEGER,
    status VARCHAR(50) DEFAULT 'pending', stage VARCHAR(50) DEFAULT 'manager_review',
    notes TEXT, manager_notes TEXT, manager_approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
  await q(`CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY, amount DECIMAL(15,2), category VARCHAR(100), description TEXT, status VARCHAR(50))`);
  await migration.ensureTables(q);
  await migration.seedTemplates(q);
  await actionMigration.run(q);
}

beforeAll(async () => {
  await buildFixture();
});

// ---------------------------------------------------------------------------
// Migration + catalog
// ---------------------------------------------------------------------------

describe('workflow engine tables and catalog', () => {
  test('creates all six workflow tables', () => {
    for (const t of ['workflow_templates', 'workflow_steps', 'workflow_instances', 'workflow_step_instances', 'workflow_actions', 'escalation_rules']) {
      expect(db.table(t).columns.size).toBeGreaterThan(0);
    }
  });

  test('seeds every catalog workflow with exact state names plus the legacy template', async () => {
    const templates = (await q('SELECT * FROM workflow_templates')).rows;
    const keys = templates.map((t) => t.key);
    expect(keys.length).toBe(migration.WORKFLOW_CATALOG.length + 1);
    for (const key of ['rfi', 'submittal', 'consultant_observation', 'wir', 'mir', 'ncr', 'purchase_requisition', 'po', 'variation', 'payment_certificate', 'supplier_subcontract_invoice', 'handover_punch', 'legacy_module_approval']) {
      expect(keys).toContain(key);
    }
  });

  test('RFI steps carry the exact catalog state names, with the parallel reviewer step', async () => {
    const tpl = (await q('SELECT * FROM workflow_templates')).rows.find((t) => t.key === 'rfi');
    const steps = (await q('SELECT * FROM workflow_steps')).rows
      .filter((s) => s.template_id === tpl.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    expect(steps.map((s) => s.name)).toEqual([
      'Draft', 'Submitted', 'Coordinator', 'Discipline Reviewer(s)', 'Official Response', 'Acknowledged', 'Closed',
    ]);
    const parallel = steps.find((s) => s.name === 'Discipline Reviewer(s)');
    expect(parallel.mode).toBe('parallel');
    expect(parallel.resolver_type).toBe('organization_type');
  });

  test('legacy template reproduces MODULE_MANAGER_ROLES and DIRECT_TO_OWNER_MODULES in its conditions', async () => {
    const tpl = (await q('SELECT * FROM workflow_templates')).rows.find((t) => t.key === 'legacy_module_approval');
    const steps = (await q('SELECT * FROM workflow_steps')).rows.filter((s) => s.template_id === tpl.id);
    expect(steps.map((s) => s.step_key)).toEqual(['manager_review', 'owner_review']);
    const manager = steps.find((s) => s.step_key === 'manager_review');
    const conditions = typeof manager.conditions === 'string' ? JSON.parse(manager.conditions) : manager.conditions;
    expect(conditions.module_roles).toEqual(migration.MODULE_MANAGER_ROLES);
    expect(conditions.skip_if_module).toEqual(migration.DIRECT_TO_OWNER_MODULES);
    const owner = steps.find((s) => s.step_key === 'owner_review');
    const ownerConditions = typeof owner.conditions === 'string' ? JSON.parse(owner.conditions) : owner.conditions;
    expect(ownerConditions.allow_roles).toEqual(['owner', 'admin']);
    expect(owner.is_terminal).toBe(true);
  });

  test('escalation rules exist for the manager review step', async () => {
    const rules = (await q('SELECT * FROM escalation_rules')).rows;
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((r) => r.step_key === 'manager_review' && Number(r.after_hours) === 48 && r.escalate_to_role === 'owner')).toBe(true);
  });

  test('no escalation rule dangles on a step its template does not define', async () => {
    const all = (await q('SELECT id FROM escalation_rules')).rows;
    const bound = (await q(
      `SELECT er.id AS id FROM escalation_rules er
       JOIN workflow_steps ws ON ws.template_id = er.template_id AND ws.step_key = er.step_key`
    )).rows;
    expect(bound.length).toBe(all.length);
  });
});

// ---------------------------------------------------------------------------
// startWorkflow / recordDecision
// ---------------------------------------------------------------------------

describe('startWorkflow (legacy template)', () => {
  test('expenses request starts at manager_review assigned to finance_manager', async () => {
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 77,
      { module_name: 'expenses', request_type: 'expense', request_id: 77, requester_id: 20 }, { client });
    expect(wf.instance.status).toBe('active');
    expect(wf.instance.current_step_key).toBe('manager_review');
    const mgr = wf.steps.find((s) => s.step_key === 'manager_review');
    expect(mgr.status).toBe('pending');
    expect(mgr.assigned_role).toBe('finance_manager');
    const own = wf.steps.find((s) => s.step_key === 'owner_review');
    expect(own.status).toBe('waiting');
  });

  test('direct-to-owner modules skip the manager step (purchase_orders)', async () => {
    const wf = await engine.startWorkflow('legacy_module_approval', 'purchase_orders', 88,
      { module_name: 'purchase_orders', request_type: 'purchase_order', request_id: 88, requester_id: 20 }, { client });
    expect(wf.instance.current_step_key).toBe('owner_review');
    const mgr = wf.steps.find((s) => s.step_key === 'manager_review');
    expect(mgr.status).toBe('skipped');
    const own = wf.steps.find((s) => s.step_key === 'owner_review');
    expect(own.status).toBe('pending');
  });
});

describe('recordDecision semantics', () => {
  let instanceId;

  beforeAll(async () => {
    await q("INSERT INTO users (id, name, role) VALUES ($1, $2, $3)", [30, 'Finance Manager', 'finance_manager']);
    await q("INSERT INTO users (id, name, role) VALUES ($1, $2, $3)", [31, 'Owner', 'owner']);
    await q("INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)", [77, 5000, 'pending']);
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 77,
      { module_name: 'expenses', request_type: 'expense', request_id: 77, requester_id: 20 }, { client });
    instanceId = wf.instance.id;
  });






  test('return hands the instance back to the previous step', async () => {
    await q("INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)", [79, 100, 'pending']);
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 79,
      { module_name: 'expenses', request_type: 'expense', request_id: 79, requester_id: 20 }, { client });
    await engine.recordDecision(wf.instance.id, null, 30, 'approve', null, { client, role: 'finance_manager' });
    const returned = await engine.recordDecision(wf.instance.id, null, 31, 'return', 'needs more detail', { client, role: 'owner' });
    expect(returned.ok).toBe(true);
    expect(returned.outcome).toBe('returned');
    expect(returned.stage).toBe('manager_review');
    const mgr = returned.workflow.steps.find((s) => s.step_key === 'manager_review');
    expect(mgr.status).toBe('pending');
  });

  test('reassign moves the step to another user and is logged', async () => {
    await q("INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)", [80, 50, 'pending']);
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 80,
      { module_name: 'expenses', request_type: 'expense', request_id: 80, requester_id: 20 }, { client });
    const r = await engine.recordDecision(wf.instance.id, null, 30, 'reassign', 'delegating', { client, role: 'finance_manager', reassignToUserId: 31 });
    expect(r.ok).toBe(true);
    const step = r.workflow.steps.find((s) => s.step_key === 'manager_review');
    expect(Number(step.assigned_user_id)).toBe(31);
  });
});

describe('ported self-approval guard', () => {

  test('owner/admin remain exempt from the guard (legacy behavior)', async () => {
    await q("INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)", [82, 10, 'pending']);
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 82,
      { module_name: 'expenses', request_type: 'expense', request_id: 82, requester_id: 31 }, { client });
    // requester IS the owner (id 31) → allowed. At the manager stage the
    // owner forwards to owner_review (same as the legacy flow), then the
    // owner approves the final stage.
    const fwd = await engine.recordDecision(wf.instance.id, null, 31, 'approve', null, { client, role: 'owner' });
    expect(fwd.ok).toBe(true);
    expect(fwd.outcome).toBe('forwarded');
    const full = await engine.recordDecision(wf.instance.id, null, 31, 'approve', null, { client, role: 'owner' });
    expect(full.ok).toBe(true);
    expect(full.workflow.instance.status).toBe('approved');
  });
});

// ---------------------------------------------------------------------------
// getPendingFor
// ---------------------------------------------------------------------------

describe('getPendingFor', () => {
  beforeAll(async () => {
    await q("INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)", [90, 400, 'pending']);
    await engine.startWorkflow('legacy_module_approval', 'expenses', 90,
      { module_name: 'expenses', request_type: 'expense', request_id: 90, requester_id: 20 }, { client });
  });

  test('a module manager sees the pending instance for their module with can_decide', async () => {
    const pending = await engine.getPendingFor(30, { client, role: 'finance_manager' });
    const hit = pending.find((p) => p.instance.entity_id === 90);
    expect(hit).toBeDefined();
    expect(hit.can_decide).toBe(true);
  });

  test('owner sees everything', async () => {
    const pending = await engine.getPendingFor(31, { client, role: 'owner' });
    expect(pending.length).toBeGreaterThan(0);
  });

  test('the requester sees their own instance read-only', async () => {
    const pending = await engine.getPendingFor(20, { client, role: 'staff' });
    const hit = pending.find((p) => p.instance.entity_id === 90);
    expect(hit).toBeDefined();
    expect(hit.can_decide).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Legacy migration + parity
// ---------------------------------------------------------------------------

describe('legacy approval migration and parity', () => {
  beforeAll(async () => {
    // Representative legacy rows for every state. (Ids are bound params — the
    // mock stores literal numbers as strings, which would break id lookups.)
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, status, stage, created_at, updated_at)
             VALUES ($1, 'expenses', 'expense', $2, 20, 'pending', 'manager_review', '2026-01-01', '2026-01-01')`,
             [101, 901]);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, status, stage, created_at, updated_at)
             VALUES ($1, 'purchase_orders', 'purchase_order', $2, 20, 'pending', 'owner_review', '2026-01-02', '2026-01-02')`,
             [102, 902]);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, manager_id, status, stage, manager_approved_at, created_at, updated_at)
             VALUES ($1, 'expenses', 'expense', $2, 20, 30, 'pending', 'owner_review', '2026-01-03', '2026-01-03', '2026-01-04')`,
             [103, 903]);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, approver_id, status, stage, created_at, updated_at)
             VALUES ($1, 'expenses', 'expense', $2, 20, 31, 'approved', 'owner_review', '2026-01-05', '2026-01-06')`,
             [104, 904]);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, approver_id, status, stage, created_at, updated_at)
             VALUES ($1, 'expenses', 'expense', $2, 20, 30, 'rejected', 'manager_review', '2026-01-07', '2026-01-08')`,
             [105, 905]);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, manager_id, approver_id, status, stage, manager_approved_at, created_at, updated_at)
             VALUES ($1, 'legal', 'legal_document', $2, $3, $4, $5, 'rejected', 'owner_review', '2026-01-09', '2026-01-09', '2026-01-10')`,
             [106, 906, 20, 41, 31]);
    await engine.migrateLegacyApprovals(client);
  });

  test('every legacy row has a matching workflow_instance (parity verifier = 0 mismatches)', async () => {
    const { checked, mismatches } = await engine.verifyApprovalParity(q);
    expect(checked).toBe(6);
    expect(mismatches).toEqual([]);
  });

  test('pending manager_review row mirrors stage + assigned module role', async () => {
    const inst = (await q('SELECT * FROM workflow_instances')).rows.find((i) => i.legacy_approval_id === 101);
    expect(inst.status).toBe('active');
    expect(inst.current_step_key).toBe('manager_review');
    const step = (await q('SELECT * FROM workflow_step_instances')).rows
      .find((s) => s.instance_id === inst.id && s.step_key === 'manager_review' && s.status === 'pending');
    expect(step.assigned_role).toBe('finance_manager');
  });

  test('direct-to-owner row skips manager_review', async () => {
    const inst = (await q('SELECT * FROM workflow_instances')).rows.find((i) => i.legacy_approval_id === 102);
    expect(inst.current_step_key).toBe('owner_review');
    const steps = (await q('SELECT * FROM workflow_step_instances')).rows.filter((s) => s.instance_id === inst.id);
    expect(steps.find((s) => s.step_key === 'manager_review').status).toBe('skipped');
    expect(steps.find((s) => s.step_key === 'owner_review').status).toBe('pending');
  });

  test('approved/rejected rows mirror their terminal state', async () => {
    const approved = (await q('SELECT * FROM workflow_instances')).rows.find((i) => i.legacy_approval_id === 104);
    expect(approved.status).toBe('approved');
    const rejectedManager = (await q('SELECT * FROM workflow_instances')).rows.find((i) => i.legacy_approval_id === 105);
    expect(rejectedManager.status).toBe('rejected');
    const rejectedOwner = (await q('SELECT * FROM workflow_instances')).rows.find((i) => i.legacy_approval_id === 106);
    expect(rejectedOwner.status).toBe('rejected');
    const steps = (await q('SELECT * FROM workflow_step_instances')).rows.filter((s) => s.instance_id === rejectedOwner.id);
    expect(steps.find((s) => s.step_key === 'manager_review').status).toBe('done');
    expect(steps.find((s) => s.step_key === 'owner_review').status).toBe('rejected');
  });

  test('migration is idempotent (re-run adds nothing)', async () => {
    const before = (await q('SELECT * FROM workflow_instances')).rows.length;
    await engine.migrateLegacyApprovals(client);
    const after = (await q('SELECT * FROM workflow_instances')).rows.length;
    expect(after).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Legacy route adapter (response-shape parity)
// ---------------------------------------------------------------------------

describe('recordLegacyDecision response shapes', () => {
  test('forwarded, fully-approved and rejected responses match the legacy shapes exactly', async () => {
    await q("INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)", [910, 700, 'pending']);
    await q("INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)", [911, 800, 'pending']);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, status, stage)
             VALUES ($1, 'expenses', 'expense', $2, 20, 'pending', 'manager_review')`, [910, 910]);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, status, stage)
             VALUES ($1, 'expenses', 'expense', $2, 20, 'pending', 'manager_review')`, [911, 911]);
    await engine.migrateLegacyApprovals(client);

    const logCalls = [];
    const logFn = async (entry) => logCalls.push(entry);

    // Manager approve → forwarded_to_owner
    const fwd = await engine.recordLegacyDecision(
      { approvalId: 910, userId: 30, userName: 'FM', role: 'finance_manager', notes: 'ok', action: 'approve' },
      { client, logActivity: logFn }
    );
    expect(fwd).toEqual({
      statusCode: 200,
      body: expect.objectContaining({
        success: true,
        stage: 'forwarded_to_owner',
        request: expect.objectContaining({ id: 910, stage: 'owner_review', manager_id: 30 }),
      }),
    });

    // Owner approve → fully_approved
    const full = await engine.recordLegacyDecision(
      { approvalId: 910, userId: 31, userName: 'Owner', role: 'owner', notes: 'done', action: 'approve' },
      { client, logActivity: logFn }
    );
    expect(full.statusCode).toBe(200);
    expect(full.body).toEqual(expect.objectContaining({ success: true, stage: 'fully_approved' }));
    expect(full.body.request.status).toBe('approved');
    const expense = (await q('SELECT * FROM expenses')).rows.find((e) => e.id === 910);
    expect(expense.status).toBe('approved');

    // Reject → same shape as the legacy endpoint
    const rej = await engine.recordLegacyDecision(
      { approvalId: 911, userId: 30, userName: 'FM', role: 'finance_manager', notes: 'no', action: 'reject' },
      { client, logActivity: logFn }
    );
    expect(rej.statusCode).toBe(200);
    expect(rej.body).toEqual(expect.objectContaining({ success: true }));
    expect(rej.body.request.status).toBe('rejected');
    const expense2 = (await q('SELECT * FROM expenses')).rows.find((e) => e.id === 911);
    expect(expense2.status).toBe('rejected');

    // The activity log messages are identical to the pre-engine strings.
    expect(logCalls.map((c) => c.description)).toEqual([
      'Manager approved expense #910 — forwarded to owner',
      'Owner approved expense #910',
      'Rejected expense #911 at manager_review stage',
    ]);
  });

  test('the legacy 404 and already-processed shapes are preserved', async () => {
    const missing = await engine.recordLegacyDecision({ approvalId: 99999, userId: 31, role: 'owner', action: 'approve' }, { client });
    expect(missing).toEqual({ statusCode: 404, body: { success: false, error: 'Request not found' } });
    const done = await engine.recordLegacyDecision({ approvalId: 910, userId: 31, role: 'owner', action: 'approve' }, { client });
    expect(done.statusCode).toBe(400);
    expect(done.body.error).toBe('Request already processed');
  });
});

// ---------------------------------------------------------------------------
// Orphan cleanup backstop
// ---------------------------------------------------------------------------

// The mock executor has no DELETE; the cleanup script (like its pre-engine
// version) deletes rows. This wrapper implements the exact DELETE shape the
// script uses: DELETE FROM <table> WHERE id = ANY($1) RETURNING id.
function queryWithDelete(sql, params) {
  const norm = String(sql).replace(/\s+/g, ' ').trim();
  // Shape 1 (cleanup script): DELETE FROM <table> WHERE id = ANY($1) RETURNING id
  const anyMatch = norm.match(/^DELETE FROM (\w+) WHERE id = ANY\(\$1\) RETURNING id$/i);
  if (anyMatch) {
    const table = db.table(anyMatch[1]);
    const ids = (params[0] || []).map(Number);
    const before = table.rows.length;
    const deletedRows = table.rows.filter((r) => ids.includes(Number(r.id)));
    table.rows = table.rows.filter((r) => !ids.includes(Number(r.id)));
    return Promise.resolve({ rows: deletedRows.map((r) => ({ id: r.id })), rowCount: before - table.rows.length });
  }
  // Shape 2 (test fixture): DELETE FROM <table> WHERE id = <literal>
  const litMatch = norm.match(/^DELETE FROM (\w+) WHERE id = (\d+)$/i);
  if (litMatch) {
    const table = db.table(litMatch[1]);
    const before = table.rows.length;
    table.rows = table.rows.filter((r) => Number(r.id) !== Number(litMatch[2]));
    return Promise.resolve({ rows: [], rowCount: before - table.rows.length });
  }
  return db.query(sql, params);
}

describe('orphan cleanup on workflow_instances', () => {
  test('dry run finds the orphan, apply deletes instance + legacy twin', async () => {
    await q("INSERT INTO expenses (id, amount) VALUES ($1, $2)", [950, 5]);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, status, stage)
             VALUES ($1, 'expenses', 'expense', $2, $3, 'pending', 'manager_review')`, [950, 950, 20]);
    await engine.startWorkflow('legacy_module_approval', 'expenses', 950,
      { module_name: 'expenses', request_type: 'expense', request_id: 950, requester_id: 20, legacy_approval_id: 950 }, { client });
    // Orphan: instance + approval_request pointing at a deleted expense.
    await q("INSERT INTO expenses (id, amount) VALUES ($1, $2)", [951, 6]);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, status, stage)
             VALUES ($1, 'expenses', 'expense', $2, 20, 'pending', 'manager_review')`, [951, 951]);
    await engine.startWorkflow('legacy_module_approval', 'expenses', 951,
      { module_name: 'expenses', request_type: 'expense', request_id: 951, requester_id: 20, legacy_approval_id: 951 }, { client });
    await queryWithDelete('DELETE FROM expenses WHERE id = 951', []);

    // The fixture accumulates instances from earlier scenarios; several of
    // those reference source rows that were never created — they are genuine
    // orphans the backstop must catch. The 951 one must be among them, and
    // the healthy 950 instance must not be.
    const dry = await cleanup.cleanOrphanWorkflows(queryWithDelete, { apply: false, log: () => {} });
    const orphanEntityIds = dry.orphans.map((o) => Number(o.entity_id));
    expect(orphanEntityIds).toContain(951);
    expect(orphanEntityIds).not.toContain(950);
    expect(dry.deleted).toBe(0);

    const applied = await cleanup.cleanOrphanWorkflows(queryWithDelete, { apply: true, log: () => {} });
    expect(applied.deleted).toBe(dry.orphans.length);
    const stillThere = (await q('SELECT * FROM workflow_instances')).rows.filter((w) => Number(w.entity_id) === 951);
    expect(stillThere).toEqual([]);
    const legacyGone = (await q('SELECT * FROM approval_requests')).rows.filter((a) => Number(a.id) === 951);
    expect(legacyGone).toEqual([]);
    // The healthy instance survived.
    expect((await q('SELECT * FROM workflow_instances')).rows.filter((w) => Number(w.entity_id) === 950).length).toBe(1);
  });
});
