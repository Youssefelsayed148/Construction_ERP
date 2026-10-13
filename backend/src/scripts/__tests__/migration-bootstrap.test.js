const fs = require('fs');
const path = require('path');

const scriptsDir = path.join(__dirname, '..');
const backendDir = path.join(scriptsDir, '..', '..');
const { MIGRATIONS } = require('../run-all-migrations');

describe('database bootstrap', () => {
  test('the canonical runner includes the agent layer and only existing scripts', () => {
    expect(MIGRATIONS).toContain('migrate-38-agent-layer.js');
    expect(MIGRATIONS.indexOf('migrate-12.js')).toBeLessThan(MIGRATIONS.indexOf('migrate-16-organizations.js'));
    expect(MIGRATIONS.indexOf('migrate-13.js')).toBeLessThan(MIGRATIONS.indexOf('migrate-27-finance.js'));
    for (const migration of new Set(MIGRATIONS)) {
      expect(fs.existsSync(path.join(scriptsDir, migration))).toBe(true);
    }
  });

  test('Compose runs one-shot migrations before a non-root API container', () => {
    const dockerfile = fs.readFileSync(path.join(backendDir, 'Dockerfile'), 'utf8');
    const composePath = path.join(backendDir, '..', 'docker-compose.yml');
    const pkg = require(path.join(backendDir, 'package.json'));

    expect(pkg.scripts.migrate).toBe('node src/scripts/run-all-migrations.js');
    expect(pkg.scripts['start:migrated']).toBe('npm run migrate && node server.js');
    expect(dockerfile).toContain('USER node');
    expect(dockerfile).toContain('CMD ["npm", "start"]');
    if (fs.existsSync(composePath)) {
      const compose = fs.readFileSync(composePath, 'utf8');
      expect(compose).toContain('migrate:');
      expect(compose).toContain('condition: service_completed_successfully');
      expect(compose).not.toContain('./db_dump:/docker-entrypoint-initdb.d');
    }
  });

  test('fresh database setup contains no predictable owner credential', () => {
    const setupSource = fs.readFileSync(path.join(scriptsDir, 'setupDb.js'), 'utf8');

    expect(setupSource).not.toContain('admin123');
    expect(setupSource).toContain("process.env.SEED_DEFAULT_OWNER === 'true'");
    expect(setupSource).toContain('DEFAULT_OWNER_PASSWORD');
  });

  test('legacy HSE migration can rerun after compatibility views replace its tables', () => {
    const source = fs.readFileSync(path.join(scriptsDir, 'migrate-8.js'), 'utf8');
    expect(source).toContain("relkind IN ('r', 'p')");
    expect(source).toMatch(/idx_safety_inspections_project/);
    expect(source).toMatch(/idx_safety_incidents_project/);
  });

  test('quantity progress views are rebuilt after later phases add table columns', () => {
    const source = fs.readFileSync(path.join(scriptsDir, 'location-quantity-migration.js'), 'utf8');
    expect(source).toMatch(/DROP VIEW IF EXISTS \$\{name\}/);
    expect(source).not.toMatch(/CREATE OR REPLACE VIEW v_boq_/);
  });
});
