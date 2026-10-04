// Phase 5.2 (spec 05, 06) - project setup: settings, calendars, WBS, work packages.
//
// Every function takes the query function `q` first (pool.query or a transaction client's), so a route
// can run several of them in one transaction. Errors carry status + error_code + error_params next to
// the message (the closeout error convention).
'use strict';

class SetupError extends Error {
  constructor(status, code, message, params = {}) {
    super(message);
    this.status = status;
    this.error_code = code;
    this.error_params = params;
  }
}
const bad = (code, message, params) => new SetupError(400, code, message, params);
const missing = (code, message, params) => new SetupError(404, code, message, params);
const conflict = (code, message, params) => new SetupError(409, code, message, params);

const toInt = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

async function requireProject(q, projectId) {
  const id = toInt(projectId);
  if (id == null) throw bad('project_id_invalid', 'project id must be an integer', { project_id: projectId });
  const r = await q('SELECT id FROM projects WHERE id = $1', [id]);
  if (!r.rows[0]) throw missing('project_not_found', `Project #${id} not found`, { project_id: id });
  return id;
}

// --- settings ---------------------------------------------------------------------------------

const SETTING_KEY = /^[a-z][a-z0-9_.]{0,99}$/;
const MAX_SETTING_BYTES = 8192;

async function getSettings(q, projectId) {
  const id = await requireProject(q, projectId);
  const r = await q('SELECT setting_key, setting_value FROM project_settings WHERE project_id = $1 ORDER BY setting_key', [id]);
  const out = {};
  for (const row of r.rows) out[row.setting_key] = row.setting_value;
  return out;
}

async function putSettings(q, projectId, settings, userId) {
  const id = await requireProject(q, projectId);
  const entries = Object.entries(settings || {});
  for (const [key, value] of entries) {
    if (!SETTING_KEY.test(key)) throw bad('setting_key_invalid', `Setting key "${key}" must be lower-case letters, digits, "_" or "."`, { key });
    if (Buffer.byteLength(JSON.stringify(value === undefined ? null : value)) > MAX_SETTING_BYTES) {
      throw bad('setting_value_too_large', `Setting "${key}" is larger than ${MAX_SETTING_BYTES} bytes`, { key, max_bytes: MAX_SETTING_BYTES });
    }
  }
  for (const [key, value] of entries) {
    await q(
      `INSERT INTO project_settings (project_id, setting_key, setting_value, updated_by)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (project_id, setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [id, key, JSON.stringify(value === undefined ? null : value), userId || null]
    );
  }
  return getSettings(q, id);
}

// --- calendars --------------------------------------------------------------------------------

async function listCalendars(q, projectId) {
  const id = await requireProject(q, projectId);
  return (await q('SELECT * FROM project_calendars WHERE project_id = $1 ORDER BY is_default DESC, id', [id])).rows;
}

function normaliseDays(days) {
  if (days == null) return null;
  const list = Array.isArray(days) ? days.map(Number) : [];
  if (list.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    throw bad('calendar_off_days_invalid', 'weekly_off_days must be integers 0 (Sunday) to 6 (Saturday)', { weekly_off_days: days });
  }
  return [...new Set(list)].sort();
}

async function createCalendar(q, projectId, body, userId) {
  const id = await requireProject(q, projectId);
  const days = normaliseDays(body.weekly_off_days);
  const first = (await q('SELECT count(*)::int AS n FROM project_calendars WHERE project_id = $1', [id])).rows[0].n === 0;
  const makeDefault = body.is_default === true || first;
  if (makeDefault) await q('UPDATE project_calendars SET is_default = false, updated_at = NOW() WHERE project_id = $1 AND is_default', [id]);
  const r = await q(
    `INSERT INTO project_calendars (project_id, name, name_ar, name_en, timezone, weekly_off_days, holidays, is_default, created_by)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'Africa/Cairo'), COALESCE($6::smallint[], '{5,6}'::smallint[]), $7::jsonb, $8, $9) RETURNING *`,
    [id, body.name, body.name_ar || null, body.name_en || null, body.timezone || null, days,
      JSON.stringify(body.holidays || []), makeDefault, userId || null]
  );
  return r.rows[0];
}

async function updateCalendar(q, projectId, calendarId, body) {
  const id = await requireProject(q, projectId);
  const cal = (await q('SELECT * FROM project_calendars WHERE id = $1 AND project_id = $2 FOR UPDATE', [toInt(calendarId), id])).rows[0];
  if (!cal) throw missing('calendar_not_found', `Calendar #${calendarId} not found on project #${id}`, { calendar_id: calendarId, project_id: id });
  if (body.is_default === false && cal.is_default) {
    throw conflict('calendar_default_required', 'A project keeps one default calendar: make another calendar the default instead', { calendar_id: cal.id });
  }
  if (body.is_default === true && !cal.is_default) {
    await q('UPDATE project_calendars SET is_default = false, updated_at = NOW() WHERE project_id = $1 AND is_default', [id]);
  }
  const days = body.weekly_off_days !== undefined ? normaliseDays(body.weekly_off_days) : undefined;
  const r = await q(
    `UPDATE project_calendars SET
       name = COALESCE($3, name), name_ar = COALESCE($4, name_ar), name_en = COALESCE($5, name_en),
       timezone = COALESCE($6, timezone),
       weekly_off_days = CASE WHEN $7::boolean THEN $8::smallint[] ELSE weekly_off_days END,
       holidays = COALESCE($9::jsonb, holidays),
       is_default = CASE WHEN $10::boolean THEN true ELSE is_default END,
       updated_at = NOW()
     WHERE id = $1 AND project_id = $2 RETURNING *`,
    [cal.id, id, body.name || null, body.name_ar || null, body.name_en || null, body.timezone || null,
      days !== undefined, days === undefined ? null : days,
      body.holidays === undefined ? null : JSON.stringify(body.holidays), body.is_default === true]
  );
  return r.rows[0];
}

