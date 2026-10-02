// Phase 5 tests — project creation wizard.
//
//   1. blank project with no client/consultant (empty-state contract),
//   2. create from the Residential Tower template (2 towers × 12 floors ×
//      4 units/floor — the Phase 31 seed shape),
//   3. infrastructure project using chainage-type locations,
//   4. deliberately-failed provisioning retry — no duplicate rows exist.
//
// All tests run against the in-memory mock-db with a snapshot/rollback
// transaction wrapper, so the atomicity contract is exercised without a live
// PostgreSQL instance.

const { MockDb } = require('../test-helpers/mock-db');
const migration = require('../project-wizard-migration');
const provisioning = require('../../services/projectProvisioning');

// ---------------------------------------------------------------------------
// Transactional mock runner: BEGIN (snapshot) → fn → COMMIT keeps rows;
// a throw rolls the snapshot back, proving no half-created project.
// ---------------------------------------------------------------------------

function snapshot(db) {
  const snap = { tables: new Map(), serial: new Map(), counters: new Map(db.counters || []) };
  for (const [name, t] of db.tables) {
    snap.tables.set(name, t.rows.map((r) => ({ ...r })));
    snap.serial.set(name, db.serial.get(name) || 0);
  }
  return snap;
}

function restore(db, snap) {
  for (const [name, rows] of snap.tables) {
    if (db.tables.has(name)) db.table(name).rows = rows.map((r) => ({ ...r }));
  }
  for (const [name, v] of snap.serial) db.serial.set(name, v);
  db.counters = new Map(snap.counters); // document_counters roll back with their transaction
}

async function withTransaction(db, fn) {
  const snap = snapshot(db);
  try {
    const client = { query: (sql, params) => db.query(sql, params) };
    return await fn(client);
  } catch (e) {
    restore(db, snap);
    throw e;
  }
}

const count = (db, table) => db.table(table).rows.length;

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

