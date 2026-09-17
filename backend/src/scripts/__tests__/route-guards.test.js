// Tests for route guard coverage — updated for Phase 4.
//
// In Phase 2 this file only asserted TODO(phase-4) markers existed on every
// unguarded route. Phase 4 replaces those markers with real guards: every
// route now carries the authorize() middleware (backed by the scoped policy
// engine), so the marker assertions are replaced with guard assertions.
//
//   - every route in legal.js, assets.js, maintenance.js, hr.js keeps its
//     `authenticate` middleware,
//   - every route in those files now has an authorize() middleware,
//   - no TODO(phase-4) markers remain anywhere in backend/src/routes,
//   - the explicit owner|admin / owner|admin|finance_manager call sites are
//     preserved (they remain a coarse filter on top of the policy decision).

const fs = require('fs');
const path = require('path');

const ROUTES_DIR = path.join(__dirname, '..', '..', 'routes');

const ROUTE_FILES = [
  { file: 'legal.js', expectedRouteCount: 5 },
  { file: 'assets.js', expectedRouteCount: 10 },
  { file: 'maintenance.js', expectedRouteCount: 5 },
  { file: 'hr.js', expectedRouteCount: 19 },
];

describe.each(ROUTE_FILES)('route file $file', ({ file, expectedRouteCount }) => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
  });

  test('imports authenticate and authorize from middleware/auth', () => {
    expect(content).toMatch(
      /require\(['"]\.\.\/middleware\/auth['"]\)/,
      `${file} must require the auth middleware`
    );
    expect(content).toMatch(/\bauthenticate\b/);
    expect(content).toMatch(/authorize/);
  });

  test('no TODO(phase-4) markers remain (replaced by real guards in Phase 4)', () => {
    const matches = content.match(/\/\/\s*TODO\(phase-4\)/g) || [];
    expect(matches).toEqual([]);
  });

  test('number of route definitions matches expected count', () => {
    const routerCalls = content.match(/router\.(get|post|put|delete)\s*\(/g) || [];
    expect(routerCalls.length).toBe(expectedRouteCount);
  });
});

describe('every guarded route carries authorize() (static check)', () => {
  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.js'));

  test('route files exist', () => {
    expect(files.length).toBe(28);
  });

  test.each(files)('%s has no bare authenticate-only route lines', (file) => {
    const content = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!/router\.(get|post|put|delete)\s*\(/.test(line)) continue;
      // Public routes are the explicit exception: /login (no authenticate).
      if (file === 'auth.js' && /router\.post\('\/login'/.test(line)) continue;
      expect(line).toMatch(/\bauthenticate\b/);
      expect(line).toMatch(/\bauthorize\b/);
    }
  });
});

describe('existing role guards are untouched (coarse filter preserved)', () => {
  test('hr.js retains owner|admin guards on employee CRUD and leave approval', () => {
    const content = fs.readFileSync(path.join(ROUTES_DIR, 'hr.js'), 'utf8');
    const ownerAdminCount = (content.match(/authorize\(\s*['"]owner['"]\s*,\s*['"]admin['"]\s*\)/g) || []).length;
    expect(ownerAdminCount).toBe(4); // POST/PUT/DELETE /employees + PUT /leaves/:id
  });

  test('payroll.js retains owner|admin|finance_manager on POST and owner|admin on DELETE', () => {
    const content = fs.readFileSync(path.join(ROUTES_DIR, 'payroll.js'), 'utf8');
    expect(content).toMatch(/authorize\(\s*['"]owner['"]\s*,\s*['"]admin['"]\s*,\s*['"]finance_manager['"]\s*\)/);
    expect(content).toMatch(/authorize\(\s*['"]owner['"]\s*,\s*['"]admin['"]\s*\)/);
  });

  test('auth.js register retains owner|admin', () => {
    const content = fs.readFileSync(path.join(ROUTES_DIR, 'auth.js'), 'utf8');
    expect(content).toMatch(/authorize\(\s*['"]owner['"]\s*,\s*['"]admin['"]\s*\)/);
  });

  test('users.js retains owner|admin on management routes and guards the preview demo mode with it', () => {
    const content = fs.readFileSync(path.join(ROUTES_DIR, 'users.js'), 'utf8');
    expect(content).toMatch(/router\.post\('\/preview\/:role',\s*authenticate,\s*authorize\(\s*['"]owner['"]\s*,\s*['"]admin['"]\s*\)/);
    const ownerAdminCount = (content.match(/authorize\(\s*['"]owner['"]\s*,\s*['"]admin['"]\s*\)/g) || []).length;
    expect(ownerAdminCount).toBe(6); // GET /, GET /preview/roles, GET /:id, PUT /:id, DELETE /:id, POST /preview/:role
  });
});
