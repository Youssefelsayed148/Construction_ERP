// Phase 17 tests — the client portal: scoped auth, server-side cost gating,
// dashboard, portfolio, action center, and the zero-client requirement.
//
// Scenarios tested explicitly:
//   1. project with a client and full data,
//   2. project with a client and zero records,
//   3. project with NO client assigned at all (setup actions, never an error),
//   4. the server-side strip: internal-cost fields NEVER appear in a client
//      response regardless of what the UI shows.

const { MockDb } = require('../test-helpers/mock-db');
const engine = require('../../services/clientEngine');
const policy = require('../../services/policy');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const CLIENT_USER = { id: 30, name: 'Client Rep', role: 'client' };
const TODAY = new Date().toISOString().slice(0, 10);

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255), name_en VARCHAR(255), status VARCHAR(50), progress_percent DECIMAL(5,2), client_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name VARCHAR(255), org_type VARCHAR(30))`);
  await q(`CREATE TABLE IF NOT EXISTS organization_users (
    id SERIAL PRIMARY KEY, organization_id INTEGER, user_id INTEGER, role_at_org VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_participants (
    id SERIAL PRIMARY KEY, project_id INTEGER, organization_id INTEGER, participant_type VARCHAR(50),
    portal_access_enabled BOOLEAN, active_from TIMESTAMPTZ, active_to TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS boq_items (id SERIAL PRIMARY KEY, project_id INTEGER, quantity DECIMAL(15,3) DEFAULT 0, unit_cost DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS quantity_measurements (
    id SERIAL PRIMARY KEY, project_id INTEGER, boq_item_id INTEGER, measured_date DATE,
    quantity DECIMAL(15,3) DEFAULT 0, approval_state VARCHAR(30) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS project_milestones (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), target_date DATE,
    achieved_date DATE, status VARCHAR(50) DEFAULT 'pending')`);
  await q(`CREATE TABLE IF NOT EXISTS work_orders (
    id SERIAL PRIMARY KEY, project_id INTEGER, title VARCHAR(255), status VARCHAR(50) DEFAULT 'planned',
    planned_start_date DATE, planned_end_date DATE, actual_start_date DATE, actual_end_date DATE,
    completion_percentage DECIMAL(5,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS photos (
    id SERIAL PRIMARY KEY, project_id INTEGER, location_id INTEGER, linked_entity_type VARCHAR(50),
    linked_entity_id INTEGER, file_name VARCHAR(500), file_url VARCHAR(1000), uploader_user_id INTEGER,
    organization_id INTEGER, captured_at TIMESTAMPTZ, uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    gps_lat DECIMAL(10,7), gps_lng DECIMAL(10,7), caption VARCHAR(1000),
    annotations JSONB DEFAULT '[]', created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS variations (
    id SERIAL PRIMARY KEY, variation_number VARCHAR(50), project_id INTEGER, client_contract_id INTEGER,
    title VARCHAR(255), variation_type VARCHAR(30) DEFAULT 'client', amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'change_event')`);
  await q(`CREATE TABLE IF NOT EXISTS approval_requests (
    id SERIAL PRIMARY KEY, module_name VARCHAR(100), request_type VARCHAR(100), request_id INTEGER,
    requester_id INTEGER, project_id INTEGER, status VARCHAR(50) DEFAULT 'pending', due_date DATE, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY, invoice_number VARCHAR(50), project_id INTEGER, client_id INTEGER,
    amount DECIMAL(15,2) DEFAULT 0, issue_date DATE, due_date DATE, status VARCHAR(30) DEFAULT 'draft',
    certified_gross DECIMAL(15,2) DEFAULT 0, net_amount DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS payment_allocations (
    id SERIAL PRIMARY KEY, payment_id INTEGER, target_type VARCHAR(30) DEFAULT 'client_invoice',
    invoice_id INTEGER, supplier_invoice_id INTEGER, amount DECIMAL(15,2) NOT NULL,
    allocated_by INTEGER, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS project_documents (
    id SERIAL PRIMARY KEY, project_id INTEGER, category_id INTEGER, title VARCHAR(255),
    file_name VARCHAR(255), status VARCHAR(30) DEFAULT 'draft', portal_visibility VARCHAR(30) DEFAULT 'internal')`);
  await q(`CREATE TABLE IF NOT EXISTS project_costs (
    id SERIAL PRIMARY KEY, project_id INTEGER, cost_code_id INTEGER, amount DECIMAL(15,2) DEFAULT 0)`);
  await q(`CREATE TABLE IF NOT EXISTS commitments (
    id SERIAL PRIMARY KEY, commitment_number VARCHAR(50), project_id INTEGER, source_type VARCHAR(50),
    source_id INTEGER, original_amount DECIMAL(15,2) DEFAULT 0, cancelled_amount DECIMAL(15,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'active')`);
  await q(`CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY, entity VARCHAR(100), entity_id INTEGER, action VARCHAR(100),
    "before" JSONB, "after" JSONB, user_id INTEGER, project_id INTEGER,
    entity_type VARCHAR(100), event_type VARCHAR(50), actor_id INTEGER, actor_name VARCHAR(255),
    before_state JSONB DEFAULT '{}', after_state JSONB DEFAULT '{}', created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, key VARCHAR(50), name VARCHAR(100))`);
  await q(`CREATE TABLE IF NOT EXISTS user_project_roles (
    id SERIAL PRIMARY KEY, user_id INTEGER, project_id INTEGER, role_id INTEGER, organization_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS role_permissions (role_id INTEGER, permission_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS permissions (id SERIAL PRIMARY KEY, module VARCHAR(100), action VARCHAR(100))`);

  await q(`INSERT INTO users_ignored_placeholder (id) VALUES (1)`).catch(() => {});
  await q(`INSERT INTO organizations (id, name, org_type) VALUES ($1,$2,$3)`, [7, 'Client Org', 'client']);
  await q(`INSERT INTO organization_users (id, organization_id, user_id, role_at_org, is_active) VALUES ($1,$2,$3,$4,$5)`, [1, 7, 30, 'owner', true]);
  // Project 1: client assigned, FULL data. Project 2: client assigned, ZERO records. Project 3: no client.
  await q(`INSERT INTO projects (id, name, name_en, status, progress_percent, client_id) VALUES ($1,$2,$3,$4,$5,$6)`, [1, 'Tower One', 'Tower One', 'active', 0, 7]);
  await q(`INSERT INTO projects (id, name, name_en, status, progress_percent, client_id) VALUES ($1,$2,$3,$4,$5,$6)`, [2, 'Empty Tower', 'Empty Tower', 'active', 0, 7]);
  await q(`INSERT INTO projects (id, name, status, progress_percent) VALUES ($1,$2,$3,$4)`, [3, 'Internal Only', 'active', 10]);
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled) VALUES ($1,$2,$3,$4,$5)`, [1, 1, 7, 'client', true]);
  await q(`INSERT INTO project_participants (id, project_id, organization_id, participant_type, portal_access_enabled) VALUES ($1,$2,$3,$4,$5)`, [2, 2, 7, 'client', true]);
  // Project 3 deliberately has NO client participant.
}

beforeAll(buildFixture);

// ---------------------------------------------------------------------------
// Scope + the four scenarios
// ---------------------------------------------------------------------------

describe('scoped client auth', () => {
  test('the client sees exactly the assigned projects; an unassigned project is invisible', async () => {
    const projects = await engine.resolveClientProjects(q, CLIENT_USER.id);
    expect(projects).toEqual([1, 2]);
  });

  test('a user with no client organization sees zero projects — setup path, never an error', async () => {
    const dash = await engine.clientDashboard(q, { id: 999, name: 'Ghost', role: 'client' });
    expect(dash.setup_actions).toContain('Assign a client to preview this portal');
    expect(dash.projects.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 1: full data
// ---------------------------------------------------------------------------

describe('dashboard with full data', () => {
  beforeAll(async () => {
    await q(`INSERT INTO boq_items (id, project_id, quantity) VALUES ($1,$2,$3)`, [1, 1, 400]);
    await q(`INSERT INTO quantity_measurements (id, project_id, boq_item_id, measured_date, quantity, approval_state) VALUES ($1,$2,$3,$4,$5,$6)`, [1, 1, 1, TODAY, 100, 'approved']);
    await q(`INSERT INTO project_milestones (id, project_id, title, target_date, achieved_date) VALUES ($1,$2,$3,$4,$5)`, [1, 1, 'Foundation done', '2026-10-01', '2026-09-30']);
    await q(`INSERT INTO work_orders (id, project_id, title, status, planned_start_date, planned_end_date, completion_percentage) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 1, 'Structure works', 'in_progress', '2026-09-01', '2026-12-01', 40]);
    await q(`INSERT INTO photos (id, project_id, caption) VALUES ($1,$2,$3)`, [1, 1, 'Slab pour']);
    await q(`INSERT INTO variations (id, variation_number, project_id, title, variation_type, amount, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 'VAR-0001', 1, 'Add canopy', 'client', 15000, 'incorporated']);
    await q(`INSERT INTO variations (id, variation_number, project_id, title, variation_type, amount, status) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [2, 'VAR-0002', 1, 'Change facade', 'client', 8000, 'client_approval_reject']);
    await q(`INSERT INTO approval_requests (id, module_name, request_type, request_id, project_id, status, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 'variation', 'client_approval', 1, 1, 'pending', '2026-09-01']);
    await q(`INSERT INTO invoices (id, invoice_number, project_id, client_id, amount, certified_gross, net_amount) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [1, 'INV-00001', 1, 7, 40000, 42000, 40000]);
    await q(`INSERT INTO payment_allocations (id, target_type, invoice_id, amount) VALUES ($1,$2,$3,$4)`, [1, 'client_invoice', 1, 25000]);
    await q(`INSERT INTO project_documents (id, project_id, title, status, portal_visibility) VALUES ($1,$2,$3,$4,$5)`, [1, 1, 'Owner handover checklist', 'approved', 'client']);
    // Internal-cost data that MUST NOT leak:
    await q(`INSERT INTO project_costs (id, project_id, amount) VALUES ($1,$2,$3)`, [1, 1, 123456]);
    await q(`INSERT INTO commitments (id, commitment_number, project_id, original_amount, cancelled_amount, status) VALUES ($1,$2,$3,$4,$5,$6)`, [1, 'CM-00001', 1, 99999, 0, 'active']);
  });

  test('client sees certified/billed/paid/outstanding and never cost figures', async () => {
    const raw = await engine.clientDashboard(q, CLIENT_USER, { project_id: 1 });
    const dash = engine.stripInternalFields(raw);
    const health = dash.project_health.find((h) => h.project_id === 1);
    expect(health.progress_percent).toBe(25); // 100 / 400
    const fin = dash.financials.find((f) => f.project_id === 1);
    expect(fin.billed).toBe(40000);
    expect(fin.paid).toBe(25000);
    expect(fin.outstanding).toBe(15000);

    // Stripped server-side: even if a data layer returned these, the client
    // response can never carry them.
    const poisoned = { eac: 1, forecast_profit: 2, committed_cost: 3, unit_cost: 4, nested: { budget: 5, ok: 6 }, list: [{ actual_cost: 7 }, 'x'] };
    expect(engine.stripInternalFields(poisoned)).toEqual({ nested: { ok: 6 }, list: [{}, 'x'] });
  });

  test('variations split approved/pending; action center lists the pending variation', async () => {
    const raw = await engine.clientDashboard(q, CLIENT_USER, { project_id: 1 });
    const dash = engine.stripInternalFields(raw);
    expect(dash.variations.approved_count).toBe(1);
    expect(dash.variations.pending_count).toBe(1);

    const ac = await engine.clientActionCenter(q, CLIENT_USER, { project_id: 1 });
    expect(ac.variation_responses.count).toBe(1);
    expect(ac.variation_responses.items[0].variation_number).toBe('VAR-0002');
    expect(ac.overdue_inputs.count).toBe(1); // approval with due 2026-09-01 < today
  });

  test('portfolio view lists both client projects with health and outstanding', async () => {
    const portfolio = await engine.clientPortfolio(q, CLIENT_USER);
    expect(portfolio.items.length).toBe(2);
    expect(portfolio.is_portfolio).toBe(true);
    expect(portfolio.items[0].outstanding).toBe(15000);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: client assigned, zero records
// ---------------------------------------------------------------------------

describe('zero-record project', () => {
  test('every widget renders its empty label', async () => {
    const raw = await engine.clientDashboard(q, CLIENT_USER, { project_id: 2 });
    const dash = engine.stripInternalFields(raw);
    expect(dash.project_health[0].progress_percent).toBe(0);
    expect(dash.milestones.empty_label).toBe('No milestones defined yet');
    expect(dash.schedule.empty_label).toBe('No scheduled activities yet');
    expect(dash.latest_photos.empty_label).toBe('No progress photos yet');
    expect(dash.variations.empty_label).toBe('No variations raised yet');
    expect(dash.client_approvals_required.empty_label).toBe('No client approvals pending');
    expect(dash.owner_documents.empty_label).toBe('No owner-facing documents yet');
    const fin = dash.financials.find((f) => f.project_id === 2);
    expect(fin).toEqual({ project_id: 2, certified: 0, billed: 0, paid: 0, outstanding: 0 });
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: no client assigned at all
// ---------------------------------------------------------------------------

describe('no client assigned', () => {
  test('project 3 is invisible to the portal and the zero-client response carries setup actions', async () => {
    const projects = await engine.resolveClientProjects(q, CLIENT_USER.id);
    expect(projects).not.toContain(3);
    const dash = await engine.clientDashboard(q, { id: 999, role: 'client' });
    expect(dash.setup_actions.length).toBeGreaterThan(0);
    expect(dash.note).toMatch(/No client is assigned/);
  });
});

// ---------------------------------------------------------------------------
// Server-side gating + preview-as-client
// ---------------------------------------------------------------------------

describe('server-side cost gating and preview mode', () => {
  test('a signed preview is scoped to its requested project even without client_id on projects', async () => {
    const ids = await engine.resolveClientProjects(q, 999, { previewProjectId: 1 });
    expect(ids).toEqual([1]);
    const dashboard = await engine.clientDashboard(q, { id: 999, role: 'client' }, { preview_project_id: 1 });
    expect(dashboard.project_ids).toEqual([1]);
    const unassigned = await engine.clientDashboard(q, { id: 999, role: 'client' }, { preview_project_id: 3 });
    expect(unassigned.setup_actions).toContain('Assign a client to preview this portal');
  });
  test('a client-role user resolves to the all-false visibility flags', async () => {
    const flags = await policy.visibilityFlags(CLIENT_USER, { query: q });
    expect(flags.see_internal_cost).toBe(false);
    expect(flags.see_subcontractor_price).toBe(false);
    // Defense in depth: even poisoned flags are forced safe for the portal.
    const forced = engine.clientVisibilityFlags(CLIENT_USER, { see_internal_cost: true });
    expect(forced.see_internal_cost).toBe(false);
  });

  test('preview-as-client route is read-only by construction and audited (static check)', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'client.js'), 'utf8');
    expect(content).toMatch(/createPreviewToken/);
    expect(content).toMatch(/preview_as_client/); // audited via recordAuditEvent
    expect(content).toMatch(/stripInternalFields/);
  });
});
