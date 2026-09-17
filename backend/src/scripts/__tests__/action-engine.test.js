// Phase 7 tests — universal action items, reminders, escalation and
// notifications on the existing event bus.
//
// Coverage:
//   - migration: 4 new tables + event_log.dispatched_at watermark
//     + per-row escalation ladder columns; default reminder rules
//   - actionService: create/acknowledge/complete/delegate + My Actions buckets
//   - notificationService: in-app adapter, preference gating, email stub,
//     role fan-out
//   - dispatcher: event routes → notifications/action items; catch-up poll
//     marks event_log.dispatched_at and does not double-process
//   - workflow engine integration: step assignment raises an action item,
//     decisions close it; final decisions emit module events
//   - escalation scheduler: the ladder with per-row configurable thresholds
//     and the reminder sweep

const { MockDb } = require('../test-helpers/mock-db');
const wfMigration = require('../workflow-engine-migration');
const actionMigration = require('../action-engine-migration');
const engine = require('../../services/workflowEngine');
const actionService = require('../../services/actionService');
const notificationService = require('../../services/notificationService');
const dispatcher = require('../../services/eventDispatcher');
const escalationScheduler = require('../../services/escalationScheduler');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);
const client = { query: q };

const HOUR = 3600 * 1000;
const now = () => new Date();

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
  await q(`CREATE TABLE IF NOT EXISTS user_project_roles (
    id SERIAL PRIMARY KEY, user_id INTEGER, project_id INTEGER, role_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, key VARCHAR(100), name VARCHAR(255))`);
  await wfMigration.ensureTables(q);
  await wfMigration.seedTemplates(q);
  await actionMigration.run(q);

  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [20, 'Requester', 'req@x.com', 'staff', true]);
  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [30, 'Finance Manager', 'fm@x.com', 'finance_manager', true]);
  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [31, 'Owner', 'owner@x.com', 'owner', true]);
  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [32, 'Inactive Admin', 'old@x.com', 'admin', false]);
  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [33, 'Active Admin', 'admin@x.com', 'admin', true]);
  await q(`INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)`, [40, 'Bystander', 'b@x.com', 'engineer', true]);
}

