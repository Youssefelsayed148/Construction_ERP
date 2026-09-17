// Phase 3 parity tests.
//
// Two layers of coverage:
//   1. Text-based invariants on the migration script + module.
//   2. Semantic parity using an in-memory mock DB (mock-db.js) — runs the
//      actual SQL produced by organizations-migration.js against sample
//      pre-migration data and asserts the post-migration state matches the
//      spec.

const fs = require('fs');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'migrate-16-organizations.js');
const MODULE_PATH = path.join(__dirname, '..', 'organizations-migration.js');
const SERVICE_PATH = path.join(
  __dirname, '..', '..', 'services', 'organizations.js'
);

describe('migrate-16-organizations.js (text invariants)', () => {
  let content;
  beforeAll(() => {
    content = fs.readFileSync(SCRIPT_PATH, 'utf8');
  });

  test('imports and orchestrates the migration module', () => {
    expect(content).toMatch(/require\(['"]\.\/organizations-migration['"]\)/);
    expect(content).toMatch(/migration\.ensureSchema/);
    expect(content).toMatch(/migration\.ensureInternalOrganization/);
    expect(content).toMatch(/migration\.backfillClients/);
    expect(content).toMatch(/migration\.backfillSuppliers/);
    expect(content).toMatch(/migration\.backfillSubcontractors/);
    expect(content).toMatch(/migration\.buildMappingTables/);
    expect(content).toMatch(/migration\.backfillProjectsOrganizationId/);
    expect(content).toMatch(/migration\.backfillProjectParticipants/);
    expect(content).toMatch(/migration\.backfillProjectParticipantUsers/);
  });

  test('uses the existing migration entry-point convention (dotenv + query)', () => {
    expect(content).toMatch(/require\(['"]dotenv['"]\)/);
    expect(content).toMatch(/require\(['"]\.\.\/config\/database['"]\)/);
  });

  test('runs inside one DB transaction (ground rule 2)', () => {
    expect(content).toMatch(/require\(\s*\{\s*transaction\s*\}\s*\)|\{\s*transaction\s*\}\s*=\s*require/);
    expect(content).toMatch(/transaction\(async\s*\(client\)\s*=>/);
  });

  test('captures internalOrgId and passes it to both participant backfills (regression: previously called with no argument, which throws)', () => {
    const internalOrgAssignment = /const\s+internalOrgId\s*=\s*await\s+migration\.ensureInternalOrganization/;
    expect(content).toMatch(internalOrgAssignment);
    expect(content).toMatch(/migration\.backfillProjectParticipants\(\s*txQuery\s*,\s*internalOrgId\s*\)/);
    expect(content).toMatch(/migration\.backfillProjectParticipantUsers\(\s*txQuery\s*,\s*internalOrgId\s*\)/);
  });
});

describe('organizations-migration.js (schema invariants)', () => {
  const m = require(MODULE_PATH);
  const schemaText = m.SCHEMA_STATEMENTS.join('\n');

  test('creates organizations with all expected columns', () => {
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+organizations/i);
    for (const col of ['id', 'code', 'name_ar', 'name_en', 'org_type', 'contact_person',
                       'phone', 'email', 'address', 'city', 'tax_id', 'payment_terms',
                       'status', 'legacy_client_id', 'legacy_supplier_id', 'legacy_subcontractor_id']) {
      expect(schemaText).toMatch(new RegExp(`\\b${col}\\b`, 'i'));
    }
  });

  test('creates organization_contacts, organization_documents, organization_users', () => {
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+organization_contacts/i);
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+organization_documents/i);
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+organization_users/i);
  });

  test('creates project_participants + project_participant_users', () => {
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+project_participants/i);
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+project_participant_users/i);
    expect(schemaText).toMatch(/participant_type\s+VARCHAR/i);
  });

  test('creates location_types, project_locations, wbs_nodes, work_packages', () => {
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+location_types/i);
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+project_locations/i);
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+wbs_nodes/i);
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+work_packages/i);
  });

  test('creates boq_location_allocations with quantity + cost fields', () => {
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+boq_location_allocations/i);
    expect(schemaText).toMatch(/planned_quantity\s+DECIMAL/i);
    expect(schemaText).toMatch(/executed_quantity\s+DECIMAL/i);
    expect(schemaText).toMatch(/certified_quantity\s+DECIMAL/i);
    expect(schemaText).toMatch(/unit_cost\s+DECIMAL/i);
  });

  test('creates the three mapping tables for legacy id ↔ organization id', () => {
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+_migration_client_org_map/i);
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+_migration_supplier_org_map/i);
    expect(schemaText).toMatch(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+_migration_subcontractor_org_map/i);
  });

  test('every CREATE statement uses IF NOT EXISTS (idempotent)', () => {
    const creates = schemaText.match(/CREATE\s+(?:TABLE|UNIQUE\s+INDEX|INDEX)[^;]+/gi) || [];
    for (const c of creates) {
      expect(c).toMatch(/IF NOT EXISTS/i);
    }
  });

  test('every backfill INSERT uses ON CONFLICT DO NOTHING (idempotent)', () => {
    const inserts = m.BACKFILL_STATEMENTS.filter((s) => typeof s === 'string');
    for (const s of inserts) {
      expect(s).toMatch(/ON CONFLICT[^;]*DO NOTHING/i);
    }
  });

  test('location_types seed statement param count matches each seed row length (regression: previously 5 placeholders for 6-element rows, which throws against real Postgres)', () => {
    const sql = m.LOCATION_TYPE_SEED_SQL[0];
    const placeholderCount = (sql.match(/\$\d+/g) || []).length;
    for (const row of m.LOCATION_TYPE_SEED) {
      expect(row.length).toBe(placeholderCount);
    }
  });

  test('alters add organization_id to projects and wbs_node_id to cost_codes', () => {
    const alterText = m.ALTER_STATEMENTS.join('\n');
    expect(alterText).toMatch(/ALTER TABLE\s+projects\s+ADD COLUMN/i);
    expect(alterText).toMatch(/organization_id/i);
    expect(alterText).toMatch(/REFERENCES\s+organizations\(id\)/i);
    expect(alterText).toMatch(/ALTER TABLE\s+cost_codes\s+ADD COLUMN/i);
    expect(alterText).toMatch(/wbs_node_id/i);
    expect(alterText).toMatch(/REFERENCES\s+wbs_nodes\(id\)/i);
  });

  test('does not drop or rename any legacy table or column', () => {
    const allSql = [
      schemaText,
      m.ALTER_STATEMENTS.join('\n'),
      m.BACKFILL_STATEMENTS.filter((s) => typeof s === 'string').join('\n'),
      m.PROJECTS_BACKFILL_SQL,
      m.PROJECT_PARTICIPANTS_SQL,
      m.PROJECT_PARTICIPANT_USERS_SQL,
    ].join('\n');
    expect(allSql).not.toMatch(/DROP\s+(TABLE|COLUMN|INDEX)/i);
    expect(allSql).not.toMatch(/RENAME\s+(TABLE|COLUMN)/i);
    expect(allSql).not.toMatch(/TRUNCATE/i);
  });

  test('does not reintroduce projects.location (already dropped in migrate-12)', () => {
    const allSql = [
      schemaText,
      m.ALTER_STATEMENTS.join('\n'),
      m.BACKFILL_STATEMENTS.filter((s) => typeof s === 'string').join('\n'),
    ].join('\n');
    expect(allSql).not.toMatch(/projects\.location\b/i);
    expect(allSql).not.toMatch(/projects\s*\.\s*location\b/i);
  });

  test('project_participant_users carries employee_id (not just user_id)', () => {
    expect(schemaText).toMatch(/project_participant_users/i);
    expect(schemaText).toMatch(/employee_id\s+INTEGER/i);
  });
});