async function deleteCalendar(q, projectId, calendarId) {
  const id = await requireProject(q, projectId);
  const cal = (await q('SELECT * FROM project_calendars WHERE id = $1 AND project_id = $2 FOR UPDATE', [toInt(calendarId), id])).rows[0];
  if (!cal) throw missing('calendar_not_found', `Calendar #${calendarId} not found on project #${id}`, { calendar_id: calendarId, project_id: id });
  if (cal.is_default) {
    const others = (await q('SELECT count(*)::int AS n FROM project_calendars WHERE project_id = $1 AND id <> $2', [id, cal.id])).rows[0].n;
    if (others > 0) throw conflict('calendar_default_required', 'Make another calendar the default before deleting this one', { calendar_id: cal.id });
  }
  await q('DELETE FROM project_calendars WHERE id = $1', [cal.id]);
  return cal;
}

// --- WBS --------------------------------------------------------------------------------------

async function listWbs(q, projectId) {
  const id = await requireProject(q, projectId);
  const r = await q(
    `SELECT n.*,
            (SELECT count(*)::int FROM work_packages wp WHERE wp.wbs_node_id = n.id) AS work_package_count
       FROM wbs_nodes n WHERE n.project_id = $1 ORDER BY n.wbs_level, n.sort_order, n.id`, [id]);
  return r.rows;
}

async function getNode(q, projectId, nodeId) {
  const node = (await q('SELECT * FROM wbs_nodes WHERE id = $1 AND project_id = $2', [toInt(nodeId), projectId])).rows[0];
  if (!node) throw missing('wbs_node_not_found', `WBS node #${nodeId} not found on project #${projectId}`, { node_id: nodeId, project_id: projectId });
  return node;
}

async function createWbsNode(q, projectId, body) {
  const id = await requireProject(q, projectId);
  let parent = null;
  if (body.parent_id != null) parent = await getNode(q, id, body.parent_id);
  const dup = (await q(
    'SELECT id FROM wbs_nodes WHERE project_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND code = $3', [id, parent ? parent.id : null, body.code])).rows[0];
  if (dup) throw conflict('wbs_code_exists', `WBS code "${body.code}" already exists under this parent`, { code: body.code, node_id: dup.id });
  const r = await q(
    `INSERT INTO wbs_nodes (project_id, parent_id, code, name, name_en, name_ar, wbs_level, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0)) RETURNING *`,
    [id, parent ? parent.id : null, body.code, body.name, body.name_en || null, body.name_ar || null,
      parent ? (parent.wbs_level || 1) + 1 : 1, body.sort_order ?? null]
  );
  return r.rows[0];
}

async function updateWbsNode(q, projectId, nodeId, body) {
  const id = await requireProject(q, projectId);
  const node = await getNode(q, id, nodeId);
  if (body.code && body.code !== node.code) {
    const dup = (await q(
      'SELECT id FROM wbs_nodes WHERE project_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND code = $3 AND id <> $4',
      [id, node.parent_id, body.code, node.id])).rows[0];
    if (dup) throw conflict('wbs_code_exists', `WBS code "${body.code}" already exists under this parent`, { code: body.code, node_id: dup.id });
  }
  const r = await q(
    `UPDATE wbs_nodes SET code = COALESCE($3, code), name = COALESCE($4, name), name_en = COALESCE($5, name_en),
            name_ar = COALESCE($6, name_ar), sort_order = COALESCE($7, sort_order)
      WHERE id = $1 AND project_id = $2 RETURNING *`,
    [node.id, id, body.code || null, body.name || null, body.name_en || null, body.name_ar || null, body.sort_order ?? null]
  );
  return r.rows[0];
}

