'use strict';

// F3: the nine canonical external roles of migration 0031 are project-bound mirrors of the four legacy
// portal roles. Owner decision 1: each one gets the same portal data access as its legacy alias family
// (client_executive/client_reviewer/pmc_manager -> client; consultant_coordinator/consultant_reviewer ->
// consultant; subcontractor_manager/subcontractor_site_engineer -> subcontractor; supplier_sales/testing_lab
// -> supplier). The legacy keys map to themselves. Mirrors the frontend CANONICAL_PORTAL_FAMILY in Sidebar.js.
const PORTAL_FAMILY_BY_ROLE = Object.freeze({
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

// 'client' | 'consultant' | 'subcontractor' | 'supplier', or null for any internal role.
function portalFamily(role) {
  return Object.prototype.hasOwnProperty.call(PORTAL_FAMILY_BY_ROLE, role) ? PORTAL_FAMILY_BY_ROLE[role] : null;
}

const isExternalPortalRole = (role) => portalFamily(role) !== null;

module.exports = { PORTAL_FAMILY_BY_ROLE, portalFamily, isExternalPortalRole };
