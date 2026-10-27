'use strict';

const policy = require('./policy');
const { canExternalViewDocument } = require('./documentVisibility');
const { portalFamily } = require('./portalFamily');
// Canonical external roles from migration 0031 must retain portal restrictions;
// their generic docs grants never make draft internal files publicly accessible.
const EXTERNAL_MEDIA_ROLES = new Set([...policy.EXTERNAL_ROLES,
  'client_executive', 'client_reviewer', 'pmc_manager', 'consultant_coordinator',
  'consultant_reviewer', 'subcontractor_manager', 'subcontractor_site_engineer', 'supplier_sales', 'testing_lab',
]);

async function canAccessMedia(q, user, fileName, preview = null, policyEvaluator = policy.evaluate) {
  if (!user || !/^[a-zA-Z0-9_.-]+$/.test(fileName) || fileName === '.' || fileName === '..') return false;
  const fileUrl = `/uploads/${fileName}`;
  const owner = (await q('SELECT uploaded_by FROM uploaded_files WHERE file_name = $1', [fileName])).rows[0];
  if (!preview && owner && Number(owner.uploaded_by) === Number(user.id)) return true;

  const external = EXTERNAL_MEDIA_ROLES.has(user.role);

  if (!external) {
    const documents = (await q('SELECT project_id FROM project_documents WHERE file_url = $1', [fileUrl])).rows;
    for (const doc of documents) {
      const access = preview
        ? await policy.evaluateForRole(user.role, { module: 'docs', action: 'view', projectId: doc.project_id, actorScopedProjects: preview.scoped_project_ids || [] }, { query: q })
        : await policyEvaluator({ user, module: 'docs', action: 'view', projectId: doc.project_id }, { query: q });
      if (access.allowed) return true;
    }
    const photos = (await q('SELECT project_id FROM photos WHERE file_url = $1', [fileUrl])).rows;
    for (const photo of photos) {
      const access = preview
        ? await policy.evaluateForRole(user.role, { module: 'site', action: 'view', projectId: photo.project_id, actorScopedProjects: preview.scoped_project_ids || [] }, { query: q })
        : await policyEvaluator({ user, module: 'site', action: 'view', projectId: photo.project_id }, { query: q });
      if (access.allowed) return true;
    }
    return false;
  }

  let projectIds = [];
  let allowedVisibility = [];
  if (portalFamily(user.role) === 'client') {
    projectIds = preview ? (preview.scoped_project_ids || []).map(Number)
      : await require('./clientEngine').resolveClientProjects(q, user.id);
    allowedVisibility = ['client', 'all_external'];
  } else if (portalFamily(user.role) === 'consultant') {
    projectIds = preview ? (preview.scoped_project_ids || []).map(Number)
      : await require('./consultantEngine').resolveConsultantProjects(q, user.id);
    allowedVisibility = ['consultant', 'all_external'];
  } else if (portalFamily(user.role) === 'subcontractor') {
    projectIds = (await require('./portalEngine').subcontractorScopeFor(q, user.id)).projectIds;
    allowedVisibility = ['subcontractor', 'all_external'];
  }
  if (!projectIds.length) return false;
  if (preview) {
    const previewProjects = (preview.scoped_project_ids || []).map(Number);
    projectIds = projectIds.filter((id) => previewProjects.includes(Number(id)));
  }
  if (!projectIds.length) return false;
  if (portalFamily(user.role) === 'consultant') {
    const links = (await q('SELECT organization_id, is_active FROM organization_users WHERE user_id = $1', [user.id])).rows
      .filter((link) => link.is_active !== false)
      .map((link) => Number(link.organization_id));
    const evidence = (await q(
      `SELECT project_id, organization_id FROM photos
        WHERE file_url = $1 AND linked_entity_type IN ('observation_before', 'observation_after')`, [fileUrl]
    )).rows;
    if (evidence.some((photo) => projectIds.includes(Number(photo.project_id)) && links.includes(Number(photo.organization_id)))) return true;
  }
  const docs = (await q('SELECT project_id, status, portal_visibility, confidentiality FROM project_documents WHERE file_url = $1', [fileUrl])).rows;
  if (docs.some((d) => projectIds.includes(Number(d.project_id)) && d.status === 'approved'
    && allowedVisibility.includes(d.portal_visibility) && canExternalViewDocument(d, user.role))) return true;
  // Photo metadata has no approval or external-visibility state, so project membership alone is not sufficient.
  return false;
}

module.exports = { canAccessMedia };
