import { portalFamilyOf, portalLandingPath } from './portalFamily';

describe('F3 portal family mapping', () => {
  test.each([
    ['client', '/client-portal'], ['client_executive', '/client-portal'], ['client_reviewer', '/client-portal'], ['pmc_manager', '/client-portal'],
    ['consultant', '/consultant-portal'], ['consultant_coordinator', '/consultant-portal'], ['consultant_reviewer', '/consultant-portal'],
    ['subcontractor', '/subcontractor-portal'], ['subcontractor_manager', '/subcontractor-portal'], ['subcontractor_site_engineer', '/subcontractor-portal'],
    ['supplier', '/supplier-portal'], ['supplier_sales', '/supplier-portal'], ['testing_lab', '/supplier-portal'],
  ])('%s lands on %s', (role, path) => {
    expect(portalLandingPath(role)).toBe(path);
  });

  test.each(['owner', 'project_manager', 'site_engineer', 'hr_manager', undefined, null, '__proto__', 'constructor'])('internal or unknown role %s has no portal', (role) => {
    expect(portalFamilyOf(role)).toBeNull();
    expect(portalLandingPath(role)).toBeNull();
  });
});
