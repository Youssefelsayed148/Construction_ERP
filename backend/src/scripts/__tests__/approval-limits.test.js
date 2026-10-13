'use strict';

jest.mock('../../config/database', () => ({ query: jest.fn() }));
const db = require('../../config/database');
const limits = require('../../services/approvalLimits');
const agentPolicy = require('../../services/agentPolicy');

describe('monetary approval limits', () => {
  beforeEach(() => jest.clearAllMocks());

  test('uses the persisted purchase order amount instead of a caller supplied amount', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [{ amount: '125000' }] });
    await expect(limits.resolveActionAmount('issue_purchase_order', { purchase_order_id: 7, amount: 1 }, q)).resolves.toBe(125000);
    expect(q).toHaveBeenCalledWith('SELECT total_amount AS amount FROM purchase_orders WHERE id = $1', [7]);
  });

  test('permits an action under the configured role limit', async () => {
    db.query.mockResolvedValue({ rows: [{ max_amount: '100000', currency: 'EGP', enabled: true }] });
    await expect(limits.assertWithinLimit({ role: 'finance_manager', action: 'record_payment', amount: 99999 })).resolves.toMatchObject({ limit: 100000 });
  });

  test('rejects over-limit, disabled, and missing limits (including delegated approvers)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ max_amount: '100000', currency: 'EGP', enabled: true }] })
      .mockResolvedValueOnce({ rows: [{ max_amount: '100000', currency: 'EGP', enabled: false }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(limits.assertWithinLimit({ role: 'finance_manager', action: 'record_payment', amount: 100001 })).rejects.toMatchObject({ code: 'approval_limit_exceeded' });
    await expect(limits.assertWithinLimit({ role: 'finance_manager', action: 'record_payment', amount: 1 })).rejects.toMatchObject({ code: 'approval_limit_exceeded' });
    await expect(limits.assertWithinLimit({ role: 'project_manager', action: 'record_payment', amount: 1 })).rejects.toMatchObject({ code: 'approval_limit_exceeded' });
  });

  test('blocks unresolved values and retains a finance manager as the default money approver tier', async () => {
    await expect(limits.assertWithinLimit({ role: 'owner', action: 'record_payment', amount: null })).rejects.toMatchObject({ code: 'approval_amount_unresolved' });
    expect(agentPolicy.requiredApproverRole('record_payment')).toBe('finance_manager');
  });
});
