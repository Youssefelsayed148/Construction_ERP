'use strict';

const policy = require('./policy');

async function canAccessMedia(q, user, fileName, preview = null) {
  if (!user || !/^[a-zA-Z0-9_.-]+$/.test(fileName) || fileName === '.' || fileName === '..') return false;
  if (policy.INTERNAL_ROLES.has(user.role) && !preview) return true;
  if (!policy.EXTERNAL_ROLES.has(user.role)) return false;

  const fileUrl = `/uploads/${fileName}`;
  try {
    const owner = (await q('SELECT uploaded_by FROM uploaded_files WHERE file_name = $1', [fileName])).rows[0];
    if (!preview && owner && Number(owner.uploaded_by) === Number(user.id)) return true;
  } catch (e) { /* Files uploaded before the registry existed still need a shared-record check. */ }

  let projectIds = [];
  let allowedVisibility = [];
  if (user.role === 'client') {
    projectIds = preview ? (preview.scoped_project_ids || []).map(Number)
      : await require('./clientEngine').resolveClientProjects(q, user.id);
    allowedVisibility = ['client', 'all_external'];
  } else if (user.role === 'consultant') {
    projectIds = preview ? (preview.scoped_project_ids || []).map(Number)
      : await require('./consultantEngine').resolveConsultantProjects(q, user.id);
    allowedVisibility = ['consultant', 'all_external'];
  } else if (user.role === 'subcontractor') {
    projectIds = (await require('./portalEngine').subcontractorScopeFor(q, user.id)).projectIds;
    allowedVisibility = ['subcontractor', 'all_external'];
  }
  if (!projectIds.length) return false;
  if (preview) {
    const previewProjects = (preview.scoped_project_ids || []).map(Number);
    projectIds = projectIds.filter((id) => previewProjects.includes(Number(id)));
  }
  if (!projectIds.length) return false;
  const docs = (await q('SELECT project_id, status, portal_visibility FROM project_documents WHERE file_url = $1', [fileUrl])).rows;
  if (docs.some((d) => projectIds.includes(Number(d.project_id)) && d.status === 'approved' && allowedVisibility.includes(d.portal_visibility))) return true;
  if (['client', 'consultant'].includes(user.role)) {
    const photos = (await q('SELECT project_id FROM photos WHERE file_url = $1', [fileUrl])).rows;
    if (photos.some((p) => projectIds.includes(Number(p.project_id)))) return true;
  }
  return false;
}

module.exports = { canAccessMedia };
