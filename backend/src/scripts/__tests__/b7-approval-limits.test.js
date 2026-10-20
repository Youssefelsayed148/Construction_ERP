'use strict';

// B7: approval limits for the canonical roles.
//
// Part 1 documents the enforcement contract in services/approvalLimits.js:
// assertWithinLimit runs only for MONEY_TOOLS actions at decision time
// (mcpService.decideRequest) and, when no enabled row with matching currency
// exists for the approver's role, refuses with 403 / approval_limit_exceeded.
// There is no default limit: a missing row is a refusal, not an allow.
//
// Part 2 pins the demo seed helper (company-demo-approval-limits.js): it must
// upsert owner_ceo and coo rows for every MONEY_TOOLS action through the
// existing PUT /api/approval-limits API (no SQL, no migration), be idempotent
// on rerun, and refuse anything but the demo target.

const approvalLimits = require('../../services/approvalLimits');

describe('approval limit enforcement contract (B7)', () => {
  const dbQuery = jest.fn(async () => ({ rows: [] }));

  test('a role with no limit row is refused 403 approval_limit_exceeded for each money tool', async () => {
    for (const action of approvalLimits.MONEY_TOOLS) {
      await expect(approvalLimits.assertWithinLimit({ role: 'owner_ceo', action, amount: 50 }, dbQuery))
        .rejects.toMatchObject({ code: 'approval_limit_exceeded', status: 403 });
    }
  });

  test('the refusal is by absence of a row, not by amount', async () => {
    await expect(approvalLimits.assertWithinLimit({ role: 'owner_ceo', action: 'record_payment', amount: 0 }, dbQuery))
      .rejects.toMatchObject({ code: 'approval_limit_exceeded' });
  });

  test('an enabled EGP row at or above the amount passes; a smaller limit or foreign currency refuses', async () => {
    const rowQuery = async (sql, params) => ({
      rows: [params[0] === 'coo'
        ? { max_amount: '1000000000', currency: 'EGP', enabled: true }
        : { max_amount: '10', currency: 'EGP', enabled: true }],
    });
    await expect(approvalLimits.assertWithinLimit({ role: 'coo', action: 'record_payment', amount: 1000000000 }, rowQuery))
      .resolves.toMatchObject({ amount: 1000000000, limit: 1000000000, currency: 'EGP' });
    await expect(approvalLimits.assertWithinLimit({ role: 'accountant_ar', action: 'record_payment', amount: 11 }, rowQuery))
      .rejects.toMatchObject({ code: 'approval_limit_exceeded', status: 403 });
    await expect(approvalLimits.assertWithinLimit({ role: 'coo', action: 'record_payment', amount: 5, currency: 'USD' }, rowQuery))
      .rejects.toMatchObject({ code: 'approval_limit_exceeded' });
  });
});

describe('demo approval-limit seed helper (B7)', () => {
  const { seedApprovalLimits, TARGET } = require('../company-demo-approval-limits');
  const MONEY_TOOLS = [...approvalLimits.MONEY_TOOLS];

  function fakeApi() {
    const rows = [];
    let nextId = 1;
    const request = jest.fn(async (_account, route, options = {}) => {
      if (options.method === 'PUT') {
        const body = options.body || {};
        const existing = rows.find(r => r.role_key === body.role && r.action_key === body.action);
        if (existing) { Object.assign(existing, { max_amount: body.max_amount, currency: body.currency, enabled: body.enabled }); return { status: 200, body: { success: true, data: existing } }; }
        const row = { id: nextId++, role_key: body.role, action_key: body.action,
          max_amount: body.max_amount, currency: body.currency, enabled: true };
        rows.push(row);
        return { status: 200, body: { success: true, data: row } };
      }
      return { status: 200, body: { success: true, data: rows.map(({ id, ...rest }) => rest) } };
    });
    return { request, rows };
  }

  test('upserts owner_ceo and coo rows for every money tool through the API, idempotently', async () => {
    expect(TARGET.dbName).toBe('construction_erp_demo');
    const api = fakeApi();
    const accounts = [{ key: 'workflow_owner', role: 'owner' }];
    const first = await seedApprovalLimits({ target: TARGET, request: api.request, accounts });
    expect(first.created).toBe(MONEY_TOOLS.length * 2);
    const puts = api.request.mock.calls.filter(([, route, options]) => route === '/api/approval-limits' && (options || {}).method === 'PUT');
    expect(puts).toHaveLength(MONEY_TOOLS.length * 2);
    expect(api.rows.every(row => String(row.max_amount) === '1000000000' && row.currency === 'EGP')).toBe(true);
    expect(api.rows.map(row => row.role_key).sort()).toEqual(['coo', 'owner_ceo'].flatMap(r => Array(MONEY_TOOLS.length).fill(r)));
    // Rerun: nothing new is written (idempotent).
    const second = await seedApprovalLimits({ target: TARGET, request: api.request, accounts });
    expect(second.created).toBe(0);
    expect(second.rows).toBe(MONEY_TOOLS.length * 2);
    const putsAfterRerun = api.request.mock.calls.filter(([, route, options]) => route === '/api/approval-limits' && (options || {}).method === 'PUT');
    expect(putsAfterRerun).toHaveLength(MONEY_TOOLS.length * 2);
  });

  test('refuses a target that is not the demo stack', async () => {
    const api = fakeApi();
    await expect(seedApprovalLimits({
      target: { ...TARGET, dbName: 'construction_erp' }, request: api.request, accounts: [{ key: 'workflow_owner' }],
    })).rejects.toThrow(/Refusing demo/);
  });
});
