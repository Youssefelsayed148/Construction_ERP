// Phase 5 route tests — wizard endpoint, feature flag, templates.
//
// POST /api/projects keeps the legacy single-INSERT path while
// PROJECT_CREATION_WIZARD is off, and switches to the transactional wizard
// provisioning when the flag is on. GET /api/templates exposes the seeded
// templates for the wizard UI.
//
// The database module is jest.mock'd; `transaction` runs the callback with a
// mock client bound to the in-memory db.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'wizard-route-secret';

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  pool: {},
  healthCheck: jest.fn().mockResolvedValue({ status: 'healthy' }),
}));

const { MockDb } = require('../test-helpers/mock-db');
const { query, transaction } = require('../../config/database');
const migration = require('../project-wizard-migration');
const provisioning = require('../../services/projectProvisioning');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE, name VARCHAR(255),
    name_en VARCHAR(255), name_ar VARCHAR(255), address VARCHAR(255), city VARCHAR(255),
    project_type VARCHAR(100) DEFAULT 'commercial', client_id INTEGER, project_manager_id INTEGER,
    contract_value DECIMAL(15,2) DEFAULT 0, budget DECIMAL(15,2) DEFAULT 0,
    start_date DATE, expected_completion DATE, actual_completion DATE,
    status VARCHAR(50) DEFAULT 'planning', completion_percentage DECIMAL(5,2) DEFAULT 0,
    project_number VARCHAR(50), country VARCHAR(100), gps_latitude DECIMAL(10,7), gps_longitude DECIMAL(10,7),
    timezone VARCHAR(64) DEFAULT 'Africa/Cairo', currency VARCHAR(8) DEFAULT 'EGP',
    tax_profile VARCHAR(50) DEFAULT 'standard_vat',
    original_contract_value DECIMAL(15,2), original_budget DECIMAL(15,2),
    dlp_period_months INTEGER, warranty_period_months INTEGER,
    retention_percentage DECIMAL(5,2), retention_cap_amount DECIMAL(15,2),
    advance_payment_amount DECIMAL(15,2), advance_payment_percentage DECIMAL(5,2),
    liquidated_damages_rate DECIMAL(5,2), liquidated_damages_cap DECIMAL(15,2),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, code VARCHAR(100), name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS location_types (
    id SERIAL PRIMARY KEY, code VARCHAR(50), name VARCHAR(255), name_en VARCHAR(255), name_ar VARCHAR(255), parent_id INTEGER, sort_order INTEGER, is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY, project_id INTEGER, parent_id INTEGER, location_type_id INTEGER,
    code VARCHAR(50), name VARCHAR(255), name_en VARCHAR(255), name_ar VARCHAR(255), sort_order INTEGER, is_active BOOLEAN, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS wbs_nodes (
    id SERIAL PRIMARY KEY, project_id INTEGER, parent_id INTEGER, code VARCHAR(50), name VARCHAR(255),
    name_en VARCHAR(255), name_ar VARCHAR(255), wbs_level INTEGER, sort_order INTEGER, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY, user_id INTEGER, user_name VARCHAR(255), user_role VARCHAR(100),
    action VARCHAR(100), module VARCHAR(100), description TEXT, entity_id INTEGER, entity_type VARCHAR(100),
    amount DECIMAL(15,2), old_status VARCHAR(100), new_status VARCHAR(100), created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS _migration_client_org_map (
    id SERIAL PRIMARY KEY, old_client_id INTEGER, organization_id INTEGER)`);
  await migration.ensureTables(q);
  await migration.ensureLocationTypeSeed(q);
  await q("INSERT INTO organizations (code, name) VALUES ('INTERNAL', 'Internal')");
  await q("INSERT INTO location_types (code, name) VALUES ('site', 'Site')");
}

const router = require('../../routes/projects');

function findRoute(method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]);
  if (!layer) throw new Error(`route not found: ${method} ${path}`);
  return layer.route;
}

// Invoke the last handler in the chain (guards are exercised elsewhere).
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

const adminReq = (body, params = {}) => ({
  user: { id: 1, email: 'admin@x.com', name: 'Admin', role: 'owner' },
  body, params, query: {},
});

beforeAll(async () => {
  await buildFixture();
  await migration.seedTemplates(q);
  query.mockImplementation(q);
  transaction.mockImplementation(async (cb) => cb({ query: q }));
});

afterEach(() => {
  delete process.env.PROJECT_CREATION_WIZARD;
});

describe('feature flag: legacy path active by default', () => {
  test('POST /api/projects with the flag off keeps the single-INSERT behavior', async () => {
    const before = db.table('projects').rows.length;
    const { res, body } = await invoke(findRoute('post', '/'), {
      body: { name_ar: 'Legacy Path', name_en: 'Legacy', code: 'LEG-1', project_type: 'commercial' },
      params: {}, query: {}, user: { id: 1, name: 'Admin', role: 'owner' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(body.success).toBe(true);
    expect(db.table('projects').rows.length).toBe(before + 1);
    // No wizard artifacts were provisioned.
    expect(db.table('project_folders').rows.length).toBe(0);
    expect(db.table('project_workflows').rows.length).toBe(0);
  });
});

describe('feature flag: wizard path when enabled', () => {
  test('POST /api/projects with the flag on provisions the full wizard set', async () => {
    process.env.PROJECT_CREATION_WIZARD = 'true';
    const { res, body } = await invoke(findRoute('post', '/'), {
      body: { name_ar: 'Wizard Path', name_en: 'Wizard', project_type: 'residential', template_key: 'residential_tower' },
      params: {}, query: {}, user: { id: 1, name: 'Admin', role: 'owner' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(body.success).toBe(true);
    expect(body.counts).toEqual(expect.objectContaining({ workflows: 3, numbering: 6 }));
    // Wizard artifacts exist for the new project.
    expect(db.table('project_folders').rows.length).toBe(7);
    expect(db.table('project_workflows').rows.length).toBe(3);
    expect(db.table('numbering_sequences').rows.length).toBe(provisioning.NUMBERED_ENTITIES.length);
    expect(db.table('project_dashboard_preferences').rows.length).toBe(2);
  });

  test('POST /api/projects/wizard works regardless of the flag (explicit wizard route)', async () => {
    const before = db.table('project_locations').rows.length;
    const { res, body } = await invoke(findRoute('post', '/wizard'), {
      body: {
        name_ar: 'مركز القاهرة التجاري', name_en: 'Cairo Commercial Center',
        project_type: 'commercial', template_key: 'residential_tower',
      },
      params: {}, query: {}, user: { id: 1, name: 'Admin', role: 'owner' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(body.success).toBe(true);
    // Root + 122 template locations.
    expect(db.table('project_locations').rows.length).toBe(before + 123);
  });

  test('a provisioning failure inside the wizard route surfaces as a rollback error', async () => {
    transaction.mockImplementationOnce(async () => {
      throw new Error('boom mid-transaction');
    });
    const { res, body } = await invoke(findRoute('post', '/wizard'), {
      body: { name_ar: 'سيفشل', name_en: 'Will Fail', project_type: 'commercial' },
      params: {}, query: {}, user: { id: 1, name: 'Admin', role: 'owner' },
    });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/rolled back/);
    transaction.mockImplementation(async (cb) => cb({ query: q }));
  });
});

describe('wizard templates endpoints', () => {
  test('GET /api/projects/templates lists active templates', async () => {
    const { res, body } = await invoke(findRoute('get', '/templates'), {
      params: {}, query: {}, user: { id: 1, name: 'Admin', role: 'owner' },
    });
    expect(res.status).not.toHaveBeenCalledWith(404);
    expect(body.success).toBe(true);
    const keys = body.data.map((t) => t.key);
    expect(keys).toContain('residential_tower');
  });

  test('GET /api/projects/templates/residential_tower returns the full template payload', async () => {
    const { body } = await invoke(findRoute('get', '/templates/:key'), {
      params: { key: 'residential_tower' }, query: {}, user: { id: 1, name: 'Admin', role: 'owner' },
    });
    expect(body.success).toBe(true);
    expect(body.data.locations.length).toBe(122);
    expect(body.data.wbs.length).toBe(8);
    expect(body.data.folders.length).toBe(7);
    expect(body.data.workflows.length).toBe(3);
    expect(body.data.approval_rules.length).toBe(4);
    expect(body.data.default_values.currency).toBe('EGP');
  });

  test('GET /api/projects/templates/:key 404s for unknown templates', async () => {
    const { res, body } = await invoke(findRoute('get', '/templates/:key'), {
      params: { key: 'no_such_template' }, query: {}, user: { id: 1, name: 'Admin', role: 'owner' },
    });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(body.success).toBe(false);
  });
});
