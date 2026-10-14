'use strict';

function authorizedProjectId(req, value) {
  if (!req.policy || req.policy.allowed !== true) {
    throw Object.assign(new Error('Project authorization context is required'), { status: 403, error_code: 'project_authorization_required' });
  }
  const canonical = req.policy.project_id;
  if (value && Object.prototype.hasOwnProperty.call(value, 'project_id')) {
    const supplied = value.project_id == null ? null : Number(value.project_id);
    if (supplied !== (canonical == null ? null : Number(canonical))) {
      throw Object.assign(new Error('Supplied project ids disagree'), { status: 400, error_code: 'project_id_mismatch', error_params: {} });
    }
    return canonical;
  }
  return undefined;
}

module.exports = { authorizedProjectId };

function authorizeProjectPayload(req, value) {
  if (value && Object.prototype.hasOwnProperty.call(value, 'project_id')) {
    value.project_id = authorizedProjectId(req, value);
  }
  if (value && Object.prototype.hasOwnProperty.call(value, 'current_project_id')) {
    value.current_project_id = authorizedProjectId(req, { project_id: value.current_project_id });
  }
  return value;
}

module.exports.authorizeProjectPayload = authorizeProjectPayload;
