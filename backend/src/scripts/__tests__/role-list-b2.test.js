// B2 — coarse role lists must never block a canonical role that holds the exact
// module:action grant the route is judged under (middleware/auth.js ANDs the list
// with the policy decision). Parsed from route source like route-guards.test.js so
// the suite stays import-light; the real-PG behaviour cases live in
// role-list-b2.pg.test.js.
const fs = require('fs');
const path = require('path');
const policy = require('../../services/policy');

const ROUTES_DIR = path.join(__dirname, '..', '..', 'routes');
const hr = fs.readFileSync(path.join(ROUTES_DIR, 'hr.js'), 'utf8');
const schedule = fs.readFileSync(path.join(ROUTES_DIR, 'schedule.js'), 'utf8');

const declaredOn = (source, method, routePath) => {
  const line = source.match(new RegExp(`router\\.${method.toLowerCase()}\\('${routePath.replace(/[/:]/g, (c) => `\\${c}`)}',\\s*authenticate,\\s*authorize\\(([^)]*)\\)`));
  expect(line).not.toBeNull();
  return [...line[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

describe('B2 role lists vs canonical grants', () => {
  test('hr employees POST/PUT and leaves PUT admit hr_manager (holds hr create/edit per 0031)', () => {
    expect(declaredOn(hr, 'POST', '/employees')).toContain('hr_manager');
    expect(declaredOn(hr, 'PUT', '/employees/:id')).toContain('hr_manager');
    expect(declaredOn(hr, 'PUT', '/leaves/:id')).toContain('hr_manager');
  });

  test('hr DELETE /employees/:id still excludes hr_manager (no hr delete grant exists)', () => {
    expect(declaredOn(hr, 'DELETE', '/employees/:id')).not.toContain('hr_manager');
    expect(declaredOn(hr, 'DELETE', '/employees/:id')).toEqual(['owner', 'admin']);
  });

  test('schedule guarded routes are judged by the policy exactly as assumed', () => {
    expect(policy.effectiveAction({ route: { path: '/activities/:id/budgeted-cost' }, method: 'PUT' }, 'schedule')).toBe('edit');
    expect(policy.effectiveAction({ route: { path: '/activities/:id/progress' }, method: 'POST' }, 'schedule')).toBe('create');
    expect(policy.effectiveAction({ route: { path: '/activities/:id/assignments' }, method: 'POST' }, 'schedule')).toBe('create');
    expect(policy.effectiveAction({ route: { path: '/assignments/:id/status' }, method: 'PUT' }, 'schedule')).toBe('edit');
    expect(policy.effectiveAction({ route: { path: '/activities/import' }, method: 'POST' }, 'schedule')).toBe('create');
    expect(policy.effectiveModule({ route: { path: '/activities/:id/progress' }, method: 'POST' }, 'schedule')).toBe('schedule');
  });

  test('schedule routes admit planning_engineer and no longer name the dead key planning', () => {
    for (const [method, routePath] of [
      ['PUT', '/activities/:id/budgeted-cost'],
      ['POST', '/activities/:id/progress'],
      ['POST', '/activities/:id/assignments'],
      ['PUT', '/assignments/:id/status'],
      ['POST', '/activities/import'],
    ]) {
      const roles = declaredOn(schedule, method, routePath);
      expect(roles).toContain('planning_engineer');
      expect(roles).not.toContain('planning');
      expect(roles.slice(0, 3)).toEqual(['owner', 'admin', 'project_manager']); // legacy keys kept
    }
  });

  test('schedule edit-guarded PUTs admit every canonical schedule:edit holder', () => {
    for (const role of ['projects_director', 'construction_manager', 'site_manager', 'site_engineer']) {
      expect(declaredOn(schedule, 'PUT', '/activities/:id/budgeted-cost')).toContain(role);
      expect(declaredOn(schedule, 'PUT', '/assignments/:id/status')).toContain(role);
    }
  });

  test('schedule create-guarded POSTs: no other role is added beyond its held grant', () => {
    // Only planning_engineer holds schedule:create canonically (0031); the edit-only
    // holders must not silently gain create routes.
    for (const role of ['projects_director', 'construction_manager', 'site_manager', 'site_engineer']) {
      expect(declaredOn(schedule, 'POST', '/activities/:id/progress')).not.toContain(role);
    }
  });
});