async function buildFixture() {
  const db = new MockDb();
  const q = (sql, params) => db.query(sql, params);

  await q(`CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL, name_en VARCHAR(255), name_ar VARCHAR(255),
    code VARCHAR(50) UNIQUE NOT NULL, location VARCHAR(255),
    project_type VARCHAR(100) DEFAULT 'commercial',
    client_id INTEGER, project_manager_id INTEGER,
    contract_value DECIMAL(15,2) DEFAULT 0, budget DECIMAL(15,2) DEFAULT 0,
    start_date DATE, expected_completion DATE, actual_completion DATE,
    status VARCHAR(50) DEFAULT 'planning',
    completion_percentage DECIMAL(5,2) DEFAULT 0,
    project_number VARCHAR(50), country VARCHAR(100),
    gps_latitude DECIMAL(10,7), gps_longitude DECIMAL(10,7),
    timezone VARCHAR(64) DEFAULT 'Africa/Cairo', currency VARCHAR(8) DEFAULT 'EGP',
    tax_profile VARCHAR(50) DEFAULT 'standard_vat',
    original_contract_value DECIMAL(15,2), original_budget DECIMAL(15,2),
    dlp_period_months INTEGER, warranty_period_months INTEGER,
    retention_percentage DECIMAL(5,2), retention_cap_amount DECIMAL(15,2),
    advance_payment_amount DECIMAL(15,2), advance_payment_percentage DECIMAL(5,2),
    liquidated_damages_rate DECIMAL(5,2), liquidated_damages_cap DECIMAL(15,2),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await migration.ensureTables(q);

  // Phase 3 tables the provisioning touches.
  await q(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, code VARCHAR(100), name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS location_types (
    id SERIAL PRIMARY KEY, code VARCHAR(50) UNIQUE, name VARCHAR(255),
    name_en VARCHAR(255), name_ar VARCHAR(255), parent_id INTEGER, sort_order INTEGER, is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS project_locations (
    id SERIAL PRIMARY KEY, project_id INTEGER, parent_id INTEGER, location_type_id INTEGER,
    code VARCHAR(50), name VARCHAR(255), name_en VARCHAR(255), name_ar VARCHAR(255),
    sort_order INTEGER, is_active BOOLEAN, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS wbs_nodes (
    id SERIAL PRIMARY KEY, project_id INTEGER, parent_id INTEGER, code VARCHAR(50),
    name VARCHAR(255), name_en VARCHAR(255), name_ar VARCHAR(255),
    wbs_level INTEGER, sort_order INTEGER, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS project_participants (
    id SERIAL PRIMARY KEY, project_id INTEGER, organization_id INTEGER,
    participant_type VARCHAR(100), role_label VARCHAR(100), active_from TIMESTAMPTZ,
    active_to TIMESTAMPTZ, portal_access_enabled BOOLEAN, visibility_policy VARCHAR(50))`);
  await q(`CREATE TABLE IF NOT EXISTS project_team (
    id SERIAL PRIMARY KEY, project_id INTEGER, employee_id INTEGER, role VARCHAR(100), assigned_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, code VARCHAR(50), name VARCHAR(255), email VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), password VARCHAR(255),
    role VARCHAR(100), department VARCHAR(255), module_permissions TEXT[],
    is_active BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS roles (id SERIAL PRIMARY KEY, key VARCHAR(100), name VARCHAR(255), is_system BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS user_project_roles (
    id SERIAL PRIMARY KEY, user_id INTEGER, project_id INTEGER, role_id INTEGER,
    organization_id INTEGER, granted_by INTEGER, granted_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS _migration_client_org_map (
    id SERIAL PRIMARY KEY, old_client_id INTEGER, organization_id INTEGER)`);

  await q("INSERT INTO organizations (code, name) VALUES ('INTERNAL', 'Internal')");
  await q(`INSERT INTO roles (key, name, is_system) VALUES ('owner', 'Owner', true)`);
  await q(`INSERT INTO roles (key, name, is_system) VALUES ('site_supervisor', 'Site Supervisor', true)`);

  // Phase 31-style location types exist from Phase 3; wizard adds unit/chainage.
  await q(`INSERT INTO location_types (code, name) VALUES ('site', 'Site')`);
  await q(`INSERT INTO roles (key, name) VALUES ('project_manager', 'PM')`);

  return { db, q };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('phase 5 migration', () => {
  test('adds all 17 wizard columns to projects via ADD COLUMN IF NOT EXISTS', () => {
    expect(migration.PROJECT_COLUMNS.length).toBe(17);
    for (const stmt of migration.ALTER_STATEMENTS) {
      expect(stmt).toMatch(/ALTER TABLE projects ADD COLUMN IF NOT EXISTS/i);
    }
    const all = migration.ALTER_STATEMENTS.join('\n');
    for (const col of ['project_number', 'country', 'gps_latitude', 'gps_longitude', 'timezone', 'currency', 'tax_profile', 'original_contract_value', 'original_budget', 'dlp_period_months', 'warranty_period_months', 'retention_percentage', 'retention_cap_amount', 'advance_payment_amount', 'advance_payment_percentage', 'liquidated_damages_rate', 'liquidated_damages_cap']) {
      expect(all).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${col}\\b`, 'i'));
    }
  });

  test('creates the six template tables and five runtime provisioning tables', () => {
    const ddl = migration.TABLE_DDL.join('\n');
    for (const t of ['project_templates', 'template_locations', 'template_wbs', 'template_folders', 'template_workflows', 'template_approval_rules', 'project_folders', 'project_registers', 'numbering_sequences', 'project_workflows', 'project_dashboard_preferences']) {
      expect(ddl).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`, 'i'));
    }
  });

  test('seeds the Residential Tower template with the Phase 31 shape', async () => {
    const { db, q } = await buildFixture();
    await migration.ensureLocationTypeSeed(q);
    await migration.seedTemplates(q);
    const t = migration.buildResidentialTowerTemplate();
    // 2 towers + 2×12 floors + 2×12×4 units
    expect(t.locations.length).toBe(2 + 24 + 96);
    const units = t.locations.filter((l) => l.location_type === 'unit');
    expect(units.length).toBe(96);
    expect(db.table('template_locations').rows.length).toBe(122);
    expect(db.table('template_wbs').rows.length).toBe(t.wbs.length);
    expect(db.table('template_folders').rows.length).toBe(t.folders.length);
    expect(db.table('template_workflows').rows.length).toBe(t.workflows.length);
    expect(db.table('template_approval_rules').rows.length).toBe(t.approvalRules.length);
  });

  test('seeds unit + chainage location types (idempotent)', async () => {
    const { q } = await buildFixture();
    await q(`INSERT INTO location_types (code, name) VALUES ('site', 'Site')`);
    await migration.ensureLocationTypeSeed(q);
    const res = await q('SELECT * FROM location_types');
    const codes = res.rows.map((r) => r.code);
    expect(codes).toContain('unit');
    expect(codes).toContain('chainage');
    // re-run adds nothing
    await migration.ensureLocationTypeSeed(q);
    const again = await q('SELECT * FROM location_types');
    expect(again.rows.length).toBe(res.rows.length);
  });
});

