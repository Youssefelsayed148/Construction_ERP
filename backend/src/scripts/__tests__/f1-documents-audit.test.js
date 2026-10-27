'use strict';

// F1.4: every document mutation (create / update / version / submit / approve / reject / delete / register /
// supersede) writes an activity_log row AND an audit_events before/after row carrying the caller's ip and
// request id, on the SAME transaction client as the change.
jest.mock('dotenv', () => ({ config: jest.fn() }));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f1-fixture-only-secret-longer-than-32';

const DOC = { id: 7, project_id: 1, title: 'Plan', status: 'draft', doc_status: 'draft', version: 1, revision_code: 'R0', doc_number: 'D-1' };
const calls = [];
let txDepth = 0;
const run = (sql, params) => {
  calls.push({ sql, params, tx: txDepth });
  if (/^INSERT INTO (activity_log|audit_events)/.test(sql)) return { rows: [] };
  if (/INSERT INTO project_documents/.test(sql)) return { rows: [{ ...DOC }] };
  if (/INSERT INTO document_versions/.test(sql)) return { rows: [{ id: 1 }] };
  if (/FROM document_versions/.test(sql)) return { rows: [] };
  if (/UPDATE project_documents SET status = 'submitted'/.test(sql)) return { rows: [{ ...DOC, status: 'submitted' }] };
  if (/UPDATE project_documents SET status = \$1/.test(sql)) return { rows: [{ ...DOC, status: params[0] }] };
  if (/UPDATE project_documents SET/.test(sql)) return { rows: [{ ...DOC, title: 'New' }] };
  if (/DELETE FROM project_documents/.test(sql)) return { rows: [{ title: 'Plan' }] };
  if (/FROM project_documents/.test(sql)) return { rows: [{ ...DOC, doc_number: 'D-1', discipline: 'general', doc_type: 'drawing' }] };
  return { rows: [] };
};
jest.mock('../../config/database', () => {
  const query = jest.fn(async (sql, params) => run(sql, params));
  const transaction = jest.fn(async (fn) => { txDepth += 1; try { return await fn({ query: async (sql, params) => run(sql, params) }); } finally { txDepth -= 1; } });
  return { query, transaction, pool: { query, on: jest.fn() } };
});
jest.mock('../../middleware/auth', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 5, name: 'Dana', role: 'owner' }; req.requestId = 'req-f1-123'; next(); },
  authorize: () => (req, _res, next) => { req.policy = { allowed: true, project_id: 1 }; req.accessScope = { companyWide: true, projectIds: [] }; next(); },
}));
jest.mock('../../services/doccontrolEngine', () => ({
  registerDocument: jest.fn(async () => ({ id: 7, project_id: 1, doc_number: 'D-1', doc_status: 'draft' })),
  supersedeDocument: jest.fn(async () => ({ id: 7, project_id: 1, doc_number: 'D-1', doc_status: 'superseded' })),
  supersedeForNewRevision: jest.fn(async () => ({})),
}));

const express = require('express');
const app = express();
app.use(express.json());
app.use('/api/docs', require('../../routes/doccontrol'));
const server = require('http').createServer(app);
let base;
beforeAll(async () => { await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}`; });
afterAll(async () => { await new Promise((r) => server.close(r)); });
beforeEach(() => { calls.length = 0; });

const send = (method, path, body) => fetch(`${base}/api/docs${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });

const CASES = [
  ['create', 'POST', '/documents', { project_id: 1, title: 'Plan', file_url: '/uploads/a.pdf' }, 201, 'create', false, true],
  ['update', 'PUT', '/documents/7', { title: 'New' }, 200, 'update', true, true],
  ['new version', 'POST', '/documents/7/versions', { file_url: '/uploads/b.pdf' }, 201, 'update', true, true],
  ['submit', 'POST', '/documents/7/submit', {}, 200, 'submit', true, true],
  ['approve', 'POST', '/documents/7/approve', {}, 200, 'approve', true, true],
  ['reject', 'POST', '/documents/7/reject', {}, 200, 'reject', true, true],
  ['delete', 'DELETE', '/documents/7', null, 200, 'delete', true, false],
  ['register', 'POST', '/documents/7/register', {}, 200, 'update', true, true],
  ['supersede', 'POST', '/documents/7/supersede', { replacement_document_id: 8 }, 200, 'update', true, true],
];

describe.each(CASES)('documents %s', (_n, method, path, body, status, action, hasBefore, hasAfter) => {
  test('audits in the same transaction with before/after, ip and request id', async () => {
    const res = await send(method, path, body);
    expect(res.status).toBe(status);
    const audit = calls.filter((c) => /^INSERT INTO audit_events/.test(c.sql));
    const activity = calls.filter((c) => /^INSERT INTO activity_log/.test(c.sql));
    expect(audit).toHaveLength(1);
    expect(activity).toHaveLength(1);
    expect(audit[0].tx).toBeGreaterThan(0);                         // inside the transaction client, not the pool
    expect(activity[0].tx).toBeGreaterThan(0);
    const [entity, , act, before, after, userId, , ip, requestId] = audit[0].params;
    expect(entity).toBe('project_document');
    expect(act).toBe(action);
    expect(Boolean(before)).toBe(hasBefore);
    expect(Boolean(after)).toBe(hasAfter);
    expect(userId).toBe(5);
    expect(ip).toBeTruthy();
    expect(requestId).toBe('req-f1-123');
  });
});
