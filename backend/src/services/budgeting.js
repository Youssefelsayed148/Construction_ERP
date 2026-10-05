// Phase 5.5 (spec 09/10) - versioned budgets, forecasts and commitment adjustments.
//
//   Budget version    draft -> submitted -> approved | rejected; approving one SUPERSEDES the previous approved
//                     version and applies its lines to project_budgets through commercialEngine.applyBudgetChange
//                     (so budget_changes keeps the audit trail and the EAC reads the new numbers). Maker/checker:
//                     whoever submitted it cannot approve it (one config line, services/commercialErrors).
//                     A cost code the new version does not list keeps its current budget and is reported back
//                     (unlisted_codes): a version states what changes, it never silently zeroes a code.
//   Forecast version  draft -> approved (superseding the previous one). Lines carry the forecast at completion per
//                     cost code and the actual to date (the shared cost view, read once when the version is created).
//   Commitment adjust a manual change of a commitment's cancelled amount (a descope), always with a reason and a
//                     history row; the cancelled amount never exceeds the commitment.
// All of it runs on the caller's query function and throws CommercialError.
'use strict';

const engine = require('./commercialEngine');
const costView = require('./costView');
const { bad, conflict, missing, forbidden, assertNotMaker } = require('./commercialErrors');

const toInt = (v) => (v == null || v === '' ? null : Number(v));
const toNum = (v) => (v == null ? 0 : Number(v));

