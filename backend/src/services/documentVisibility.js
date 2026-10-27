'use strict';
const { portalFamily } = require('./portalFamily');

const ROLE_VISIBILITY = {
  client: ['client', 'all_external'],
  consultant: ['consultant', 'all_external'],
  subcontractor: ['subcontractor', 'all_external'],
};

function canExternalViewDocument(document, role) {
  const allowed = ROLE_VISIBILITY[portalFamily(role)];
  if (!allowed || !allowed.includes(document.portal_visibility)) return false;
  // Compatibility for pre-migration fixtures: explicit portal grants remain public.
  const confidentiality = document.confidentiality || (document.portal_visibility === 'internal' ? 'internal' : 'public');
  return confidentiality === 'public';
}

module.exports = { canExternalViewDocument };
