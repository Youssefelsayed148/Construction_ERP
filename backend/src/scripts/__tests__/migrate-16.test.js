// Unit tests for the Phase 2 migration (migrate-16.js).
//
// These tests do not require a running PostgreSQL instance. They parse the
// migration's source as text and assert:
//   - the right tables are touched,
//   - the right column type and FK relationship is declared,
//   - the SQL is idempotent (ADD COLUMN IF NOT EXISTS),
//   - no destructive operations are issued,
//   - index DDL is present.
//
// A live DB is exercised separately by `node backend/src/scripts/migrate-16.js`
// against a dev database. See OUT_OF_SPEC_MODULE_DECISIONS.md §7.

const fs = require('fs');
const path = require('path');

const MIGRATION_PATH = path.join(__dirname, '..', 'migrate-16.js');

describe('migrate-16.js', () => {
  let content;
  let alterStatements;
  let createIndexStatements;

  beforeAll(() => {
    content = fs.readFileSync(MIGRATION_PATH, 'utf8');
    alterStatements = content.match(/ALTER TABLE[^;]+/g) || [];
    createIndexStatements = content.match(/CREATE INDEX[^;]+/g) || [];
  });

  test('file exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(200);
  });

  test.each([
    ['attendance'],
    ['maintenance_reminders'],
    ['legal_documents'],
  ])('adds project_id to %s', (tableName) => {
    const re = new RegExp(
      `ALTER TABLE\\s+${tableName}\\s+ADD COLUMN IF NOT EXISTS\\s+project_id\\s+INTEGER`,
      'i'
    );
    expect(content).toMatch(re);
  });

  test('every ALTER TABLE statement uses ADD COLUMN IF NOT EXISTS (idempotent)', () => {
    expect(alterStatements.length).toBeGreaterThanOrEqual(3);
    for (const stmt of alterStatements) {
      expect(stmt).toMatch(/ADD COLUMN IF NOT EXISTS/i);
    }
  });

  test('project_id columns are nullable (no NOT NULL)', () => {
    for (const stmt of alterStatements) {
      if (!/project_id/i.test(stmt)) continue;
      expect(stmt).not.toMatch(/project_id[^,\n]*NOT NULL/i);
    }
  });

  test('project_id columns reference projects(id) with ON DELETE SET NULL', () => {
    const fkClause = /REFERENCES\s+projects\(id\)\s+ON DELETE SET NULL/i;
    const fkStatements = alterStatements.filter((s) => /project_id/i.test(s));
    expect(fkStatements.length).toBeGreaterThanOrEqual(3);
    for (const stmt of fkStatements) {
      expect(stmt).toMatch(fkClause);
    }
  });

  test('does not drop or rename any column or table', () => {
    expect(content).not.toMatch(/DROP\s+COLUMN/i);
    expect(content).not.toMatch(/DROP\s+TABLE/i);
    expect(content).not.toMatch(/RENAME\s+(COLUMN|TABLE)/i);
    expect(content).not.toMatch(/TRUNCATE/i);
    expect(content).not.toMatch(/DELETE\s+FROM/i);
  });

  test('adds a supporting index for each new project_id column', () => {
    const expectedIndexes = [
      'idx_attendance_project',
      'idx_maintenance_reminders_project',
      'idx_legal_documents_project',
    ];
    for (const indexName of expectedIndexes) {
      const re = new RegExp(`CREATE INDEX IF NOT EXISTS\\s+${indexName}`, 'i');
      expect(content).toMatch(re);
    }
  });

  test('index DDL is also idempotent (IF NOT EXISTS)', () => {
    expect(createIndexStatements.length).toBeGreaterThanOrEqual(3);
    for (const stmt of createIndexStatements) {
      expect(stmt).toMatch(/CREATE INDEX IF NOT EXISTS/i);
    }
  });

  test('does not introduce a new authorization or authorization-related table', () => {
    // Phase 2 explicitly does not change role/permission tables.
    expect(content).not.toMatch(/CREATE\s+TABLE/i);
    expect(content).not.toMatch(/users/i);
    expect(content).not.toMatch(/module_permissions/i);
  });
});
