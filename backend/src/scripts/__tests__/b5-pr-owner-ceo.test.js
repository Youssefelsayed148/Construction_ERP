// B5 (C-PROC-001): the canonical owner_ceo role must be able to act on
// purchase requisitions through the existing workflow mechanism.
//
// The purchase_requisition template has no owner step (draft -> submit ->
// budget_check(accountant) -> authority_approval(purchasing_mgr) ->
// procurement(purchasing_mgr)). The engine's privileged bypass recognised
// only the LEGACY role keys 'owner' and 'admin', so a user whose role is the
// canonical 'owner_ceo' (the documented per-module mirror of the blanket
// owner, migration 0031) was refused with 403 at every step of PR-00001.
// This suite pins the fix: owner_ceo (and coo, the admin mirror) decide like
// owner/admin; a role with neither the step's resolver role nor privilege
// is still refused.

const { MockDb } = require('../test-helpers/mock-db');
const migration = require('../workflow-engine-migration');
const actionMigration = require('../action-engine-migration');
const engine = require('../../services/workflowEngine');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);
const client = { query: q };

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await migration.ensureTables(q);
  await migration.seedTemplates(q);
  await actionMigration.run(q);
}

async function startPr(requesterId) {
  const wf = await engine.startWorkflow('purchase_requisition', 'purchase_request', 5001,
    { module_name: 'purchase_request', request_type: 'purchase_request', request_id: 5001, requester_id: requesterId },
    { client });
  return wf.instance.id;
}

beforeAll(async () => {
  await buildFixture();
});

describe('canonical owner_ceo acts on purchase requisitions (B5)', () => {
  test('owner_ceo drives a requisition from budget_check through procurement', async () => {
    const instanceId = await startPr(42);
    // The requester (42) completes their own Draft and Submit steps.
    const draft = await engine.recordDecision(instanceId, null, 42, 'approve', null, { client, role: 'owner_ceo', userName: 'CEO Requester' });
    expect(draft.ok).toBe(true);
    const submit = await engine.recordDecision(instanceId, null, 42, 'approve', null, { client, role: 'owner_ceo', userName: 'CEO Requester' });
    expect(submit.ok).toBe(true);
    expect(submit.workflow.instance.current_step_key).toBe('budget_check');
    // owner_ceo decides the accountant, authority and procurement steps.
    const budget = await engine.recordDecision(instanceId, null, 41, 'approve', null, { client, role: 'owner_ceo', userName: 'CEO' });
    expect(budget.ok).toBe(true);
    const authority = await engine.recordDecision(instanceId, null, 41, 'approve', null, { client, role: 'owner_ceo', userName: 'CEO' });
    expect(authority.ok).toBe(true);
    const procurement = await engine.recordDecision(instanceId, null, 41, 'approve', null, { client, role: 'owner_ceo', userName: 'CEO' });
    expect(procurement.ok).toBe(true);
    expect(procurement.workflow.instance.status).toBe('approved');
  });

  test('owner_ceo as requester is exempt from the self-approval guard, like owner/admin', async () => {
    const instanceId = await startPr(41);
    const draft = await engine.recordDecision(instanceId, null, 41, 'approve', null, { client, role: 'owner_ceo', userName: 'CEO Requester' });
    expect(draft.ok).toBe(true);
    const submit = await engine.recordDecision(instanceId, null, 41, 'approve', null, { client, role: 'owner_ceo', userName: 'CEO Requester' });
    expect(submit.ok).toBe(true);
    // Their own request, decided by themselves: privileged exemption applies.
    const budget = await engine.recordDecision(instanceId, null, 41, 'approve', null, { client, role: 'owner_ceo', userName: 'CEO Requester' });
    expect(budget.ok).toBe(true);
  });

  test('coo (the documented admin mirror) also decides at the authority step', async () => {
    const instanceId = await startPr(43);
    await engine.recordDecision(instanceId, null, 43, 'approve', null, { client, role: 'staff', userName: 'Requester' });
    await engine.recordDecision(instanceId, null, 43, 'approve', null, { client, role: 'staff', userName: 'Requester' });
    const budget = await engine.recordDecision(instanceId, null, 44, 'approve', null, { client, role: 'coo', userName: 'COO' });
    expect(budget.ok).toBe(true);
  });

  test('a role without the step grant or privilege is still refused (403)', async () => {
    const instanceId = await startPr(45);
    await engine.recordDecision(instanceId, null, 45, 'approve', null, { client, role: 'staff', userName: 'Requester' });
    await engine.recordDecision(instanceId, null, 45, 'approve', null, { client, role: 'staff', userName: 'Requester' });
    const refused = await engine.recordDecision(instanceId, null, 46, 'approve', null, { client, role: 'staff', userName: 'Bystander' });
    expect([refused.ok, refused.statusCode]).toEqual([false, 403]);
    const stranger = await engine.recordDecision(instanceId, null, 46, 'approve', null, { client, role: 'site_engineer', userName: 'Engineer' });
    expect([stranger.ok, stranger.statusCode]).toEqual([false, 403]);
  });
});
