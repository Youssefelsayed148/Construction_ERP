// The canonical external roles of migration 0031 are project-bound mirrors of the four legacy portal roles
// (owner decision, closeout F3): each lands on, and is shown, the portal of its alias family. Keep in step with
// backend/src/services/portalFamily.js.
export const PORTAL_FAMILY_BY_ROLE = Object.freeze({
  client: 'client',
  consultant: 'consultant',
  subcontractor: 'subcontractor',
  supplier: 'supplier',
  client_executive: 'client',
  client_reviewer: 'client',
  pmc_manager: 'client',
  consultant_coordinator: 'consultant',
  consultant_reviewer: 'consultant',
  subcontractor_manager: 'subcontractor',
  subcontractor_site_engineer: 'subcontractor',
  supplier_sales: 'supplier',
  testing_lab: 'supplier',
});

export const PORTAL_LANDING = Object.freeze({
  consultant: '/consultant-portal',
  client: '/client-portal',
  subcontractor: '/subcontractor-portal',
  supplier: '/supplier-portal',
});

// 'client' | 'consultant' | 'subcontractor' | 'supplier', or null for an internal role.
export const portalFamilyOf = (role) => (Object.prototype.hasOwnProperty.call(PORTAL_FAMILY_BY_ROLE, role) ? PORTAL_FAMILY_BY_ROLE[role] : null);

// The path an external role lands on after login, or null for an internal role.
export const portalLandingPath = (role) => {
  const family = portalFamilyOf(role);
  return family ? PORTAL_LANDING[family] : null;
};
