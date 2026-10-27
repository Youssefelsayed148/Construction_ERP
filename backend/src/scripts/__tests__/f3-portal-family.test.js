'use strict';

// F3.1: canonical external roles share the portal data access of their legacy alias family; the path cage stays
// on the four legacy roles only (canonical roles keep the project-scoped internal reads migration 0031 grants).
jest.mock('dotenv', () => ({ config: jest.fn() }));
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f3-fixture-only-secret-longer-than-32';
jest.mock('../../config/database', () => ({ query: jest.fn(), pool: { query: jest.fn(), on: jest.fn() } }));

const fs = require('fs');
const path = require('path');
const { portalFamily, isExternalPortalRole } = require('../../services/portalFamily');
const { externalPortalAllowed } = require('../../middleware/auth');
const { canExternalViewDocument } = require('../../services/documentVisibility');
const clientEngine = require('../../services/clientEngine');

const FAMILIES = {
  client: ['client', 'client_executive', 'client_reviewer', 'pmc_manager'],
  consultant: ['consultant', 'consultant_coordinator', 'consultant_reviewer'],
  subcontractor: ['subcontractor', 'subcontractor_manager', 'subcontractor_site_engineer'],
  supplier: ['supplier', 'supplier_sales', 'testing_lab'],
};

describe.each(Object.entries(FAMILIES))('%s family', (family, roles) => {
  test.each(roles)('%s maps to its family', (role) => {
    expect(portalFamily(role)).toBe(family);
    expect(isExternalPortalRole(role)).toBe(true);
  });
});

test('internal roles and prototype keys are not external', () => {
  for (const role of ['owner', 'admin', 'project_manager', 'site_engineer', 'hr_manager', 'viewer', undefined, '__proto__', 'toString']) {
    expect(portalFamily(role)).toBeNull();
  }
});

describe('portal cage decision', () => {
  const req = (role, url, method = 'GET') => ({ user: { role }, originalUrl: url, method });
  test('legacy roles stay caged to their portal', () => {
    expect(externalPortalAllowed(req('client', '/api/client-portal/projects'))).toBe(true);
    expect(externalPortalAllowed(req('client', '/api/projects/1'))).toBe(false);
  });
  test('canonical external roles are not path-caged: policy grants decide, so their internal reads survive', () => {
    expect(externalPortalAllowed(req('client_executive', '/api/projects/1'))).toBe(true);
    expect(externalPortalAllowed(req('client_executive', '/api/client-portal/projects'))).toBe(true);
    expect(externalPortalAllowed(req('pmc_manager', '/api/boq/items/1'))).toBe(true);
  });
});

test('document visibility follows the family, never the raw canonical key', () => {
  const doc = (portal_visibility, confidentiality = 'public') => ({ portal_visibility, confidentiality });
  expect(canExternalViewDocument(doc('client'), 'client_executive')).toBe(true);
  expect(canExternalViewDocument(doc('consultant'), 'consultant_reviewer')).toBe(true);
  expect(canExternalViewDocument(doc('subcontractor'), 'subcontractor_manager')).toBe(true);
  expect(canExternalViewDocument(doc('client'), 'consultant_coordinator')).toBe(false);
  expect(canExternalViewDocument(doc('internal'), 'client_executive')).toBe(false);
  expect(canExternalViewDocument(doc('client', 'internal'), 'client_executive')).toBe(false);
});

test('client decision gate admits the canonical client family and refuses others', async () => {
  const q = jest.fn().mockResolvedValue({ rows: [] });
  await expect(clientEngine.decideClientVariation(q, 1, { id: 1, role: 'client_executive' }, 'approve')).rejects.toMatchObject({ status: 404 });
  await expect(clientEngine.decideClientVariation(q, 1, { id: 1, role: 'consultant_coordinator' }, 'approve')).rejects.toMatchObject({ status: 403 });
});

test('migration 0072 grants exactly the planned portal pairs, additively', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../migrations/0072_canonical_external_portal_grants.sql'), 'utf8');
  for (const pair of [
    "('client_executive',            'client-portal', 'view')", "('client_reviewer',             'client-portal', 'view')", "('pmc_manager',                 'client-portal', 'view')",
    "('client_executive',            'client-portal', 'approve')", "('client_executive',            'client-portal', 'reject')",
    "('consultant_reviewer',         'qhse',          'view')", "('subcontractor_manager',       '*',             'see_subcontract_value')",
    "('subcontractor_site_engineer', 'subcontractors','view')",
  ]) expect(sql).toContain(pair);
  expect(sql).toMatch(/ON CONFLICT \(role_id, permission_id\) DO NOTHING/);
  expect(sql).not.toMatch(/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i);
});