async function deleteWbsNode(q, projectId, nodeId) {
  const id = await requireProject(q, projectId);
  const node = await getNode(q, id, nodeId);
  const children = (await q('SELECT count(*)::int AS n FROM wbs_nodes WHERE parent_id = $1', [node.id])).rows[0].n;
  const packages = (await q('SELECT count(*)::int AS n FROM work_packages WHERE wbs_node_id = $1', [node.id])).rows[0].n;
  if (children > 0 || packages > 0) {
    throw conflict('wbs_node_in_use', `WBS node "${node.code}" still has ${children} child node(s) and ${packages} work package(s)`,
      { node_id: node.id, children, work_packages: packages });
  }
  await q('DELETE FROM wbs_nodes WHERE id = $1', [node.id]);
  return node;
}

// --- work packages ----------------------------------------------------------------------------

// Counts of what points at a package, by table. The in-use refusal and the list both read this.
const LINK_TABLES = [
  ['itps', 'itps'], ['wirs', 'wirs'], ['schedule_activities', 'schedule_activities'],
  ['boq_items', 'boq_items'], ['project_team', 'project_team'], ['quantity_measurements', 'quantity_measurements'],
];

async function linkCounts(q, workPackageId) {
  const out = {};
  for (const [key, table] of LINK_TABLES) {
    out[key] = (await q(`SELECT count(*)::int AS n FROM ${table} WHERE work_package_id = $1`, [workPackageId])).rows[0].n;
  }
  return out;
}

async function listWorkPackages(q, projectId) {
  const id = await requireProject(q, projectId);
  const r = await q(
    `SELECT wp.*, n.code AS wbs_code, l.name AS location_name,
            (SELECT count(*)::int FROM itps t WHERE t.work_package_id = wp.id) AS itp_count,
            (SELECT count(*)::int FROM wirs t WHERE t.work_package_id = wp.id) AS wir_count,
            (SELECT count(*)::int FROM schedule_activities t WHERE t.work_package_id = wp.id) AS activity_count,
            (SELECT count(*)::int FROM boq_items t WHERE t.work_package_id = wp.id) AS boq_item_count
       FROM work_packages wp
       LEFT JOIN wbs_nodes n ON n.id = wp.wbs_node_id
       LEFT JOIN project_locations l ON l.id = wp.project_location_id
      WHERE wp.project_id = $1 ORDER BY wp.code`, [id]);
  return r.rows;
}

async function assertScopedRefs(q, projectId, { wbs_node_id, project_location_id }) {
  if (wbs_node_id != null) await getNode(q, projectId, wbs_node_id);
  if (project_location_id != null) {
    const loc = (await q('SELECT id FROM project_locations WHERE id = $1 AND project_id = $2', [toInt(project_location_id), projectId])).rows[0];
    if (!loc) throw missing('location_not_found', `Location #${project_location_id} not found on project #${projectId}`, { location_id: project_location_id, project_id: projectId });
  }
}

async function createWorkPackage(q, projectId, body) {
  const id = await requireProject(q, projectId);
  await assertScopedRefs(q, id, body);
  const dup = (await q('SELECT id FROM work_packages WHERE project_id = $1 AND code = $2', [id, body.code])).rows[0];
  if (dup) throw conflict('work_package_code_exists', `Work package code "${body.code}" already exists on this project`, { code: body.code, work_package_id: dup.id });
  const r = await q(
    `INSERT INTO work_packages (project_id, wbs_node_id, project_location_id, code, name, description, status,
                                planned_start_date, planned_end_date, assigned_employee_id)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'planned'), $8, $9, $10) RETURNING *`,
    [id, body.wbs_node_id ?? null, body.project_location_id ?? null, body.code, body.name, body.description || null,
      body.status || null, body.planned_start_date || null, body.planned_end_date || null, body.assigned_employee_id ?? null]
  );
  return r.rows[0];
}

async function getWorkPackage(q, projectId, workPackageId) {
  const wp = (await q('SELECT * FROM work_packages WHERE id = $1 AND project_id = $2', [toInt(workPackageId), projectId])).rows[0];
  if (!wp) throw missing('work_package_not_found', `Work package #${workPackageId} not found on project #${projectId}`, { work_package_id: workPackageId, project_id: projectId });
  return wp;
}