async function nextVersionNo(q, table, projectId) {
  await q('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]); // serialises two creators on one project
  const last = (await q(`SELECT version_no FROM ${table} WHERE project_id = $1 ORDER BY version_no DESC LIMIT 1`, [projectId])).rows[0];
  return last ? toNum(last.version_no) + 1 : 1;
}

function checkLines(lines, field) {
  const seen = new Set();
  for (const l of lines) {
    const key = l.cost_code_id == null ? 'none' : String(l.cost_code_id);
    if (seen.has(key)) throw bad('duplicate_cost_code', 'A cost code can appear once per version', { cost_code_id: l.cost_code_id ?? null });
    seen.add(key);
    if (!(toNum(l[field]) >= 0)) throw bad('amount_invalid', `${field} must be zero or more`, { cost_code_id: l.cost_code_id ?? null });
  }
}

async function assertCostCodes(q, lines) {
  const ids = [...new Set(lines.map((l) => l.cost_code_id).filter((v) => v != null))];
  if (!ids.length) return;
  const found = new Set((await q('SELECT id FROM cost_codes WHERE id = ANY($1::int[])', [ids])).rows.map((r) => r.id));
  const unknown = ids.filter((id) => !found.has(id));
  if (unknown.length) throw bad('cost_code_not_found', `Unknown cost code(s): ${unknown.join(', ')}`, { cost_code_ids: unknown });
}

// ---------------------------------------------------------------------------------------------------------
// Budget versions
// ---------------------------------------------------------------------------------------------------------
async function getBudgetVersion(q, id) {
  const v = (await q('SELECT * FROM budget_versions WHERE id = $1', [toInt(id)])).rows[0];
  if (!v) throw missing('budget_version_not_found', `Budget version #${id} not found`, { id });
  v.lines = (await q(
    `SELECT l.*, cc.code AS cost_code, cc.name AS cost_code_name FROM budget_lines l LEFT JOIN cost_codes cc ON cc.id = l.cost_code_id WHERE l.budget_version_id = $1 ORDER BY l.id`, [v.id])).rows;
  v.total = engine.round2(v.lines.reduce((s, l) => s + toNum(l.amount), 0));
  return v;
}

async function listBudgetVersions(q, projectId) {
  return (await q(
    `SELECT v.*, (SELECT COALESCE(SUM(amount), 0) FROM budget_lines l WHERE l.budget_version_id = v.id) AS total
       FROM budget_versions v WHERE v.project_id = $1 ORDER BY v.version_no DESC`, [toInt(projectId)])).rows;
}

async function writeBudgetLines(q, versionId, lines) {
  await q('DELETE FROM budget_lines WHERE budget_version_id = $1', [versionId]);
  for (const l of lines) {
    await q('INSERT INTO budget_lines (budget_version_id, cost_code_id, amount, notes) VALUES ($1,$2,$3,$4)', [versionId, l.cost_code_id ?? null, l.amount, l.notes ?? null]);
  }
}

async function createBudgetVersion(q, { project_id, name, notes = null, lines, copy_from_version_id = null }, userId) {
  if (!(await q('SELECT 1 FROM projects WHERE id = $1', [project_id])).rows.length) throw missing('project_not_found', `Project #${project_id} not found`, { project_id });
  let useLines = lines;
  if ((!useLines || !useLines.length) && copy_from_version_id != null) {
    const src = (await q('SELECT * FROM budget_versions WHERE id = $1 AND project_id = $2', [copy_from_version_id, project_id])).rows[0];
    if (!src) throw bad('budget_version_not_in_project', 'The version to copy is not on this project', { copy_from_version_id });
    useLines = (await q('SELECT cost_code_id, amount, notes FROM budget_lines WHERE budget_version_id = $1', [src.id])).rows;
  }
  if (!useLines || !useLines.length) throw bad('budget_lines_required', 'A budget version needs at least one line', {});
  checkLines(useLines, 'amount');
  await assertCostCodes(q, useLines);
  const versionNo = await nextVersionNo(q, 'budget_versions', project_id);
  const v = (await q('INSERT INTO budget_versions (project_id, version_no, name, notes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id', [project_id, versionNo, name, notes, userId])).rows[0];
  await writeBudgetLines(q, v.id, useLines);
  return getBudgetVersion(q, v.id);
}

async function updateBudgetVersion(q, id, { name, notes, lines }) {
  const v = (await q('SELECT * FROM budget_versions WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!v) throw missing('budget_version_not_found', `Budget version #${id} not found`, { id });
  if (v.status !== 'draft') throw conflict('budget_version_not_draft', `Version ${v.version_no} is ${v.status}: only a draft can be edited`, { id: v.id, status: v.status });
  if (lines) { checkLines(lines, 'amount'); await assertCostCodes(q, lines); if (!lines.length) throw bad('budget_lines_required', 'A budget version needs at least one line', {}); await writeBudgetLines(q, v.id, lines); }
  await q('UPDATE budget_versions SET name = COALESCE($2, name), notes = COALESCE($3, notes), updated_at = NOW() WHERE id = $1', [v.id, name ?? null, notes ?? null]);
  return getBudgetVersion(q, v.id);
}

async function submitBudgetVersion(q, id, user) {
  const v = (await q('SELECT * FROM budget_versions WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!v) throw missing('budget_version_not_found', `Budget version #${id} not found`, { id });
  if (v.status !== 'draft') throw conflict('budget_version_not_draft', `Version ${v.version_no} is ${v.status}: only a draft can be submitted`, { id: v.id, status: v.status });
  await q("UPDATE budget_versions SET status = 'submitted', submitted_by = $2, updated_at = NOW() WHERE id = $1", [v.id, user.id]);
  return getBudgetVersion(q, v.id);
}

async function decideBudgetVersion(q, id, user, decision, comment = null) {
  if (!['approve', 'reject'].includes(decision)) throw bad('decision_invalid', 'decision must be approve or reject', { decision });
  const v = (await q('SELECT * FROM budget_versions WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!v) throw missing('budget_version_not_found', `Budget version #${id} not found`, { id });
  if (v.status !== 'submitted') throw conflict('budget_version_not_submitted', `Version ${v.version_no} is ${v.status}: only a submitted version can be decided`, { id: v.id, status: v.status });
  await assertNotMaker(q, v.submitted_by, user.id, 'budget version');
  if (decision === 'reject') {
    await q("UPDATE budget_versions SET status = 'rejected', approved_by = $2, approved_at = NOW(), notes = COALESCE(notes || E'\\n', '') || $3, updated_at = NOW() WHERE id = $1", [v.id, user.id, `Rejected: ${comment || ''}`.trim()]);
    return { ...(await getBudgetVersion(q, v.id)), applied: [], unlisted_codes: [] };
  }
  await q('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [v.project_id]);
  await q("UPDATE budget_versions SET status = 'superseded', updated_at = NOW() WHERE project_id = $1 AND status = 'approved'", [v.project_id]);
  await q("UPDATE budget_versions SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1", [v.id, user.id]);
  const lines = (await q('SELECT * FROM budget_lines WHERE budget_version_id = $1 ORDER BY id', [v.id])).rows;
  const applied = [];
  for (const l of lines) {
    applied.push({ cost_code_id: l.cost_code_id, ...(await engine.applyBudgetChange(q, {
      project_id: v.project_id, cost_code_id: l.cost_code_id, new_amount: toNum(l.amount),
      reason: `Budget version ${v.version_no} approved`, source_type: 'budget_version', source_id: v.id, created_by: user.id })) });
  }
  const listed = new Set(lines.map((l) => (l.cost_code_id == null ? 'none' : String(l.cost_code_id))));
  const unlisted = (await q('SELECT cost_code_id FROM project_budgets WHERE project_id = $1', [v.project_id])).rows
    .map((r) => r.cost_code_id).filter((c) => !listed.has(c == null ? 'none' : String(c)));
  return { ...(await getBudgetVersion(q, v.id)), applied, unlisted_codes: unlisted };
}

// ---------------------------------------------------------------------------------------------------------
// Forecast versions
// ---------------------------------------------------------------------------------------------------------
async function getForecastVersion(q, id) {
  const v = (await q('SELECT * FROM forecast_versions WHERE id = $1', [toInt(id)])).rows[0];
  if (!v) throw missing('forecast_version_not_found', `Forecast version #${id} not found`, { id });
  v.lines = (await q(
    `SELECT l.*, cc.code AS cost_code, cc.name AS cost_code_name FROM forecast_lines l LEFT JOIN cost_codes cc ON cc.id = l.cost_code_id WHERE l.forecast_version_id = $1 ORDER BY l.id`, [v.id])).rows;
  v.total_forecast = engine.round2(v.lines.reduce((s, l) => s + toNum(l.forecast_amount), 0));
  v.total_actual_to_date = engine.round2(v.lines.reduce((s, l) => s + toNum(l.actual_to_date), 0));
  return v;
}

async function listForecastVersions(q, projectId) {
  return (await q(
    `SELECT v.*, (SELECT COALESCE(SUM(forecast_amount), 0) FROM forecast_lines l WHERE l.forecast_version_id = v.id) AS total_forecast
       FROM forecast_versions v WHERE v.project_id = $1 ORDER BY v.version_no DESC`, [toInt(projectId)])).rows;
}

async function createForecastVersion(q, { project_id, name, as_of_date = null, notes = null, lines }, userId) {
  if (!(await q('SELECT 1 FROM projects WHERE id = $1', [project_id])).rows.length) throw missing('project_not_found', `Project #${project_id} not found`, { project_id });
  if (!lines || !lines.length) throw bad('forecast_lines_required', 'A forecast version needs at least one line', {});
  checkLines(lines, 'forecast_amount');
  await assertCostCodes(q, lines);
  const actual = new Map((await costView.byCode(q, project_id)).map((r) => [r.cost_code_id == null ? 'none' : String(r.cost_code_id), r.amount]));
  const versionNo = await nextVersionNo(q, 'forecast_versions', project_id);
  const v = (await q('INSERT INTO forecast_versions (project_id, version_no, name, as_of_date, notes, created_by) VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6) RETURNING id',
    [project_id, versionNo, name, as_of_date, notes, userId])).rows[0];
  for (const l of lines) {
    await q('INSERT INTO forecast_lines (forecast_version_id, cost_code_id, forecast_amount, actual_to_date, notes) VALUES ($1,$2,$3,$4,$5)',
      [v.id, l.cost_code_id ?? null, l.forecast_amount, actual.get(l.cost_code_id == null ? 'none' : String(l.cost_code_id)) || 0, l.notes ?? null]);
  }
  return getForecastVersion(q, v.id);
}

async function approveForecastVersion(q, id, user) {
  const v = (await q('SELECT * FROM forecast_versions WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!v) throw missing('forecast_version_not_found', `Forecast version #${id} not found`, { id });
  if (v.status !== 'draft') throw conflict('forecast_version_not_draft', `Forecast version ${v.version_no} is ${v.status}: only a draft can be approved`, { id: v.id, status: v.status });
  await q('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [v.project_id]);
  await q("UPDATE forecast_versions SET status = 'superseded', updated_at = NOW() WHERE project_id = $1 AND status = 'approved'", [v.project_id]);
  await q("UPDATE forecast_versions SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1", [v.id, user.id]);
  return getForecastVersion(q, v.id);
}

// ---------------------------------------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------------------------------------
async function listCommitments(q, projectId) {
  const rows = await engine.syncCommitments(q, toInt(projectId));
  return rows.map((c) => ({ ...c, net_amount: engine.round2(toNum(c.original_amount) - toNum(c.cancelled_amount)) }));
}

async function adjustCommitment(q, id, user, { cancelled_amount, reason }) {
  if (String(reason || '').trim().length < 3) throw bad('reason_required', 'A reason is required to adjust a commitment', {});
  const c = (await q('SELECT * FROM commitments WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!c) throw missing('commitment_not_found', `Commitment #${id} not found`, { id });
  if (c.status === 'cancelled') throw conflict('commitment_cancelled', `Commitment ${c.commitment_number} is cancelled`, { id: c.id });
  const next = engine.round2(cancelled_amount);
  if (next < 0 || next > toNum(c.original_amount) + 1e-9) throw bad('cancelled_amount_out_of_range', `The cancelled amount must be between 0 and ${c.original_amount}`, { id: c.id, original_amount: c.original_amount });
  const previous = toNum(c.cancelled_amount);
  if (Math.abs(next - previous) < 1e-9) throw bad('commitment_unchanged', 'The cancelled amount is unchanged', { id: c.id });
  await q('UPDATE commitments SET cancelled_amount = $2, updated_at = NOW() WHERE id = $1', [c.id, next]);
  await q('INSERT INTO commitment_adjustments (commitment_id, previous_cancelled, new_cancelled, reason, adjusted_by) VALUES ($1,$2,$3,$4,$5)', [c.id, previous, next, String(reason).trim(), user.id]);
  return getCommitment(q, c.id);
}

async function getCommitment(q, id) {
  const c = (await q('SELECT * FROM commitments WHERE id = $1', [toInt(id)])).rows[0];
  if (!c) throw missing('commitment_not_found', `Commitment #${id} not found`, { id });
  c.net_amount = engine.round2(toNum(c.original_amount) - toNum(c.cancelled_amount));
  c.adjustments = (await q('SELECT * FROM commitment_adjustments WHERE commitment_id = $1 ORDER BY id DESC', [c.id])).rows;
  return c;
}

module.exports = {
  getBudgetVersion, listBudgetVersions, createBudgetVersion, updateBudgetVersion, submitBudgetVersion, decideBudgetVersion,
  getForecastVersion, listForecastVersions, createForecastVersion, approveForecastVersion,
  listCommitments, adjustCommitment, getCommitment, forbidden,
};