// ---------------------------------------------------------------------------
// Scenario 1: blank project, no client/consultant
// ---------------------------------------------------------------------------

describe('scenario: blank project with no client/consultant', () => {
  test('provisions the full default set and keeps the client empty state', async () => {
    const { db, q } = await buildFixture();
    await migration.run(q);
    const before = { projects: count(db, 'projects'), locations: count(db, 'project_locations'), wbs: count(db, 'wbs_nodes') };

    const result = await withTransaction(db, (client) =>
      provisioning.provisionProject({
        name_en: 'Blank Tower', name_ar: 'مشروع فارغ', project_type: 'commercial',
      }, { client })
    );

    // Project row with code + wizard defaults.
    expect(db.table('projects').rows.length).toBe(before.projects + 1);
    const project = result.project;
    expect(project.code).toBe('PRJ-0001');
    expect(project.client_id).toBe(null);
    expect(project.currency).toBe('EGP');
    expect(project.timezone).toBe('Africa/Cairo');

    // Root location + root WBS only (no template structure).
    expect(count(db, 'project_locations')).toBe(before.locations + 1);
    expect(count(db, 'wbs_nodes')).toBe(before.wbs + 1);

    // Default provisioning artifacts.
    expect(count(db, 'project_folders')).toBe(provisioning.DEFAULT_FOLDERS.length);
    expect(count(db, 'project_registers')).toBe(provisioning.DEFAULT_REGISTERS.length);
    expect(count(db, 'numbering_sequences')).toBe(provisioning.NUMBERED_ENTITIES.length);
    expect(count(db, 'project_workflows')).toBe(provisioning.DEFAULT_WORKFLOWS.length);
    expect(count(db, 'project_dashboard_preferences')).toBe(provisioning.DEFAULT_DASHBOARD_PREFERENCES.length);

    // Participants: internal only — no client participant row, no error.
    expect(count(db, 'project_participants')).toBe(1);
    const participants = db.table('project_participants').rows;
    expect(participants.every((p) => p.participant_type !== 'client')).toBe(true);

    // Empty-state contract for the Phase 17 client portal.
    expect(provisioning.resolveClientLabel({ client_id: null })).toBe('No client assigned');
    expect(provisioning.resolveClientLabel(project)).toBe('No client assigned');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: create from the Residential Tower template
// ---------------------------------------------------------------------------

describe('scenario: create from the Residential Tower template', () => {
  test('provisions the full structure atomically', async () => {
    const { db, q } = await buildFixture();
    await migration.run(q);

    const before = { projects: count(db, 'projects'), locations: count(db, 'project_locations'), wbs: count(db, 'wbs_nodes') };
    const result = await withTransaction(db, (client) =>
      provisioning.provisionProject({
        name_en: 'Marina Heights', name_ar: 'مارينا هايتس', project_type: 'residential',
        template_key: 'residential_tower',
        original_contract_value: 250000000, retention_percentage: 5,
      }, { client })
    );

    expect(result.project.code).toBe('PRJ-0001');
    // Structure: root + 122 template locations, root + 8 template WBS nodes.
    expect(count(db, 'project_locations')).toBe(before.locations + 123);
    expect(count(db, 'wbs_nodes')).toBe(before.wbs + 9);

    // Hierarchy integrity: Tower A floors parent to Tower A.
    const locs = db.table('project_locations').rows;
    const towerA = locs.find((l) => l.code === 'T-A');
    const floorA5 = locs.find((l) => l.code === 'T-A-F05');
    expect(floorA5.parent_id).toBe(towerA.id);
    const unit = locs.find((l) => l.code === 'T-B-F12-U4');
    const towerB = locs.find((l) => l.code === 'T-B');
    const floorB12 = locs.find((l) => l.code === 'T-B-F12');
    expect(floorB12.parent_id).toBe(towerB.id);
    expect(unit.parent_id).toBe(floorB12.id);

    // WBS parentage: 300-1 parents to 300.
    const nodes = db.table('wbs_nodes').rows;
    const wbs300 = nodes.find((n) => n.code === '300');
    const wbs301 = nodes.find((n) => n.code === '300-1');
    expect(wbs301.parent_id).toBe(wbs300.id);

    // Template defaults flowed into the project row; explicit values win.
    expect(result.project.timezone).toBe('Africa/Cairo');
    expect(result.project.retention_percentage).toBe(5);
    expect(result.project.dlp_period_months).toBe(12);

    // Workflows from the template, folders from the template, numbering.
    expect(count(db, 'project_workflows')).toBe(3);
    expect(count(db, 'project_folders')).toBe(7);
    expect(count(db, 'project_registers')).toBe(4);
    expect(count(db, 'numbering_sequences')).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: infrastructure project with chainage-type locations
// ---------------------------------------------------------------------------

describe('scenario: infrastructure project with chainage locations', () => {
  test('custom structure rows resolve parents and chainage type', async () => {
    const { db, q } = await buildFixture();
    await migration.run(q);

    const result = await withTransaction(db, (client) =>
      provisioning.provisionProject({
        name_en: 'Cairo Ring Road Upgrade', name_ar: 'تطوير دائري القاهرة',
        project_type: 'infrastructure',
        structure: [
          { code: 'CH-0', name: 'Chainage 0+000', location_type_code: 'chainage' },
          { parent_code: 'CH-0', code: 'CH-500', name: 'Chainage 0+500', location_type_code: 'chainage', sort_order: 2 },
          { parent_code: 'CH-500', code: 'BR-1', name: 'Overpass 1', location_type_code: 'area', sort_order: 3 },
        ],
      }, { client })
    );

    expect(result.project.project_type).toBe('infrastructure');
    const locs = db.table('project_locations').rows;
    const types = db.table('location_types').rows;
    const chainageType = types.find((t) => t.code === 'chainage');
    expect(chainageType).toBeDefined();
    const root = locs.find((l) => l.code === 'ROOT');
    const ch0 = locs.find((l) => l.code === 'CH-0');
    expect(ch0.parent_id).toBe(root.id);
    expect(ch0.location_type_id).toBe(chainageType.id);
    const br1 = locs.find((l) => l.code === 'BR-1');
    expect(br1.parent_id).toBe(locs.find((l) => l.code === 'CH-500').id);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: deliberately-failed provisioning retry
// ---------------------------------------------------------------------------

describe('scenario: failed provisioning leaves no duplicate rows', () => {
  test('a failure mid-transaction rolls back everything; retry succeeds cleanly', async () => {
    const { db, q } = await buildFixture();
    await migration.run(q);

    // First, a good provisioning to establish the baseline row counts.
    await withTransaction(db, (client) =>
      provisioning.provisionProject({ name_en: 'Good One', name_ar: 'جيد', project_type: 'commercial' }, { client })
    );
    const baseline = {
      projects: count(db, 'projects'),
      locations: count(db, 'project_locations'),
      wbs: count(db, 'wbs_nodes'),
      workflows: count(db, 'project_workflows'),
      folders: count(db, 'project_folders'),
      registers: count(db, 'project_registers'),
      numbering: count(db, 'numbering_sequences'),
      prefs: count(db, 'project_dashboard_preferences'),
      participants: count(db, 'project_participants'),
      team: count(db, 'project_team'),
      upr: count(db, 'user_project_roles'),
    };

    // Retry with a client that blows up mid-way (at the workflows step).
    const bomb = {
      query: async (sql, params) => {
        if (/INSERT INTO\s+project_workflows/i.test(sql)) {
          throw new Error('deliberate failure: workflow engine unavailable');
        }
        return db.query(sql, params);
      },
    };
    await expect(withTransaction(db, (client) =>
      provisioning.provisionProject({ name_en: 'Bad One', name_ar: 'سيء', project_type: 'commercial' }, { client: bomb })
    )).rejects.toThrow(/deliberate failure/);

    // Nothing from the failed attempt survived — exact baseline counts.
    expect(count(db, 'projects')).toBe(baseline.projects);
    expect(count(db, 'project_locations')).toBe(baseline.locations);
    expect(count(db, 'wbs_nodes')).toBe(baseline.wbs);
    expect(count(db, 'project_workflows')).toBe(baseline.workflows);
    expect(count(db, 'project_folders')).toBe(baseline.folders);
    expect(count(db, 'project_registers')).toBe(baseline.registers);
    expect(count(db, 'numbering_sequences')).toBe(baseline.numbering);
    expect(count(db, 'project_dashboard_preferences')).toBe(baseline.prefs);
    expect(count(db, 'project_participants')).toBe(baseline.participants);
    expect(db.table('projects').rows.filter((p) => p.name_en === 'Bad One')).toEqual([]);

    // Retry the same payload with a healthy client — succeeds, no duplicates.
    const retry = await withTransaction(db, (client) =>
      provisioning.provisionProject({ name_en: 'Good Two', name_ar: 'جيد اثنان', project_type: 'commercial' }, { client })
    );
    expect(retry.project.code).toBe('PRJ-0002');
    expect(count(db, 'numbering_sequences')).toBe(baseline.numbering + provisioning.NUMBERED_ENTITIES.length);
    const keys = db.table('numbering_sequences').rows
      .filter((n) => n.project_id === retry.project.id)
      .map((n) => `${n.project_id}:${n.entity}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('provisionProject without a transaction client is rejected (atomicity guard)', async () => {
    await expect(provisioning.provisionProject({ name_ar: 'x' })).rejects.toThrow(/transaction client/);
  });
});

// ---------------------------------------------------------------------------
// Team + user_project_roles
// ---------------------------------------------------------------------------

describe('wizard team assignment creates user_project_roles', () => {
  test('employee with a linked login account gets a project role row', async () => {
    const { db, q } = await buildFixture();
    await migration.run(q);
    await q("INSERT INTO users (id, email, role, is_active) VALUES ($1, $2, $3, $4)", [10, 'pm@x.com', 'site_supervisor', true]);
    await q("INSERT INTO roles (key, name) VALUES ($1, $2)", ['site_supervisor', 'Site Supervisor']);
    await q("INSERT INTO employees (id, name, email) VALUES ($1, $2, $3)", [50, 'PM Person', 'pm@x.com']);

    const result = await withTransaction(db, (client) =>
      provisioning.provisionProject({
        name_en: 'Team Project', name_ar: 'فريق', project_type: 'residential',
        team: [{ employee_id: 50, email: 'pm@x.com', role: 'project_manager' }],
      }, { client })
    );

    expect(count(db, 'project_team')).toBe(1);
    const upr = db.table('user_project_roles').rows.filter((r) => r.project_id === result.project.id);
    expect(upr.length).toBe(1);
    expect(Number(upr[0].user_id)).toBe(10);
    expect(upr[0].role_id).not.toBe(null);
  });
});
