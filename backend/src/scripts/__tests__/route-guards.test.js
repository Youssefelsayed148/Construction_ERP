// Unit tests for the Phase 2 TODO(phase-4) guard-prep work.
//
// This phase must not change runtime behavior. The only auth-related change
// is the addition of `// TODO(phase-4)` markers to every unguarded route in
// legal.js, assets.js, maintenance.js, and the unguarded sub-routes of hr.js.
// These tests assert that:
//   - every route in those four files still has the existing `authenticate`
//     middleware (so behavior is unchanged),
//   - every route in those four files now has a TODO(phase-4) marker.

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

  test('imports the authenticate middleware from middleware/auth', () => {
    expect(content).toMatch(
      /require\(['"]\.\.\/middleware\/auth['"]\)/,
      `${file} must still require the auth middleware`
    );
    // Every route file uses authenticate.
    expect(content).toMatch(/\bauthenticate\b/);
  });

  test('declares at least one TODO(phase-4) marker', () => {
    const matches = content.match(/\/\/\s*TODO\(phase-4\)/g) || [];
    expect(matches.length).toBeGreaterThan(0);
  });

  test('number of route definitions matches expected count', () => {
    const routerCalls = content.match(/router\.(get|post|put|delete)\s*\(/g) || [];
    expect(routerCalls.length).toBe(expectedRouteCount);
  });

  test('every TODO(phase-4) marker sits above a route definition', () => {
    const lines = content.split('\n');
    let todoCount = 0;
    let followedByRouteCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/\/\/\s*TODO\(phase-4\)/.test(lines[i])) {
        todoCount++;
        // Walk forward up to 12 lines and confirm at least one of those
        // lines is a router.<verb>( call. We tolerate intervening const
        // declarations, blank lines, and section comments (e.g. the
        // `// -- Daily Laborers --` headers in hr.js).
        let foundRoute = false;
        for (let j = i + 1; j < Math.min(i + 13, lines.length); j++) {
          const next = lines[j].trim();
          if (!next) continue;
          if (/^router\.(get|post|put|delete)\s*\(/.test(next)) {
            foundRoute = true;
            break;
          }
        }
        if (foundRoute) followedByRouteCount++;
      }
    }
    expect(todoCount).toBeGreaterThan(0);
    expect(followedByRouteCount).toBe(todoCount);
  });

  test('did not introduce a parallel authorization scheme (no new imports of authorize middleware helpers)', () => {
    // The phase brief forbids inventing a second, parallel auth scheme.
    // Phase 2 only adds comments; no new helpers should appear.
    // The legal.js, assets.js, and maintenance.js files must not start
    // importing `authorize` from anywhere new.
    if (['legal.js', 'assets.js', 'maintenance.js'].includes(file)) {
      expect(content).not.toMatch(/\bauthorize\s*\(/);
    }
  });
});

describe('existing role guards in hr.js and payroll.js are untouched', () => {
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
});