async function updateWorkPackage(q, projectId, workPackageId, body) {
  const id = await requireProject(q, projectId);
  const wp = await getWorkPackage(q, id, workPackageId);
  await assertScopedRefs(q, id, body);
  if (body.code && body.code !== wp.code) {
    const dup = (await q('SELECT id FROM work_packages WHERE project_id = $1 AND code = $2 AND id <> $3', [id, body.code, wp.id])).rows[0];
    if (dup) throw conflict('work_package_code_exists', `Work package code "${body.code}" already exists on this project`, { code: body.code, work_package_id: dup.id });
  }
  const r = await q(
    `UPDATE work_packages SET code = COALESCE($3, code), name = COALESCE($4, name), description = COALESCE($5, description),
            status = COALESCE($6, status), wbs_node_id = COALESCE($7, wbs_node_id),
            project_location_id = COALESCE($8, project_location_id),
            planned_start_date = COALESCE($9, planned_start_date), planned_end_date = COALESCE($10, planned_end_date),
            actual_start_date = COALESCE($11, actual_start_date), actual_end_date = COALESCE($12, actual_end_date),
            assigned_employee_id = COALESCE($13, assigned_employee_id), updated_at = NOW()
      WHERE id = $1 AND project_id = $2 RETURNING *`,
    [wp.id, id, body.code || null, body.name || null, body.description || null, body.status || null,
      body.wbs_node_id ?? null, body.project_location_id ?? null, body.planned_start_date || null, body.planned_end_date || null,
      body.actual_start_date || null, body.actual_end_date || null, body.assigned_employee_id ?? null]
  );
  return r.rows[0];
}

async function deleteWorkPackage(q, projectId, workPackageId) {
  const id = await requireProject(q, projectId);
  const wp = await getWorkPackage(q, id, workPackageId);
  const links = await linkCounts(q, wp.id);
  const used = Object.entries(links).filter(([, n]) => n > 0);
  if (used.length) {
    throw conflict('work_package_in_use', `Work package "${wp.code}" is referenced by ${used.map(([k, n]) => `${n} ${k}`).join(', ')}`, { work_package_id: wp.id, links });
  }
  await q('DELETE FROM work_packages WHERE id = $1', [wp.id]);
  return wp;
}

// The one place a register (ITP, WIR, schedule activity, BOQ item) turns a work-package reference into
// its FK. Callers pass what the request carried:
//   - work_package_id: must belong to the project; the free text becomes the package code unless given;
//   - only free text: resolved by exact code, else by a name unique in the project; text that matches
//     nothing is refused (the register must point at a real package) with work_package_unmatched.
// Returns { id, text } with both null when neither was supplied.
async function resolveWorkPackage(q, projectId, { work_package_id, work_package } = {}) {
  const text = work_package == null ? '' : String(work_package).trim();
  if (work_package_id != null && work_package_id !== '') {
    const wp = await getWorkPackage(q, projectId, work_package_id);
    return { id: wp.id, text: text || wp.code };
  }
  if (!text) return { id: null, text: null };
  const byCode = (await q('SELECT id, code FROM work_packages WHERE project_id = $1 AND code = $2', [projectId, text])).rows[0];
  if (byCode) return { id: byCode.id, text: byCode.code };
  const byName = (await q('SELECT id, code FROM work_packages WHERE project_id = $1 AND name = $2', [projectId, text])).rows;
  if (byName.length === 1) return { id: byName[0].id, text: byName[0].code };
  throw bad('work_package_unmatched',
    byName.length > 1 ? `"${text}" names more than one work package on this project; use work_package_id` : `"${text}" matches no work package on this project; create it first or pass work_package_id`,
    { work_package: text, project_id: projectId, candidates: byName.length });
}

// Routes that call resolveWorkPackage turn its typed refusals into the standard envelope.
function respondIfSetupError(res, e) {
  if (!(e instanceof SetupError)) return false;
  res.status(e.status).json({ success: false, error: e.message, error_code: e.error_code, error_params: e.error_params });
  return true;
}

// Route form: sends the typed refusal itself and returns null; any other error still throws.
async function resolveOrRespond(q, res, projectId, input) {
  try {
    return await resolveWorkPackage(q, projectId, input);
  } catch (e) {
    if (respondIfSetupError(res, e)) return null;
    throw e;
  }
}

module.exports = {
  SetupError, respondIfSetupError, resolveOrRespond, getSettings, putSettings,
  listCalendars, createCalendar, updateCalendar, deleteCalendar,
  listWbs, createWbsNode, updateWbsNode, deleteWbsNode,
  listWorkPackages, createWorkPackage, updateWorkPackage, deleteWorkPackage, linkCounts,
  resolveWorkPackage,
};
