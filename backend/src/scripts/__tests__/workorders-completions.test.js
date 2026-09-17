// Phase 8 regression test — POST /api/workorders/:id/completions.
//
// This route had no test coverage at all before this fix, which is exactly
// how a broken INSERT (13 value expressions bound against 9 real params,
// with measured_date/quantity/unit/source_type shifted onto the wrong
// columns) shipped past the whole test suite. Uses the same
// jest.mock('../../config/database') + MockDb pattern as
// project-wizard-routes.test.js.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'workorders-route-secret';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  pool: {},
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
}));

const { MockDb } = require('../test-helpers/mock-db');
const { query, transaction } = require('../../config/database');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS work_orders (id SERIAL PRIMARY KEY, project_id INTEGER, status VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS boq_items (id SERIAL PRIMARY KEY, project_id INTEGER, unit VARCHAR(50), quantity DECIMAL(15,3), unit_rate DECIMAL(15,2))`);
  await q(`CREATE TABLE IF NOT EXISTS location_types (id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY, project_id INTEGER, parent_id INTEGER, location_type_id INTEGER,
    code VARCHAR(50), name VARCHAR(255), name_en VARCHAR(255), name_ar VARCHAR(255), sort_order INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS boq_location_allocations (
    id SERIAL PRIMARY KEY, boq_item_id INTEGER, project_location_id INTEGER,
    planned_quantity DECIMAL(15,3), executed_quantity DECIMAL(15,3), certified_quantity DECIMAL(15,3), unit_cost DECIMAL(15,2))`);
  await q(`CREATE TABLE IF NOT EXISTS work_completions (
    id SERIAL PRIMARY KEY, work_order_id INTEGER, boq_item_id INTEGER, quantity_completed DECIMAL(15,3),
    completion_date DATE, notes TEXT, project_location_id INTEGER, boq_location_allocation_id INTEGER,
    status VARCHAR(30), verified_by INTEGER, verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS quantity_measurements (
    id SERIAL PRIMARY KEY, project_id INTEGER, project_location_id INTEGER, boq_item_id INTEGER,
    boq_location_allocation_id INTEGER, measured_date DATE, quantity DECIMAL(15,3), unit VARCHAR(50),
    source_type VARCHAR(50), source_id INTEGER, measured_by INTEGER, reviewed_by INTEGER,
    approval_state VARCHAR(30), photos TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);

  await q("INSERT INTO work_orders (id, project_id, status) VALUES ($1, $2, $3)", [1, 100, 'in_progress']);
  await q("INSERT INTO boq_items (id, project_id, unit, quantity, unit_rate) VALUES ($1, $2, $3, $4, $5)", [10, 100, 'm3', 500, 20]);
}

const router = require('../../routes/workorders');

function findRoute(method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]);
  if (!layer) throw new Error(`route not found: ${method} ${path}`);
  return layer.route;
}

function invoke(route, req) {
  const handler = route.stack[route.stack.length - 1].handle;
  return new Promise((resolve) => {
    const res = {
      status: jest.fn(() => res),
      json: jest.fn((b) => resolve({ res, body: b })),
    };
    handler(req, res, jest.fn(() => resolve({ res, body: null, nexted: true }))).catch((e) => resolve({ error: e }));
  });
}

const userReq = (body, params = {}) => ({
  user: { id: 5, name: 'Engineer', role: 'engineer' },
  body, params, query: {},
});

beforeAll(async () => {
  await buildFixture();
  query.mockImplementation(q);
  transaction.mockImplementation(async (cb) => cb({ query: q }));
});

describe('POST /:id/completions', () => {
  test('inserts a work_completions row and a matching quantity_measurements row with correctly-mapped columns (regression: previously 13 values bound for 12 columns, params shifted so measured_date got NULL into a NOT NULL column)', async () => {
    const route = findRoute('post', '/:id/completions');
    const { body, error } = await invoke(route, userReq(
      { boq_item_id: 10, quantity_completed: 25, completion_date: '2026-09-01', notes: 'test run' },
      { id: 1 }
    ));

    expect(error).toBeUndefined();
    expect(body.success).toBe(true);
    expect(body.data.boq_item_id).toBe(10);
    expect(body.data.quantity_completed).toBe(25);

    const measurements = db.table('quantity_measurements').rows;
    expect(measurements.length).toBe(1);
    const m = measurements[0];
    // Every column must carry the value it was named for, not a shifted one.
    expect(m.project_id).toBe(100);
    expect(new Date(m.measured_date).toISOString().slice(0, 10)).toBe('2026-09-01');
    expect(m.quantity).toBe(25);
    expect(m.unit).toBe('m3');
    expect(m.source_type).toBe('work_completion');
    expect(m.source_id).toBe(body.data.id);
    expect(m.measured_by).toBe(5);
    expect(m.approval_state).toBe('pending');
  });

  test('falls back to the project Unassigned location when project_location_id is omitted (regression: NOT NULL contract conflict)', async () => {
    const route = findRoute('post', '/:id/completions');
    const { body, error } = await invoke(route, userReq(
      { boq_item_id: 10, quantity_completed: 5, completion_date: '2026-09-02' },
      { id: 1 }
    ));

    expect(error).toBeUndefined();
    expect(body.success).toBe(true);
    expect(body.data.project_location_id).toBeTruthy();

    const loc = db.table('project_locations').rows.find((r) => r.id === body.data.project_location_id);
    expect(loc.code).toBe('UNASSIGNED');
  });
});
