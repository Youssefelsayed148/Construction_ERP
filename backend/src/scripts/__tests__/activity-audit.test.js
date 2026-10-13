jest.mock('../../config/database', () => ({ query: jest.fn() }));

const { query } = require('../../config/database');
const activity = require('../../utils/activity');
const { auditedTransaction } = require('../../utils/auditedTransaction');

describe('activity audit failures', () => {
  beforeEach(() => query.mockReset());

  test('logActivity propagates database failures and can use the caller transaction', async () => {
    const expected = new Error('audit unavailable');
    const txQuery = jest.fn().mockRejectedValue(expected);
    await expect(activity.logActivity({ action: 'create' }, { query: txQuery })).rejects.toBe(expected);
    expect(txQuery).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });

  test('activity readers propagate query failures instead of returning an empty result', async () => {
    const expected = new Error('database unavailable');
    query.mockRejectedValue(expected);
    await expect(activity.getRecentActivities()).rejects.toBe(expected);
    await expect(activity.getUserActivities(7)).rejects.toBe(expected);
    await expect(activity.getModuleActivities('finance')).rejects.toBe(expected);
  });

  test('a failed transactional audit rejects the operation and requests rollback', async () => {
    const operations = [];
    const runTransaction = async (callback) => {
      const client = { query: async (sql) => { operations.push(sql); if (sql.includes('INSERT INTO activity_log')) throw new Error('injected audit failure'); return { rows: [] }; } };
      try {
        const result = await callback(client);
        operations.push('COMMIT');
        return result;
      } catch (error) {
        operations.push('ROLLBACK');
        throw error;
      }
    };
    await expect(auditedTransaction(
      async (q) => { await q('UPDATE purchase_requests SET status = $1 WHERE id = $2', ['submitted', 7]); return { id: 7 }; },
      () => ({ action: 'submit', entityId: 7 }),
      { transaction: runTransaction }
    )).rejects.toThrow('injected audit failure');
    expect(operations.at(-1)).toBe('ROLLBACK');
    expect(operations).not.toContain('COMMIT');
  });
});