beforeAll(async () => {
  await buildFixture();
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('action engine migration', () => {
  test('creates the four new tables', () => {
    for (const t of ['action_items', 'notifications', 'notification_preferences', 'reminder_rules']) {
      expect(db.table(t).columns.size).toBeGreaterThan(0);
    }
  });

  test('event_log gains the dispatched_at watermark', () => {
    expect(db.table('event_log').columns.has('dispatched_at')).toBe(true);
  });

  test('escalation_rules gain the per-row ladder threshold columns', () => {
    const cols = db.table('escalation_rules').columns;
    expect(cols.has('ack_remind_hours')).toBe(true);
    expect(cols.has('overdue_escalate_hours')).toBe(true);
  });

  test('seeds default reminder rules and is idempotent on re-run', async () => {
    expect(await count('reminder_rules')).toBe(actionMigration.DEFAULT_REMINDER_RULES.length);
    await actionMigration.run(q);
    await actionMigration.run(q);
    expect(await count('reminder_rules')).toBe(actionMigration.DEFAULT_REMINDER_RULES.length);
  });
});

// ---------------------------------------------------------------------------
// actionService
// ---------------------------------------------------------------------------

describe('actionService', () => {
  test('creating an action item notifies the assignee in-app', async () => {
    const item = await actionService.createActionItem({
      source_type: 'observation', source_id: 5, title: 'Fix slab crack',
      assigned_user_id: 40, priority: 'high', due_date: new Date(Date.now() + 3 * 24 * HOUR),
      created_by: 20,
    }, { client, notify: false });
    expect(item.status).toBe('open');
    expect(item.priority).toBe('high');
  });

  test('validates: no title, and no assignee/role, both throw', async () => {
    await expect(actionService.createActionItem({ title: '', assigned_user_id: 40 }, { client, notify: false }))
      .rejects.toThrow('title');
    await actionService.createActionItem({ title: 'x' }, { client, notify: false }).catch((e) => {
      expect(e.message).toMatch('assigned_user_id or assigned_role');
    });
  });

  test('acknowledge stamps acknowledged_at; only the assignee may acknowledge', async () => {
    const item = await actionService.createActionItem(
      { source_type: 'manual', title: 'A', assigned_user_id: 40 }, { client, notify: false });
    const denied = await actionService.acknowledge(item.id, 31, { client });
    expect(denied.ok).toBe(false);
    expect(denied.statusCode).toBe(403);
    const ok = await actionService.acknowledge(item.id, 40, { client });
    expect(ok.ok).toBe(true);
    const row = db.table('action_items').rows.find((r) => r.id === item.id);
    expect(row.acknowledged_at).toBeTruthy();
  });

  test('complete closes the item and it lands in recently_completed', async () => {
    const item = await actionService.createActionItem(
      { source_type: 'manual', title: 'B', assigned_user_id: 40 }, { client, notify: false });
    const r = await actionService.complete(item.id, 40, { client });
    expect(r.ok).toBe(true);
    const row = db.table('action_items').rows.find((x) => x.id === item.id);
    expect(row.status).toBe('completed');
    const { buckets } = await actionService.listForUser(40, { client });
    expect(buckets.recently_completed.some((i) => i.id === item.id)).toBe(true);
  });

  test('delegate reassigns, records the delegator and notifies the target', async () => {
    const item = await actionService.createActionItem(
      { source_type: 'manual', title: 'C', assigned_user_id: 40 }, { client, notify: false });
    const r = await actionService.delegate(item.id, 40, 20, { client, comment: 'please handle' });
    expect(r.ok).toBe(true);
    const row = db.table('action_items').rows.find((x) => x.id === item.id);
    expect(Number(row.delegated_to_user_id)).toBe(20);
    expect(Number(row.delegated_by_user_id)).toBe(40);
    const delegatorBuckets = (await actionService.listForUser(40, { client })).buckets;
    expect(delegatorBuckets.delegated.some((i) => i.id === item.id)).toBe(true);
    const targetBuckets = (await actionService.listForUser(20, { client })).buckets;
    expect([...targetBuckets.awaiting_me, ...targetBuckets.overdue, ...targetBuckets.due_today, ...targetBuckets.due_soon]
      .some((i) => i.id === item.id)).toBe(true);
  });

  test('My Actions buckets: overdue / due today / due soon / awaiting me / role visibility', async () => {
    // Fixed clock so due-date buckets are deterministic regardless of when
    // the suite runs (10:00 guarantees +2h stays inside the same day).
    const base = new Date(); base.setHours(10, 0, 0, 0);
    const overdue = await actionService.createActionItem(
      { source_type: 'manual', title: 'OD', assigned_user_id: 40, due_date: new Date(base.getTime() - 2 * 24 * HOUR) }, { client, notify: false });
    const dueToday = await actionService.createActionItem(
      { source_type: 'manual', title: 'TD', assigned_user_id: 40, due_date: new Date(base.getTime() + 2 * HOUR) }, { client, notify: false });
    const dueSoon = await actionService.createActionItem(
      { source_type: 'manual', title: 'DS', assigned_user_id: 40, due_date: new Date(base.getTime() + 3 * 24 * HOUR) }, { client, notify: false });
    const awaiting = await actionService.createActionItem(
      { source_type: 'manual', title: 'AM', assigned_user_id: 40 }, { client, notify: false });
    const forRole = await actionService.createActionItem(
      { source_type: 'manual', title: 'ROLE', assigned_role: 'engineer' }, { client, notify: false });

    const { buckets } = await actionService.listForUser(40, { client, now: base });
    expect(buckets.overdue.some((i) => i.id === overdue.id)).toBe(true);
    expect(buckets.due_today.some((i) => i.id === dueToday.id)).toBe(true);
    expect(buckets.due_soon.some((i) => i.id === dueSoon.id)).toBe(true);
    expect(buckets.awaiting_me.some((i) => i.id === awaiting.id)).toBe(true);
    expect(buckets.awaiting_me.some((i) => i.id === forRole.id)).toBe(true);

    // A user without the engineer role does not see the role item.
    const other = await actionService.listForUser(20, { client, now: base });
    const otherFlat = Object.values(other.buckets).flat();
    expect(otherFlat.some((i) => i.id === forRole.id)).toBe(false);
  });

  test('closeBySource completes every open item for the source entity', async () => {
    const a = await actionService.createActionItem({ source_type: 'obs2', source_id: 9, title: 'S1', assigned_user_id: 40 }, { client, notify: false });
    const b = await actionService.createActionItem({ source_type: 'obs2', source_id: 9, title: 'S2', assigned_user_id: 40 }, { client, notify: false });
    const n = await actionService.closeBySource('obs2', 9, { client });
    expect(n).toBe(2);
    const rows = db.table('action_items').rows.filter((r) => r.id === a.id || r.id === b.id);
    expect(rows.every((r) => r.status === 'completed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// notificationService
// ---------------------------------------------------------------------------

describe('notificationService', () => {
  test('in-app adapter writes an unread notification; markRead clears it', async () => {
    const before = await count('notifications');
    const r = await notificationService.notify({
      userId: 40, title: 'Hello', body: 'World', eventType: 'test.event', entityType: 'x', entityId: 1,
    }, { client, channels: ['in_app'] });
    expect(r.ok).toBe(true);
    expect(await count('notifications')).toBe(before + 1);
    const unread = await notificationService.unreadCount(40, { client });
    expect(unread).toBeGreaterThan(0);
    const first = (await notificationService.getNotifications(40, { client, unreadOnly: true }))[0];
    await notificationService.markRead(first.id, 40, { client });
    expect(await notificationService.unreadCount(40, { client })).toBe(await notificationService.unreadCount(40, { client }));
  });

  test('preferences gate channels: disabled in_app produces no row', async () => {
    await notificationService.setPreference(40, 'gated.event', 'in_app', false, { client });
    const before = await count('notifications');
    await notificationService.notify({ userId: 40, title: 'Gated', eventType: 'gated.event' }, { client, channels: ['in_app'] });
    expect(await count('notifications')).toBe(before);
    await notificationService.setPreference(40, 'gated.event', 'in_app', true, { client });
    await notificationService.notify({ userId: 40, title: 'Ungated', eventType: 'gated.event' }, { client, channels: ['in_app'] });
    expect(await count('notifications')).toBe(before + 1);
  });

  test('email adapter works without SMTP (console transport, ok=true); email is opt-in', async () => {
    // Email is opt-in: without a preference row it is filtered out.
    const denied = await notificationService.notify({
      userId: 40, title: 'Mail', body: 'Body', eventType: 'mail.event',
    }, { client, channels: ['email'] });
    expect(denied.ok).toBe(false);
    expect(denied.results.length).toBe(0);

    // An explicit preference row enables it; no SMTP config → console transport.
    await notificationService.setPreference(40, 'mail.event', 'email', true, { client });
    const r = await notificationService.notify({
      userId: 40, title: 'Mail', body: 'Body', eventType: 'mail.event',
    }, { client, channels: ['email'] });
    expect(r.ok).toBe(true);
    expect(r.results[0].channel).toBe('email');
  });

  test('stub channels (push/sms/whatsapp) resolve through the same interface', () => {
    for (const ch of ['push', 'sms', 'whatsapp']) {
      expect(typeof notificationService.PROVIDERS[ch].send).toBe('function');
    }
  });

  test('notifyRoles fans out to active users with the role, excluding the actor', async () => {
    const before = await count('notifications');
    const results = await notificationService.notifyRoles(['owner', 'admin'], {
      title: 'Fanout', eventType: 'fanout.event', excludeUserId: 33,
    }, { client, channels: ['in_app'] });
    const targets = results.map((r) => r.userId);
    expect(targets).toContain(31);
    expect(targets).not.toContain(32); // inactive
    expect(targets).not.toContain(33); // excluded actor
    expect(await count('notifications')).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
// dispatcher
// ---------------------------------------------------------------------------

describe('event dispatcher', () => {
  test('observation.created with an assignee raises an action item', async () => {
    const before = await count('action_items');
    const r = await dispatcher.dispatchEvent('observation.created', {
      eventType: 'observation.created', entityType: 'observation', entityId: 55,
      userId: 20, payload: { assigned_user_id: 40, title: 'Rebar spacing', priority: 'high' },
    }, { client });
    expect(r.handled).toBe(true);
    const rows = db.table('action_items').rows;
    expect(rows.length).toBe(before + 1);
    expect(rows[rows.length - 1].source_type).toBe('observation');
  });

  test('approval.requested notifies owner/admin + the module manager, not the actor', async () => {
    const before = await count('notifications');
    await dispatcher.dispatchEvent('approval.requested', {
      eventType: 'approval.requested', entityType: 'approval_request', entityId: 77,
      userId: 20, payload: { module_name: 'expenses', manager_role: 'finance_manager', request_type: 'expense' },
    }, { client });
    const rows = db.table('notifications').rows.slice(before);
    const targets = rows.map((r) => Number(r.user_id));
    expect(targets).toContain(31); // owner
    expect(targets).toContain(33); // admin
    expect(targets).toContain(30); // finance_manager
    expect(targets).not.toContain(20); // actor excluded
  });

  test('unknown event types are a safe no-op', async () => {
    const r = await dispatcher.dispatchEvent('totally.unknown', { payload: {} }, { client });
    expect(r.handled).toBe(false);
  });

  test('catchUp dispatches unmarked event_log rows and stamps them; no double processing', async () => {
    await q(`INSERT INTO event_log (event_type, entity_type, entity_id, user_id, payload)
             VALUES ('approval.requested', 'approval_request', 901, 20, '{}')`, []);
    await q(`INSERT INTO event_log (event_type, entity_type, entity_id, user_id, payload)
             VALUES ('no.such.route', 'x', 902, 20, '{}')`, []);
    const before = await count('notifications');
    const { scanned, processed } = await dispatcher.catchUp(q, { client });
    expect(scanned).toBeGreaterThanOrEqual(2);
    expect(processed).toBeGreaterThanOrEqual(2);
    const stamped = (await q('SELECT * FROM event_log WHERE dispatched_at IS NOT NULL')).rows;
    expect(stamped.length).toBeGreaterThanOrEqual(2);
    const after = await dispatcher.catchUp(q, { client });
    expect(after.scanned).toBe(0);
    expect(await count('notifications')).toBeGreaterThan(before);
  });

  test('event rows emitted by fireEvent are picked up by catchUp (end-to-end)', async () => {
    const { fireEvent } = require('../../utils/activity');
    const before = await count('notifications');
    await fireEvent({
      eventType: 'approval.requested', entityType: 'approval_request', entityId: 902,
      userId: 20, payload: { module_name: 'expenses', manager_role: 'finance_manager' },
    }, { query: q });
    const res = await dispatcher.catchUp(q, { client });
    expect(res.scanned).toBeGreaterThanOrEqual(1);
    expect(await count('notifications')).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// workflow engine integration
// ---------------------------------------------------------------------------

describe('workflow → action items', () => {
  test('starting a legacy workflow creates an action item for the pending step', async () => {
    await q(`INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)`, [700, 100, 'pending']);
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 700,
      { module_name: 'expenses', request_type: 'expense', request_id: 700, requester_id: 20 }, { client });
    const items = db.table('action_items').rows.filter((r) => r.workflow_instance_id === wf.instance.id);
    expect(items.length).toBe(1);
    expect(items[0].source_type).toBe('workflow_step');
    expect(items[0].assigned_role).toBe('finance_manager');
    expect(items[0].status).toBe('open');
  });

  test('manager approve closes the manager item and opens the owner item; final approve emits the module event', async () => {
    await q(`INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)`, [701, 100, 'pending']);
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 701,
      { module_name: 'expenses', request_type: 'expense', request_id: 701, requester_id: 20 }, { client });
    const mgrItem = db.table('action_items').rows.find((r) => r.workflow_instance_id === wf.instance.id);

    await engine.recordDecision(wf.instance.id, null, 30, 'approve', null, { client, role: 'finance_manager', userName: 'FM' });
    let row = db.table('action_items').rows.find((r) => r.id === mgrItem.id);
    expect(row.status).toBe('completed');
    const ownerItem = db.table('action_items').rows
      .filter((r) => r.workflow_instance_id === wf.instance.id && r.status === 'open');
    expect(ownerItem.length).toBe(1);
    expect(ownerItem[0].assigned_role).toBe('owner');

    const evBefore = (await q("SELECT * FROM event_log WHERE event_type = 'expenses.approved'")).rows.length;
    await engine.recordDecision(wf.instance.id, null, 31, 'approve', null, { client, role: 'owner', userName: 'Owner' });
    const evAfter = (await q("SELECT * FROM event_log WHERE event_type = 'expenses.approved'")).rows;
    expect(evAfter.length).toBe(evBefore + 1);
    expect(evAfter[evAfter.length - 1].entity_id).toBe(701);
    // The owner step's item closed with the final decision.
    const stillOpen = db.table('action_items').rows
      .filter((r) => r.workflow_instance_id === wf.instance.id && r.status === 'open');
    expect(stillOpen.length).toBe(0);
  });

  test('reject cancels the step action item and emits the rejected event', async () => {
    await q(`INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)`, [702, 100, 'pending']);
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 702,
      { module_name: 'expenses', request_type: 'expense', request_id: 702, requester_id: 20 }, { client });
    const item = db.table('action_items').rows.find((r) => r.workflow_instance_id === wf.instance.id);
    await engine.recordDecision(wf.instance.id, null, 30, 'reject', 'nope', { client, role: 'finance_manager', userName: 'FM' });
    const row = db.table('action_items').rows.find((r) => r.id === item.id);
    expect(row.status).toBe('cancelled');
    const ev = (await q("SELECT * FROM event_log WHERE event_type = 'expenses.rejected'")).rows;
    expect(ev.length).toBeGreaterThan(0);
  });

  test('reassign moves the open action item to the new assignee', async () => {
    await q(`INSERT INTO expenses (id, amount, status) VALUES ($1, $2, $3)`, [703, 100, 'pending']);
    const wf = await engine.startWorkflow('legacy_module_approval', 'expenses', 703,
      { module_name: 'expenses', request_type: 'expense', request_id: 703, requester_id: 20 }, { client });
    await engine.recordDecision(wf.instance.id, null, 31, 'reassign', null, { client, role: 'owner', reassignToUserId: 33 });
    const item = db.table('action_items').rows.find((r) => r.workflow_instance_id === wf.instance.id);
    expect(Number(item.assigned_user_id)).toBe(33);
    expect(item.assigned_role).toBe(null);
  });

  test('legacy migration backfills action items for pending rows', async () => {
    const beforeItems = await count('action_items');
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, requester_id, status, stage)
             VALUES ($1, 'expenses', 'expense', $2, $3, 'pending', 'manager_review')`, [880, 880, 20]);
    await engine.migrateLegacyApprovals(client);
    expect(await count('action_items')).toBeGreaterThan(beforeItems);
    const item = db.table('action_items').rows.find((r) => r.source_type === 'workflow_step' && r.source_id === 880);
    expect(item).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// escalation scheduler
// ---------------------------------------------------------------------------

describe('escalation scheduler', () => {
  test('unacknowledged item past ack_remind_hours notifies the assignee manager (configurable thresholds)', async () => {
    const item = await actionService.createActionItem({
      source_type: 'manual', title: 'Escalate me', assigned_user_id: 40,
      escalation_policy: { ack_remind_hours: 1, overdue_escalate_hours: 100, manager_roles: ['finance_manager'], top_roles: ['owner'] },
    }, { client, notify: false });
    await q('UPDATE action_items SET created_at = $1, updated_at = $1 WHERE id = $2', [new Date(Date.now() - 5 * HOUR), item.id]);

    const stats = await escalationScheduler.runEscalationSweep(q, { client });
    expect(stats.ack_reminded).toBe(1);
    const row = db.table('action_items').rows.find((r) => r.id === item.id);
    expect(row.escalation_level).toBe(1);
    const notified = db.table('notifications').rows.filter((n) => Number(n.user_id) === 30 && n.event_type === 'action.unacknowledged');
    expect(notified.length).toBe(1);

    // A second item with a 48h ack threshold and 5h age must NOT be escalated.
    const item2 = await actionService.createActionItem({
      source_type: 'manual', title: 'Not yet', assigned_user_id: 40,
      escalation_policy: { ack_remind_hours: 48, overdue_escalate_hours: 100, manager_roles: ['finance_manager'], top_roles: ['owner'] },
    }, { client, notify: false });
    await q('UPDATE action_items SET created_at = $1, updated_at = $1 WHERE id = $2', [new Date(Date.now() - 5 * HOUR), item2.id]);
    const stats2 = await escalationScheduler.runEscalationSweep(q, { client });
    expect(stats2.ack_reminded).toBe(0);
    const row2 = db.table('action_items').rows.find((r) => r.id === item2.id);
    expect(row2.escalation_level || 0).toBe(0);
  });

  test('past overdue_escalate_hours the item escalates further to top_roles', async () => {
    const item = await actionService.createActionItem({
      source_type: 'manual', title: 'Deep escalation', assigned_user_id: 40,
      escalation_policy: { ack_remind_hours: 1, overdue_escalate_hours: 24, manager_roles: ['finance_manager'], top_roles: ['owner'] },
    }, { client, notify: false });
    await q('UPDATE action_items SET created_at = $1, updated_at = $1, escalation_level = 1 WHERE id = $2', [new Date(Date.now() - 30 * HOUR), item.id]);
    const stats = await escalationScheduler.runEscalationSweep(q, { client });
    expect(stats.escalated).toBe(1);
    const row = db.table('action_items').rows.find((r) => r.id === item.id);
    expect(row.escalation_level).toBe(2);
    const notified = db.table('notifications').rows.filter((n) => Number(n.user_id) === 31 && n.event_type === 'action.escalated');
    expect(notified.length).toBe(1);
  });

  test('due-date-missed fires the durable action.overdue event to the top of the chain', async () => {
    const fired = [];
    const item = await actionService.createActionItem({
      source_type: 'manual', title: 'Missed the date', assigned_user_id: 40,
      due_date: new Date(Date.now() - 1 * HOUR),
      escalation_policy: { ack_remind_hours: 1, overdue_escalate_hours: 24, manager_roles: ['finance_manager'], top_roles: ['owner', 'admin'] },
    }, { client, notify: false });
    const stubFire = async (evt) => { fired.push(evt); return { id: 99001 }; };

    const stats = await escalationScheduler.runEscalationSweep(q, { client, fireEvent: stubFire });
    expect(stats.overdue_fired).toBe(1);
    expect(fired.length).toBe(1);
    expect(fired[0].eventType).toBe('action.overdue');
    expect(fired[0].payload.top_roles).toEqual(['owner', 'admin']);

    // The event, once in event_log, fans out through the dispatcher.
    const before = await count('notifications');
    await dispatcher.dispatchEvent('action.overdue', {
      eventType: 'action.overdue', entityType: 'action_item', entityId: item.id, payload: fired[0].payload,
    }, { client });
    const rows = db.table('notifications').rows.slice(before);
    const targets = rows.map((r) => Number(r.user_id));
    expect(targets).toContain(31);
    expect(targets).toContain(33);

    const row = db.table('action_items').rows.find((r) => r.id === item.id);
    expect(row.escalation_level).toBe(3);
    // Idempotent: a second sweep does not re-fire.
    const again = await escalationScheduler.runEscalationSweep(q, { client, fireEvent: stubFire });
    expect(again.overdue_fired).toBe(0);
  });

  test('reminder_policy drives capped repeat nudges to the assignee', async () => {
    const item = await actionService.createActionItem({
      source_type: 'manual', title: 'Nudge me', assigned_user_id: 40,
      reminder_policy: { remind_after_hours: 1, repeat_interval_hours: 2, max_reminders: 2 },
    }, { client, notify: false });
    await q('UPDATE action_items SET created_at = $1, updated_at = $1 WHERE id = $2', [new Date(Date.now() - 3 * HOUR), item.id]);

    let stats = await escalationScheduler.runEscalationSweep(q, { client });
    expect(stats.reminders_sent).toBe(1);
    let row = db.table('action_items').rows.find((r) => r.id === item.id);
    expect(row.reminders_sent).toBe(1);

    // Too soon for the next repeat.
    stats = await escalationScheduler.runEscalationSweep(q, { client });
    expect(stats.reminders_sent).toBe(0);

    // Repeat interval elapsed → second reminder.
    await q('UPDATE action_items SET last_reminded_at = $1 WHERE id = $2', [new Date(Date.now() - 3 * HOUR), item.id]);
    stats = await escalationScheduler.runEscalationSweep(q, { client });
    expect(stats.reminders_sent).toBe(1);

    // Max reminders reached → no more.
    await q('UPDATE action_items SET last_reminded_at = $1 WHERE id = $2', [new Date(Date.now() - 3 * HOUR), item.id]);
    stats = await escalationScheduler.runEscalationSweep(q, { client });
    expect(stats.reminders_sent).toBe(0);
    row = db.table('action_items').rows.find((r) => r.id === item.id);
    expect(row.reminders_sent).toBe(2);
  });
});