describe('backend/src/services/organizations.js', () => {
  const service = require(SERVICE_PATH);

  test('exports a unified-column list used by both sides of the cutover', () => {
    expect(Array.isArray(service.UNIFIED_COLUMNS)).toBe(true);
    expect(service.UNIFIED_COLUMNS).toContain('id');
    expect(service.UNIFIED_COLUMNS).toContain('name_ar');
    expect(service.UNIFIED_COLUMNS).toContain('name_en');
  });

  test('LEGACY_TYPES enumerates the three absorbed directories', () => {
    expect(service.LEGACY_TYPES).toEqual(expect.arrayContaining(['client', 'supplier', 'subcontractor']));
  });

  test('resolveParty rejects unknown types', async () => {
    await expect(service.resolveParty({ type: 'alien', id: 1, query: async () => ({ rows: [] }) }))
      .rejects.toThrow(/type must be one of/);
  });

  test('resolveParty prefers organizations over legacy when preferOrg=true', async () => {
    const calls = [];
    const query = async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' '), params });
      if (/FROM\s+organizations\s+o/i.test(sql)) {
        return { rows: [{ id: 99, name_ar: 'Org', code: 'CLI-1' }] };
      }
      return { rows: [] };
    };
    const out = await service.resolveParty({ type: 'client', id: 1, query });
    expect(out.source).toBe('organizations');
    expect(out.row.id).toBe(99);
  });

  test('resolveParty falls back to legacy when no organization mapping exists', async () => {
    const query = async (sql) => {
      if (/FROM\s+organizations/i.test(sql)) return { rows: [] };
      return { rows: [{ id: 1, name_ar: 'Legacy', code: 'CLI-1' }] };
    };
    const out = await service.resolveParty({ type: 'client', id: 1, query });
    expect(out.source).toBe('legacy');
    expect(out.row.id).toBe(1);
  });

  test('resolveParty returns { row: null, source: "none" } when neither side has the row', async () => {
    const query = async () => ({ rows: [] });
    const out = await service.resolveParty({ type: 'client', id: 999, query });
    expect(out).toEqual({ row: null, source: 'none' });
  });

  test('resolveOrganizationByClientId returns the org mapped to a legacy client_id', async () => {
    const query = async (sql, params) => {
      expect(params).toEqual([7]);
      return { rows: [{ id: 100, code: 'CLI-7', name_ar: 'Mapped' }] };
    };
    const r = await service.resolveOrganizationByClientId(7, { query });
    expect(r.id).toBe(100);
  });

  test('resolveOrganizationByClientId returns null when projects.client_id is null', async () => {
    const r = await service.resolveOrganizationByClientId(null, { query: async () => ({ rows: [] }) });
    expect(r).toBeNull();
  });
});

