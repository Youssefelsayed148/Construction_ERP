'use strict';

// F3.2 (C-PROC-002): a rejected delivery leaves a stock-neutral "supplier to collect" record on its MIR.
jest.mock('dotenv', () => ({ config: jest.fn() }));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f3-fixture-only-secret-longer-than-32';
jest.mock('../../config/database', () => ({ query: jest.fn(), pool: { query: jest.fn(), on: jest.fn() } }));
jest.mock('../../services/inventoryEngine', () => ({ createMovement: jest.fn().mockResolvedValue({}) }));

const fs = require('fs');
const path = require('path');
const inventoryEngine = require('../../services/inventoryEngine');
const svc = require('../../services/procurementService');

const user = { id: 4, role: 'owner' };

function scripted(rows) {
  const calls = [];
  const q = jest.fn(async (sql, params) => {
    calls.push({ sql, params });
    for (const [re, result] of rows) if (re.test(sql)) return typeof result === 'function' ? result(params) : result;
    return { rows: [] };
  });
  q.calls = calls;
  return q;
}

describe('decideMir flags rejected quantity for supplier collection', () => {
  const base = (decision, accepted) => {
    const q = scripted([
      [/SELECT \* FROM material_inspection_requests WHERE id/, { rows: [{ id: 1, status: 'pending', warehouse_id: 2 }] }],
      [/SELECT \* FROM mir_lines/, { rows: [{ id: 10, quantity: '10', material_id: 3, delivery_line_id: null, purchase_order_line_id: null }] }],
      [/UPDATE material_inspection_requests SET status/, (p) => ({ rows: [{ id: 1, status: p[0], supplier_collection_status: p[5] }] })],
    ]);
    return svc.decideMir(q, 1, user, decision, { accepted }).then(() => q);
  };
  const claimParams = (q) => q.calls.find((c) => /UPDATE material_inspection_requests SET status/.test(c.sql)).params;

  test('full rejection -> pending_collection, quantity written off from quarantine, nothing else', async () => {
    inventoryEngine.createMovement.mockClear();
    const q = await base('reject');
    expect(claimParams(q)[5]).toBe('pending_collection');
    expect(inventoryEngine.createMovement.mock.calls.map((c) => c[1].movement_type)).toEqual(['quarantine_reject']);
  });

  test('partial acceptance -> pending_collection for the rejected remainder', async () => {
    const q = await base('accept', { 10: 6 });
    expect(claimParams(q)[5]).toBe('pending_collection');
  });

  test('full acceptance -> no collection record', async () => {
    const q = await base('accept');
    expect(claimParams(q)[5]).toBeNull();
  });
});

describe('markSupplierCollected', () => {
  test('closes a pending record, stock-neutral, with the note and actor', async () => {
    const q = scripted([
      [/FOR UPDATE/, { rows: [{ id: 1, supplier_collection_status: 'pending_collection' }] }],
      [/SET supplier_collection_status = 'collected'/, (p) => ({ rows: [{ id: 1, supplier_collection_status: 'collected', supplier_collection_note: p[1] }] })],
    ]);
    const row = await svc.markSupplierCollected(q, 1, user, { note: 'truck 42' });
    expect(row.supplier_collection_status).toBe('collected');
    expect(q.calls.some((c) => /stock_movements|warehouse_stock|journal/i.test(c.sql))).toBe(false);
    expect(q.calls[1].params).toEqual([1, 'truck 42', 4]);
  });

  test.each([[null, 404, 'record_not_found'], [{ id: 1, supplier_collection_status: null }, 409, 'invalid_state'], [{ id: 1, supplier_collection_status: 'collected' }, 409, 'invalid_state']])(
    'refuses %j', async (row, status, code) => {
      const q = scripted([[/FOR UPDATE/, { rows: row ? [row] : [] }]]);
      await expect(svc.markSupplierCollected(q, 1, user)).rejects.toMatchObject({ status, error_code: code });
    });
});

test('migration 0073 is additive and nullable, with the status constraint', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../migrations/0073_mir_supplier_collection.sql'), 'utf8');
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS supplier_collection_status/);
  expect(sql).toMatch(/'pending_collection', 'collected'/);
  expect(sql).not.toMatch(/\bDROP\b|\bDELETE\b|\bNOT NULL\b/i);
});