describe('Phase 3 parity: semantic test (mock DB)', () => {
  const { MockDb, tagRowsForExists } = require('../test-helpers/mock-db');
  const migration = require(MODULE_PATH);

  function seed() {
    const db = new MockDb();
    // projects
    db.table('projects').rows.push(
      { id: 1, name: 'Alpha', client_id: 10, project_manager_id: 1, organization_id: null },
      { id: 2, name: 'Beta',  client_id: 20, project_manager_id: 2, organization_id: null },
      { id: 3, name: 'Gamma', client_id: null, project_manager_id: null, organization_id: null }
    );
    // employees
    db.table('employees').rows.push(
      { id: 1, code: 'EMP-0001', name_ar: 'Alice', email: 'alice@test' },
      { id: 2, code: 'EMP-0002', name_ar: 'Bob',   email: 'bob@test' },
      { id: 3, code: 'EMP-0003', name_ar: 'Carol', email: null }
    );
    // users (login accounts matched by email)
    db.table('users').rows.push(
      { id: 100, email: 'alice@test', name: 'Alice', role: 'engineer', department: 'Eng', is_active: true },
      { id: 101, email: 'bob@test',   name: 'Bob',   role: 'engineer', department: 'Eng', is_active: true },
      // Carol has no user — her project_team row should not get a project_participant_user.
    );
    // project_team
    db.table('project_team').rows.push(
      { id: 1, project_id: 1, employee_id: 1, role: 'site_engineer', assigned_at: new Date('2026-01-01') },
      { id: 2, project_id: 1, employee_id: 2, role: 'qs',             assigned_at: new Date('2026-01-01') },
      { id: 3, project_id: 2, employee_id: 1, role: 'site_engineer', assigned_at: new Date('2026-02-01') },
      { id: 4, project_id: 2, employee_id: 3, role: 'foreman',        assigned_at: new Date('2026-02-01') },
    );
    // clients
    db.table('clients').rows.push(
      { id: 10, code: 'CLI-0010', name_ar: 'Client A', name_en: 'Client A EN', contact_person: 'Mr A', phone: '111', email: 'a@test', address: 'addr A', city: 'Cairo', tax_id: 'TX-A', payment_terms: 'Net 30', credit_limit: 1000, is_active: true },
      { id: 20, code: 'CLI-0020', name_ar: 'Client B', name_en: 'Client B EN', contact_person: 'Mr B', phone: '222', email: 'b@test', address: 'addr B', city: 'Alex',  tax_id: 'TX-B', payment_terms: 'Net 30', credit_limit: 2000, is_active: true }
    );
    // suppliers
    db.table('suppliers').rows.push(
      { id: 30, code: 'SUP-0030', name_ar: 'Supplier A', name_en: 'Supplier A EN', contact_person: 'Ms S', phone: '333', email: 's@test', address: 'addr S', city: 'Cairo', tax_id: 'TX-S', payment_terms: 'Net 60', specialty: 'steel', is_active: true }
    );
    // subcontractors
    db.table('subcontractors').rows.push(
      { id: 40, code: 'SUB-0040', name: 'Sub A', name_en: 'Sub A EN', name_ar: 'مقاول أ', contact_person: 'Mr SB', phone: '444', email: 'sb@test', address: 'addr SB', classification: 'electrical', license_no: 'L-1', bank_name: 'Bank X', bank_account: 'B-1', insurance_amount: 0, insurance_expiry: null, rating: 4.5, specialties: ['electrical'], is_active: true }
    );
    return db;
  }

  test('count(project_team) == count(project_participant_users) per project', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);

    const teamByProject = {};
    for (const r of db.table('project_team').rows) {
      teamByProject[r.project_id] = (teamByProject[r.project_id] || 0) + 1;
    }
    const ppUsersByProject = {};
    for (const ppu of db.table('project_participant_users').rows) {
      const pp = db.table('project_participants').rows.find((p) => p.id === ppu.project_participant_id);
      if (!pp) continue;
      if (pp.participant_type !== 'internal_team_member') continue;
      ppUsersByProject[pp.project_id] = (ppUsersByProject[pp.project_id] || 0) + 1;
    }

    // Project 1 has 2 team members who both have user matches (alice + bob) → 2 participant_users.
    // Project 2 has 2 team members: alice (matched) + carol (no user) → 1 participant_user.
    expect(teamByProject[1]).toBe(2);
    expect(ppUsersByProject[1]).toBe(2);
    expect(teamByProject[2]).toBe(2);
    expect(ppUsersByProject[2]).toBe(1);
  });

  test('every client_id resolves to the same organization via both old and new path', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);

    // Old path: projects.client_id = 10 → clients.id = 10
    // New path: projects.organization_id → _migration_client_org_map → organizations.id
    for (const p of db.table('projects').rows) {
      if (p.client_id === null) {
        expect(p.organization_id).toBeNull();
        continue;
      }
      const client = db.table('clients').rows.find((c) => c.id === p.client_id);
      expect(client).toBeDefined();
      const map = db.table('_migration_client_org_map').rows.find((m) => m.old_client_id === client.id);
      expect(map).toBeDefined();
      expect(p.organization_id).toBe(map.organization_id);
      const org = db.table('organizations').rows.find((o) => o.id === map.organization_id);
      expect(org).toBeDefined();
      expect(org.org_type).toBe('client');
      expect(org.code).toBe(client.code);
      expect(org.name_ar).toBe(client.name_ar);
    }
  });

  test('count(clients) == count(organizations WHERE org_type=client)', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);

    const clientCount = db.table('clients').rows.length;
    const orgClientCount = db.table('organizations').rows.filter((o) => o.org_type === 'client').length;
    expect(orgClientCount).toBe(clientCount);
  });

  test('count(suppliers) == count(organizations WHERE org_type=supplier)', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);

    const n = db.table('suppliers').rows.length;
    const orgs = db.table('organizations').rows.filter((o) => o.org_type === 'supplier').length;
    expect(orgs).toBe(n);
  });

  test('count(subcontractors) == count(organizations WHERE org_type=subcontractor)', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);

    const n = db.table('subcontractors').rows.length;
    const orgs = db.table('organizations').rows.filter((o) => o.org_type === 'subcontractor').length;
    expect(orgs).toBe(n);
  });

  test('migration is re-runnable: second run does not duplicate rows', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);
    const orgs1 = db.table('organizations').rows.length;
    const maps1 = db.table('_migration_client_org_map').rows.length;
    const pps1 = db.table('project_participants').rows.length;
    const ppus1 = db.table('project_participant_users').rows.length;

    await migration.migrate(db.query);
    expect(db.table('organizations').rows.length).toBe(orgs1);
    expect(db.table('_migration_client_org_map').rows.length).toBe(maps1);
    expect(db.table('project_participants').rows.length).toBe(pps1);
    expect(db.table('project_participant_users').rows.length).toBe(ppus1);
  });

  test('INTERNAL sentinel organization exists with org_type=internal', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);
    const sentinel = db.table('organizations').rows.find((o) => o.org_type === 'internal');
    expect(sentinel).toBeDefined();
    expect(sentinel.code).toBe('INTERNAL');
  });

  test('every project_participant for an internal team member references the INTERNAL org', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);
    const sentinel = db.table('organizations').rows.find((o) => o.org_type === 'internal');
    const internalParticipants = db.table('project_participants').rows.filter((p) => p.participant_type === 'internal_team_member');
    expect(internalParticipants.length).toBeGreaterThan(0);
    for (const p of internalParticipants) {
      expect(p.organization_id).toBe(sentinel.id);
    }
  });

  test('service resolver (organizations.js) finds the migrated organization for each legacy client_id', async () => {
    const db = seed();
    tagRowsForExists(db);
    await migration.migrate(db.query);

    const service = require(SERVICE_PATH);
    for (const client of db.table('clients').rows) {
      const out = await service.resolveParty({ type: 'client', id: client.id, preferOrg: true, query: db.query });
      expect(out.source).toBe('organizations');
      expect(out.row.code).toBe(client.code);
    }
  });
});
