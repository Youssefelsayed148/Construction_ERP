// Phase 5.5 (spec 09) - the commercial records around a contract:
//   contract parties, guarantees, insurances, currency rates, and the payment application (the claim that
//   precedes a certificate; certifying one creates the draft certificate the payment_certificate workflow runs).
// Every function runs on the caller's query function (the transaction client), throws CommercialError, and
// never catches: a failure fails the caller's transaction.
'use strict';

const numbering = require('./numbering');
const workflowEngine = require('./workflowEngine');
const engine = require('./commercialEngine');
const glPosting = require('./glPosting');
const { bad, conflict, missing } = require('./commercialErrors');

const toInt = (v) => (v == null || v === '' ? null : Number(v));
const toNum = (v) => (v == null ? 0 : Number(v));

// --- contract parties --------------------------------------------------------------------------------
async function listParties(q, { client_contract_id = null, sub_contract_id = null } = {}) {
  const conds = []; const params = [];
  if (client_contract_id != null) conds.push(`p.client_contract_id = $${params.push(toInt(client_contract_id))}`);
  if (sub_contract_id != null) conds.push(`p.sub_contract_id = $${params.push(toInt(sub_contract_id))}`);
  return (await q(
    `SELECT p.*, o.name_en AS organization_name_en, o.name_ar AS organization_name_ar
       FROM contract_parties p LEFT JOIN organizations o ON o.id = p.organization_id
      ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY p.id LIMIT 500`, params)).rows;
}

async function addParty(q, data, userId) {
  const existsSql = data.client_contract_id != null ? ['client_contracts', data.client_contract_id] : ['sub_contracts', data.sub_contract_id];
  if (!(await q(`SELECT 1 FROM ${existsSql[0]} WHERE id = $1`, [existsSql[1]])).rows.length) {
    throw missing('contract_not_found', `Contract #${existsSql[1]} not found`, { contract_id: existsSql[1] });
  }
  if (data.organization_id != null && !(await q('SELECT 1 FROM organizations WHERE id = $1', [data.organization_id])).rows.length) {
    throw missing('organization_not_found', `Organization #${data.organization_id} not found`, { organization_id: data.organization_id });
  }
  try {
    return (await q(
      `INSERT INTO contract_parties (client_contract_id, sub_contract_id, organization_id, party_role, name_ar, name_en, contact_name, contact_email, share_pct, is_signatory, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data.client_contract_id ?? null, data.sub_contract_id ?? null, data.organization_id ?? null, data.party_role, data.name_ar ?? null, data.name_en ?? null,
        data.contact_name ?? null, data.contact_email ?? null, data.share_pct ?? null, data.is_signatory === true, data.notes ?? null, userId])).rows[0];
  } catch (e) {
    if (e.code === '23505') throw conflict('contract_party_duplicate', 'This organization already holds that role on the contract', { organization_id: data.organization_id, party_role: data.party_role });
    throw e;
  }
}

async function updateParty(q, id, data) {
  const cols = ['party_role', 'name_ar', 'name_en', 'contact_name', 'contact_email', 'share_pct', 'is_signatory', 'notes'].filter((c) => data[c] !== undefined);
  if (!cols.length) throw bad('nothing_to_update', 'No editable field supplied');
  const row = (await q(`UPDATE contract_parties SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [toInt(id), ...cols.map((c) => data[c])])).rows[0];
  if (!row) throw missing('contract_party_not_found', `Contract party #${id} not found`, { id });
  return row;
}

// --- guarantees and insurances ----------------------------------------------------------------------
async function resolveScope(q, data) {
  let projectId = data.project_id ?? null;
  const contract = data.client_contract_id != null
    ? (await q('SELECT id, project_id FROM client_contracts WHERE id = $1', [data.client_contract_id])).rows[0]
    : data.sub_contract_id != null ? (await q('SELECT id, project_id FROM sub_contracts WHERE id = $1', [data.sub_contract_id])).rows[0] : null;
  if ((data.client_contract_id != null || data.sub_contract_id != null) && !contract) {
    throw missing('contract_not_found', 'Contract not found', { client_contract_id: data.client_contract_id ?? null, sub_contract_id: data.sub_contract_id ?? null });
  }
  if (contract) {
    if (projectId != null && Number(projectId) !== Number(contract.project_id)) throw bad('contract_project_mismatch', 'The contract belongs to a different project', { project_id: projectId });
    projectId = contract.project_id; // the project follows the contract, so project scoping can never be sidestepped
  }
  if (projectId == null) throw bad('scope_required', 'A project or a contract is required');
  return projectId;
}

const GUARANTEE_COLS = ['guarantee_type', 'client_contract_id', 'sub_contract_id', 'issuer_organization_id', 'reference', 'amount', 'currency', 'issued_on', 'expires_on', 'notes'];
async function createGuarantee(q, data, userId) {
  const projectId = await resolveScope(q, data);
  const number = await numbering.nextNumber(q, { table: 'guarantees', column: 'guarantee_number', prefix: 'GTE', pad: 5 });
  return (await q(
    `INSERT INTO guarantees (guarantee_number, guarantee_type, project_id, client_contract_id, sub_contract_id, issuer_organization_id, reference, amount, currency, issued_on, expires_on, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'EGP'),$10,$11,$12,$13) RETURNING *`,
    [number, data.guarantee_type, projectId, data.client_contract_id ?? null, data.sub_contract_id ?? null, data.issuer_organization_id ?? null, data.reference ?? null,
      data.amount, data.currency ?? null, data.issued_on ?? null, data.expires_on, data.notes ?? null, userId])).rows[0];
}

async function listGuarantees(q, { project_id = null, status = null, expiring_within_days = null } = {}) {
  const conds = []; const params = [];
  if (project_id != null) conds.push(`project_id = $${params.push(toInt(project_id))}`);
  if (status) conds.push(`status = $${params.push(status)}`);
  if (expiring_within_days != null) { conds.push("status = 'active'"); conds.push(`expires_on <= CURRENT_DATE + $${params.push(toInt(expiring_within_days))}::int`); }
  return (await q(
    `SELECT g.*, (g.expires_on - CURRENT_DATE) AS days_to_expiry FROM guarantees g ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY g.expires_on, g.id LIMIT 500`, params)).rows;
}

async function getGuarantee(q, id) {
  const row = (await q('SELECT g.*, (g.expires_on - CURRENT_DATE) AS days_to_expiry FROM guarantees g WHERE g.id = $1', [toInt(id)])).rows[0];
  if (!row) throw missing('guarantee_not_found', `Guarantee #${id} not found`, { id });
  return row;
}

async function updateGuarantee(q, id, data) {
  const current = await getGuarantee(q, id);
  if (current.status !== 'active') throw conflict('guarantee_not_active', `Guarantee ${current.guarantee_number} is ${current.status}`, { id: current.id, status: current.status });
  const cols = GUARANTEE_COLS.filter((c) => data[c] !== undefined && !['client_contract_id', 'sub_contract_id', 'guarantee_type'].includes(c));
  if (!cols.length) throw bad('nothing_to_update', 'No editable field supplied');
  return (await q(`UPDATE guarantees SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`, [current.id, ...cols.map((c) => data[c])])).rows[0];
}

// release (returned to the issuer, no longer needed) or called (the beneficiary drew on it): both end the guarantee.
async function closeGuarantee(q, id, status, { reason, released_on = null }) {
  if (!['released', 'called'].includes(status)) throw bad('guarantee_status_invalid', 'status must be released or called', { status });
  if (String(reason || '').trim().length < 3) throw bad('reason_required', 'A reason is required', {});
  const current = (await q('SELECT * FROM guarantees WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!current) throw missing('guarantee_not_found', `Guarantee #${id} not found`, { id });
  if (current.status !== 'active') throw conflict('guarantee_not_active', `Guarantee ${current.guarantee_number} is already ${current.status}`, { id: current.id, status: current.status });
  return (await q("UPDATE guarantees SET status = $2, released_on = COALESCE($3::date, CURRENT_DATE), release_reason = $4, updated_at = NOW() WHERE id = $1 RETURNING *",
    [current.id, status, released_on, String(reason).trim()])).rows[0];
}

async function createInsurance(q, data, userId) {
  const projectId = await resolveScope(q, data);
  const number = await numbering.nextNumber(q, { table: 'insurances', column: 'insurance_number', prefix: 'INS', pad: 5 });
  return (await q(
    `INSERT INTO insurances (insurance_number, insurance_type, project_id, client_contract_id, sub_contract_id, insurer_organization_id, policy_number, coverage_amount, premium_amount, currency, start_date, expiry_date, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,'EGP'),$11,$12,$13,$14) RETURNING *`,
    [number, data.insurance_type, projectId, data.client_contract_id ?? null, data.sub_contract_id ?? null, data.insurer_organization_id ?? null, data.policy_number,
      data.coverage_amount, data.premium_amount ?? null, data.currency ?? null, data.start_date ?? null, data.expiry_date, data.notes ?? null, userId])).rows[0];
}

async function listInsurances(q, { project_id = null, status = null, expiring_within_days = null } = {}) {
  const conds = []; const params = [];
  if (project_id != null) conds.push(`project_id = $${params.push(toInt(project_id))}`);
  if (status) conds.push(`status = $${params.push(status)}`);
  if (expiring_within_days != null) { conds.push("status = 'active'"); conds.push(`expiry_date <= CURRENT_DATE + $${params.push(toInt(expiring_within_days))}::int`); }
  return (await q(
    `SELECT i.*, (i.expiry_date - CURRENT_DATE) AS days_to_expiry FROM insurances i ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY i.expiry_date, i.id LIMIT 500`, params)).rows;
}

async function getInsurance(q, id) {
  const row = (await q('SELECT i.*, (i.expiry_date - CURRENT_DATE) AS days_to_expiry FROM insurances i WHERE i.id = $1', [toInt(id)])).rows[0];
  if (!row) throw missing('insurance_not_found', `Insurance #${id} not found`, { id });
  return row;
}

async function updateInsurance(q, id, data) {
  const current = await getInsurance(q, id);
  if (current.status !== 'active') throw conflict('insurance_not_active', `Insurance ${current.insurance_number} is ${current.status}`, { id: current.id, status: current.status });
  const cols = ['insurer_organization_id', 'policy_number', 'coverage_amount', 'premium_amount', 'currency', 'start_date', 'expiry_date', 'notes'].filter((c) => data[c] !== undefined);
  if (!cols.length) throw bad('nothing_to_update', 'No editable field supplied');
  return (await q(`UPDATE insurances SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`, [current.id, ...cols.map((c) => data[c])])).rows[0];
}

async function cancelInsurance(q, id, reason) {
  if (String(reason || '').trim().length < 3) throw bad('reason_required', 'A reason is required', {});
  const current = (await q('SELECT * FROM insurances WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!current) throw missing('insurance_not_found', `Insurance #${id} not found`, { id });
  if (current.status !== 'active') throw conflict('insurance_not_active', `Insurance ${current.insurance_number} is already ${current.status}`, { id: current.id, status: current.status });
  return (await q("UPDATE insurances SET status = 'cancelled', notes = COALESCE(notes || E'\\n', '') || $2, updated_at = NOW() WHERE id = $1 RETURNING *", [current.id, `Cancelled: ${String(reason).trim()}`])).rows[0];
}

// --- currency rates ------------------------------------------------------------------------------------
async function setRate(q, { from_currency, to_currency, rate, effective_date, source = null }, userId) {
  const from = String(from_currency).toUpperCase(); const to = String(to_currency).toUpperCase();
  if (from === to) throw bad('currency_pair_invalid', 'The two currencies must differ', { from, to });
  try {
    return (await q(
      `INSERT INTO currency_rates (from_currency, to_currency, rate, effective_date, source, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [from, to, rate, effective_date, source, userId])).rows[0];
  } catch (e) {
    if (e.code === '23505') throw conflict('currency_rate_exists', `A ${from}/${to} rate already exists for ${effective_date}: rates are history, add a new date`, { from, to, effective_date });
    throw e;
  }
}

async function listRates(q, { from_currency = null, to_currency = null } = {}) {
  const conds = []; const params = [];
  if (from_currency) conds.push(`from_currency = $${params.push(String(from_currency).toUpperCase())}`);
  if (to_currency) conds.push(`to_currency = $${params.push(String(to_currency).toUpperCase())}`);
  return (await q(`SELECT * FROM currency_rates ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY effective_date DESC, id DESC LIMIT 500`, params)).rows;
}

// Latest rate on or before the date. Falls back to the inverse of the opposite pair; a missing rate is an error,
// never "1".
async function convert(q, { amount, from_currency, to_currency, as_of = null }) {
  const from = String(from_currency).toUpperCase(); const to = String(to_currency).toUpperCase();
  if (from === to) return { amount: Number(amount).toFixed(2), rate: '1', from, to, as_of: as_of || null, inverse: false };
  const date = as_of || new Date().toISOString().slice(0, 10);
  const direct = (await q(
    `SELECT rate, effective_date, ROUND($4::numeric * rate, 2) AS converted FROM currency_rates
      WHERE from_currency = $1 AND to_currency = $2 AND effective_date <= $3 ORDER BY effective_date DESC LIMIT 1`, [from, to, date, amount])).rows[0];
  const inverse = (await q(
    `SELECT rate, effective_date, ROUND($4::numeric / rate, 2) AS converted FROM currency_rates
      WHERE from_currency = $2 AND to_currency = $1 AND effective_date <= $3 ORDER BY effective_date DESC LIMIT 1`, [from, to, date, amount])).rows[0];
  const hit = direct && (!inverse || new Date(direct.effective_date) >= new Date(inverse.effective_date)) ? { ...direct, inverse: false } : inverse ? { ...inverse, inverse: true } : null;
  if (!hit) throw missing('currency_rate_missing', `No ${from}/${to} rate on or before ${date}`, { from, to, as_of: date });
  return { amount: hit.converted, rate: hit.rate, from, to, as_of: date, rate_date: hit.effective_date, inverse: hit.inverse };
}

// --- payment applications ------------------------------------------------------------------------------
async function getApplication(q, id) {
  const row = (await q('SELECT * FROM payment_applications WHERE id = $1', [toInt(id)])).rows[0];
  if (!row) throw missing('payment_application_not_found', `Payment application #${id} not found`, { id });
  if (row.valuation_basis === 'certified_quantity') {
    row.quantity_lines = (await q(`SELECT l.id, l.quantity_measurement_id, l.boq_item_id, l.claimed_quantity,
      l.certified_quantity, l.unit_rate, l.claimed_amount, l.certified_amount,
      qm.measured_date, qm.unit, qm.approval_state
      FROM payment_application_quantity_lines l
      JOIN quantity_measurements qm ON qm.id = l.quantity_measurement_id
      WHERE l.payment_application_id = $1 ORDER BY l.id`, [row.id])).rows;
  }
  return row;
}

async function listApplications(q, { project_id = null, status = null, party_type = null } = {}) {
  const conds = []; const params = [];
  if (project_id != null) conds.push(`project_id = $${params.push(toInt(project_id))}`);
  if (status) conds.push(`status = $${params.push(status)}`);
  if (party_type) conds.push(`party_type = $${params.push(party_type)}`);
  return (await q(`SELECT * FROM payment_applications ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 200`, params)).rows;
}

async function createApplication(q, data, userId) {
  const project = (await q('SELECT id FROM projects WHERE id = $1', [data.project_id])).rows[0];
  if (!project) throw missing('project_not_found', `Project #${data.project_id} not found`, { project_id: data.project_id });
  const table = data.party_type === 'client' ? 'client_contracts' : 'sub_contracts';
  const contractId = data.party_type === 'client' ? data.client_contract_id : data.sub_contract_id;
  const contract = contractId == null ? null : (await q(`SELECT id, project_id FROM ${table} WHERE id = $1`, [contractId])).rows[0];
  if (!contract) throw bad('contract_required', `A ${data.party_type === 'client' ? 'client' : 'sub'}contract is required`, { party_type: data.party_type });
  if (Number(contract.project_id) !== Number(data.project_id)) throw bad('contract_project_mismatch', 'The contract belongs to a different project', { project_id: data.project_id });
  let quantityLines = [];
  let claimedWork = data.claimed_work ?? 0;
  if (Array.isArray(data.quantity_lines) && data.quantity_lines.length) {
    const ids = data.quantity_lines.map((line) => toInt(line.quantity_measurement_id));
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw bad('quantity_measurement_duplicate', 'Each certified measurement can appear once per application', {});
    const measurements = (await q(
      `SELECT id, project_id, boq_item_id, quantity, approval_state
         FROM quantity_measurements WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [ids]
    )).rows;
    if (measurements.length !== ids.length) throw missing('quantity_measurement_not_found', 'One or more measurements were not found', {});
    const byId = new Map(measurements.map((row) => [Number(row.id), row]));
    const contractLinesTable = data.party_type === 'client' ? 'contract_lines' : 'sub_contract_lines';
    const contractKey = data.party_type === 'client' ? 'client_contract_id' : 'sub_contract_id';
    const lineRates = (await q(
      `SELECT boq_item_id, unit_rate FROM ${contractLinesTable} WHERE ${contractKey} = $1 AND boq_item_id = ANY($2::int[]) ORDER BY boq_item_id, id`, [contractId, [...new Set(measurements.map((m) => Number(m.boq_item_id)))]]
    )).rows;
    const ratesByItem = new Map();
    for (const row of lineRates) ratesByItem.set(Number(row.boq_item_id), [...(ratesByItem.get(Number(row.boq_item_id)) || []), row.unit_rate]);
    quantityLines = data.quantity_lines.map((line) => {
      const measurement = byId.get(toInt(line.quantity_measurement_id));
      if (Number(measurement.project_id) !== Number(data.project_id) || measurement.approval_state !== 'certified') {
        throw bad('quantity_measurement_not_certified', 'Every claimed measurement must be certified and belong to this project', { measurement_id: measurement.id });
      }
      const quantity = Number(line.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(measurement.quantity)) {
        throw bad('quantity_claim_invalid', 'Claimed quantity must be positive and no greater than its certified measurement', { measurement_id: measurement.id });
      }
      const rates = ratesByItem.get(Number(measurement.boq_item_id)) || [];
      if (rates.length !== 1) throw bad('contract_boq_rate_ambiguous', 'Each claimed BOQ item must have exactly one line on the client contract', { boq_item_id: measurement.boq_item_id });
      return { measurement_id: Number(measurement.id), boq_item_id: Number(measurement.boq_item_id), quantity, unit_rate: rates[0] };
    });
    const reserved = (await q(
      `SELECT l.quantity_measurement_id,
              COALESCE(SUM(CASE WHEN a.status = 'certified' THEN COALESCE(l.certified_quantity, 0) ELSE l.claimed_quantity END), 0) AS quantity
         FROM payment_application_quantity_lines l
         JOIN payment_applications a ON a.id = l.payment_application_id
        WHERE l.quantity_measurement_id = ANY($1::int[]) AND a.status IN ('draft', 'submitted', 'certified')
        GROUP BY l.quantity_measurement_id`, [ids]
    )).rows;
    const reservedByMeasurement = new Map(reserved.map((row) => [Number(row.quantity_measurement_id), Number(row.quantity)]));
    for (const line of quantityLines) {
      const measurement = byId.get(line.measurement_id);
      if ((reservedByMeasurement.get(line.measurement_id) || 0) + line.quantity > Number(measurement.quantity) + 1e-9) {
        throw conflict('quantity_already_claimed', 'The requested quantity has already been reserved or certified on another application', { measurement_id: line.measurement_id });
      }
    }
    claimedWork = (await q(
      `SELECT ROUND(SUM(ROUND(x.qty * x.rate, 2)), 2) AS total
         FROM unnest($1::numeric[], $2::numeric[]) AS x(qty, rate)`,
      [quantityLines.map((line) => line.quantity), quantityLines.map((line) => line.unit_rate)]
    )).rows[0].total;
  }
  const number = await numbering.nextNumber(q, { table: 'payment_applications', column: 'application_number', prefix: 'PAP', pad: 5 });
  const app = (await q(
    `INSERT INTO payment_applications (application_number, party_type, project_id, client_contract_id, sub_contract_id, period_from, period_to, claimed_work, claimed_variations, claimed_materials, notes, created_by, valuation_basis)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [number, data.party_type, data.project_id, data.party_type === 'client' ? contractId : null, data.party_type === 'client' ? null : contractId,
      data.period_from ?? null, data.period_to ?? null, claimedWork, quantityLines.length ? 0 : data.claimed_variations ?? 0,
      quantityLines.length ? 0 : data.claimed_materials ?? 0, data.notes ?? null, userId, quantityLines.length ? 'certified_quantity' : 'manual'])).rows[0];
  for (const line of quantityLines) {
    const amount = (await q('SELECT ROUND($1::numeric * $2::numeric, 2) AS amount', [line.quantity, line.unit_rate])).rows[0].amount;
    await q(`INSERT INTO payment_application_quantity_lines
      (payment_application_id, quantity_measurement_id, boq_item_id, claimed_quantity, unit_rate, claimed_amount)
      VALUES ($1,$2,$3,$4,$5,$6)`, [app.id, line.measurement_id, line.boq_item_id, line.quantity, line.unit_rate, amount]);
  }
  return app;
}

async function submitApplication(q, id, user) {
  const app = (await q('SELECT * FROM payment_applications WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!app) throw missing('payment_application_not_found', `Payment application #${id} not found`, { id });
  if (app.status !== 'draft') throw conflict('payment_application_not_draft', `Application ${app.application_number} is ${app.status}: only a draft can be submitted`, { id: app.id, status: app.status });
  if (toNum(app.claimed_work) + toNum(app.claimed_variations) + toNum(app.claimed_materials) <= 0) throw bad('payment_application_empty', 'Nothing is claimed', { id: app.id });
  return (await q("UPDATE payment_applications SET status = 'submitted', submitted_by = $2, submitted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *", [app.id, user.id])).rows[0];
}

// Certify (or certify less than claimed): creates the DRAFT payment certificate with the engine's certificate math
// (retention at the contract's percentage; advance recovery and other deductions are recorded as given and post
// nowhere yet: the chart accounts wait for the owner, see the PR). The certificate then runs the workflow.
async function certifyApplication(q, id, user, { certified_work, certified_variations = 0, certified_materials = 0, certified_quantity_lines, advance_recovery, other_deductions = 0, tax_pct = 0, review_notes = null }) {
  const app = (await q('SELECT * FROM payment_applications WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!app) throw missing('payment_application_not_found', `Payment application #${id} not found`, { id });
  if (app.status !== 'submitted') throw conflict('payment_application_not_submitted', `Application ${app.application_number} is ${app.status}: only a submitted one can be certified`, { id: app.id, status: app.status });
  const contract = app.party_type === 'client'
    ? (await q('SELECT retention_percent, advance_amount FROM client_contracts WHERE id = $1', [app.client_contract_id])).rows[0]
    : (await q('SELECT retention_percent, advance_amount FROM sub_contracts WHERE id = $1', [app.sub_contract_id])).rows[0];
  let work = toNum(certified_work); const variations = toNum(certified_variations); const materials = toNum(certified_materials);
  if (app.valuation_basis === 'certified_quantity') {
    if (certified_work !== undefined) throw bad('certified_quantity_amount_override', 'Certified work is calculated from the certified quantities and contract rates', {});
    const lines = (await q(`SELECT l.*, qm.quantity, qm.approval_state FROM payment_application_quantity_lines l
      JOIN quantity_measurements qm ON qm.id = l.quantity_measurement_id
      WHERE l.payment_application_id = $1 ORDER BY l.id FOR UPDATE OF l, qm`, [app.id])).rows;
    if (!Array.isArray(certified_quantity_lines) || certified_quantity_lines.length !== lines.length) {
      throw bad('certified_quantity_lines_required', 'Provide the certified quantity for every claimed line', { application_id: app.id });
    }
    const requested = new Map();
    for (const line of certified_quantity_lines) {
      const measurementId = toInt(line.quantity_measurement_id);
      if (!measurementId || requested.has(measurementId)) throw bad('quantity_measurement_duplicate', 'Each claimed measurement can be certified once', {});
      requested.set(measurementId, Number(line.quantity));
    }
    let total = 0;
    for (const line of lines) {
      const qty = requested.get(Number(line.quantity_measurement_id));
      if (qty === undefined || !Number.isFinite(qty) || qty < 0 || qty > Number(line.claimed_quantity) || line.approval_state !== 'certified') {
        throw bad('certified_quantity_invalid', 'Certified quantities must map to certified measurements and cannot exceed each claim', { measurement_id: line.quantity_measurement_id });
      }
      const amount = (await q('SELECT ROUND($1::numeric * $2::numeric, 2) AS amount', [qty, line.unit_rate])).rows[0].amount;
      await q('UPDATE payment_application_quantity_lines SET certified_quantity = $1, certified_amount = $2 WHERE id = $3', [qty, amount, line.id]);
      total += Number(amount);
    }
    work = (await q('SELECT ROUND($1::numeric, 2) AS amount', [total])).rows[0].amount;
    if (variations !== 0 || materials !== 0) throw bad('quantity_valuation_other_amounts_unsupported', 'Quantity-based applications cannot add variation or material amounts to certified work', {});
  }
  if (work > toNum(app.claimed_work) + 1e-9 || variations > toNum(app.claimed_variations) + 1e-9 || materials > toNum(app.claimed_materials) + 1e-9) {
    throw bad('certified_exceeds_claimed', 'The certified amount cannot exceed what was claimed', { id: app.id });
  }
  const gross = (await q(
    'SELECT ROUND($1::numeric + $2::numeric, 2) AS gross_work, ROUND($1::numeric + $2::numeric + $3::numeric, 2) AS gross_certified',
    [work, certified_materials, certified_variations]
  )).rows[0];
  const grossWork = gross.gross_work;
  const grossCertified = gross.gross_certified;
  const project = (await q('SELECT retention_cap_amount FROM projects WHERE id = $1', [app.project_id])).rows[0] || {};
  const prior = (await q(
    `SELECT COALESCE(MAX(cumulative_certified), 0) AS cumulative_certified,
            COALESCE(SUM(retention_held), 0) AS retention_held_total,
            COALESCE(SUM(advance_recovery), 0) AS advance_recovered_total
       FROM payment_certificates WHERE project_id = $1 AND party_type = $2
        AND status NOT IN ('cancelled', 'void', 'rejected')
        AND ((party_type = 'client' AND client_contract_id = $3) OR (party_type = 'subcontractor' AND sub_contract_id = $4))`,
    [app.project_id, app.party_type, app.client_contract_id, app.sub_contract_id])).rows[0];
  const setting = (await q("SELECT setting_value FROM project_settings WHERE project_id = $1 AND setting_key = 'advance.recovery_percent'", [app.project_id])).rows[0];
  const settingValue = setting && setting.setting_value;
  const recoveryPercent = Number(settingValue && typeof settingValue === 'object' ? settingValue.value : settingValue);
  const configuredRecoveryPercent = Number.isFinite(recoveryPercent) && recoveryPercent >= 0 && recoveryPercent <= 100 ? recoveryPercent : 0;
  const cappedValues = (await q(
    `WITH inputs AS (
       SELECT $1::numeric AS gross, $2::numeric AS retention_pct, $3::numeric AS retention_cap,
              $4::numeric AS retention_held, $5::numeric AS advance_cap,
              $6::numeric AS recovery_pct, $7::numeric AS advance_recovered
     ), amounts AS (
       SELECT *, ROUND(gross * retention_pct / 100, 2) AS calculated_retention,
              ROUND(gross * recovery_pct / 100, 2) AS calculated_advance
         FROM inputs
     )
     SELECT CASE WHEN retention_cap IS NULL THEN calculated_retention
                 ELSE LEAST(calculated_retention, GREATEST(retention_cap - retention_held, 0)) END AS retention,
            CASE WHEN advance_cap IS NULL THEN 0::numeric
                 ELSE LEAST(calculated_advance, GREATEST(advance_cap - advance_recovered, 0)) END AS calculated_advance_recovery,
            CASE WHEN advance_cap IS NULL THEN NULL::numeric
                 ELSE GREATEST(advance_cap - advance_recovered, 0) END AS advance_remaining
       FROM amounts`,
    [grossCertified, contract && contract.retention_percent || 0, project.retention_cap_amount,
      prior.retention_held_total, contract && contract.advance_amount, configuredRecoveryPercent, prior.advance_recovered_total]
  )).rows[0];
  const retention = cappedValues.retention;
  const calculatedAdvanceRecovery = cappedValues.calculated_advance_recovery;
  const advanceRecoveryOverridden = advance_recovery !== undefined;
  const advanceRecovery = advanceRecoveryOverridden ? advance_recovery : calculatedAdvanceRecovery;
  if (cappedValues.advance_remaining != null && (await q(
    'SELECT $1::numeric > $2::numeric AS exceeds', [advanceRecovery, cappedValues.advance_remaining]
  )).rows[0].exceeds) {
    throw bad('advance_recovery_exceeds_balance', 'Advance recovery cannot exceed the unrecovered contract advance', {
      requested: advanceRecovery, remaining_advance: cappedValues.advance_remaining,
    });
  }
  const net = engine.computeCertificateNet({ grossCurrentWork: grossWork, approvedVariationsPeriod: variations, retention, advanceRecovery, otherDeductions: other_deductions, taxPct: tax_pct });
  if (!(net.net_certificate > 0)) throw bad('certificate_net_non_positive', 'The net certificate must be greater than zero', {});
  const previous = engine.round2(prior.cumulative_certified);
  const number = await numbering.nextNumber(q, { table: 'payment_certificates', column: 'certificate_number', prefix: 'PC', pad: 4 });
  const cert = (await q(
    `INSERT INTO payment_certificates (certificate_number, party_type, project_id, client_contract_id, sub_contract_id, period_from, period_to,
       gross_current_work, approved_variations_period, gross_certified, retention_held, advance_recovery, other_deductions, tax_pct, tax_amount,
       net_certificate, previous_cumulative, cumulative_certified, status, created_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'draft',$19,$20) RETURNING *`,
    [number, app.party_type, app.project_id, app.client_contract_id, app.sub_contract_id, app.period_from, app.period_to,
      grossWork, variations, net.gross_certified, retention, advanceRecovery, toNum(other_deductions), toNum(tax_pct), net.tax_amount,
      net.net_certificate, previous, engine.round2(previous + net.gross_certified), user.id, `From payment application ${app.application_number}`])).rows[0];
  const updated = (await q(
    `UPDATE payment_applications SET status = 'certified', certified_work = $2, certified_variations = $3, certified_materials = $4,
            reviewed_by = $5, reviewed_at = NOW(), review_notes = $6, certificate_id = $7, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [app.id, work, variations, materials, user.id, review_notes, cert.id])).rows[0];
  return { application: updated, certificate: cert, advance_recovery_calculated: calculatedAdvanceRecovery, advance_recovery_overridden: advanceRecoveryOverridden };
}

async function rejectApplication(q, id, user, notes) {
  if (String(notes || '').trim().length < 3) throw bad('reason_required', 'A reason is required', {});
  const app = (await q('SELECT * FROM payment_applications WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!app) throw missing('payment_application_not_found', `Payment application #${id} not found`, { id });
  if (app.status !== 'submitted') throw conflict('payment_application_not_submitted', `Application ${app.application_number} is ${app.status}: only a submitted one can be rejected`, { id: app.id, status: app.status });
  return (await q("UPDATE payment_applications SET status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), review_notes = $3, updated_at = NOW() WHERE id = $1 RETURNING *", [app.id, user.id, String(notes).trim()])).rows[0];
}

async function withdrawApplication(q, id, user) {
  const app = (await q('SELECT * FROM payment_applications WHERE id = $1 FOR UPDATE', [toInt(id)])).rows[0];
  if (!app) throw missing('payment_application_not_found', `Payment application #${id} not found`, { id });
  if (!['draft', 'submitted'].includes(app.status)) throw conflict('payment_application_cannot_withdraw', `Application ${app.application_number} is ${app.status} and cannot be withdrawn`, { id: app.id, status: app.status });
  return (await q("UPDATE payment_applications SET status = 'withdrawn', updated_at = NOW() WHERE id = $1 RETURNING *", [app.id])).rows[0];
}

// --- payment certificate workflow ------------------------------------------------------------------------
// The seeded payment_certificate template (draft_measurement, qs_review, pm_commercial, consultant_client,
// certified, invoice_eligible). Starting it records the requester's own first step; the certificate's status
// mirrors the step; the last approval makes it 'certified' (invoice eligible).
async function startCertificateWorkflow(q, certificateId, user) {
  const cert = (await q('SELECT * FROM payment_certificates WHERE id = $1 FOR UPDATE', [toInt(certificateId)])).rows[0];
  if (!cert) throw missing('payment_certificate_not_found', `Payment certificate #${certificateId} not found`, { id: certificateId });
  if (cert.workflow_instance_id != null) throw conflict('workflow_already_started', 'This certificate already has a workflow', { id: cert.id });
  if (cert.status !== 'draft') throw conflict('payment_certificate_not_draft', `Certificate ${cert.certificate_number} is ${cert.status}`, { id: cert.id, status: cert.status });
  const instance = await workflowEngine.startWorkflow('payment_certificate', 'payment_certificate', cert.id, {
    module_name: 'payment_certificate', requester_id: user.id, project_id: cert.project_id, amount: toNum(cert.net_certificate),
  }, { query: q });
  const step = (await q("SELECT id FROM workflow_step_instances WHERE instance_id = $1 AND step_key = 'draft_measurement' AND status = 'pending'", [instance.instance.id])).rows[0];
  if (step) {
    const r = await workflowEngine.recordDecision(instance.instance.id, step.id, user.id, 'approve', 'Submitted', { query: q, role: user.role, userName: user.name });
    if (!r.ok) throw bad('workflow_step_refused', r.error, { id: cert.id });
  }
  const wf = (await q('SELECT current_step_key FROM workflow_instances WHERE id = $1', [instance.instance.id])).rows[0];
  return (await q("UPDATE payment_certificates SET workflow_instance_id = $2, status = $3, updated_at = NOW() WHERE id = $1 RETURNING *", [cert.id, instance.instance.id, wf ? wf.current_step_key : 'qs_review'])).rows[0];
}

async function decideCertificate(q, certificateId, user, decision, comment = null) {
  if (!['approve', 'reject'].includes(decision)) throw bad('decision_invalid', 'decision must be approve or reject', { decision });
  const cert = (await q('SELECT * FROM payment_certificates WHERE id = $1 FOR UPDATE', [toInt(certificateId)])).rows[0];
  if (!cert) throw missing('payment_certificate_not_found', `Payment certificate #${certificateId} not found`, { id: certificateId });
  if (cert.workflow_instance_id == null) throw conflict('workflow_not_started', 'The certificate workflow has not been started', { id: cert.id });
  const beforeWorkflow = (await q('SELECT status FROM workflow_instances WHERE id = $1 FOR UPDATE', [cert.workflow_instance_id])).rows[0];
  if (!beforeWorkflow || beforeWorkflow.status !== 'active' || ['rejected', 'cancelled', 'void'].includes(cert.status)) {
    throw conflict('payment_certificate_closed', `Certificate ${cert.certificate_number} is ${cert.status}`, { id: cert.id, status: cert.status });
  }
  const result = await workflowEngine.recordDecision(cert.workflow_instance_id, null, user.id, decision, comment, { query: q, role: user.role, userName: user.name });
  if (!result.ok) throw new (require('./commercialErrors').CommercialError)(403, 'certificate_decision_refused', result.error, { id: cert.id });
  const wf = (await q('SELECT status, current_step_key FROM workflow_instances WHERE id = $1', [cert.workflow_instance_id])).rows[0];
  let status = wf.current_step_key === 'certified' ? 'finance_review' : wf.current_step_key;
  if (wf.status === 'approved') status = 'certified';
  else if (wf.status === 'rejected') status = 'rejected';
  const saved = (await q(
    `UPDATE payment_certificates SET status = $2::varchar, certified_by = CASE WHEN $2::varchar = 'certified' THEN $3::int ELSE certified_by END, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [cert.id, status, user.id])).rows[0];
  if (wf.status === 'approved' && cert.party_type === 'client') {
    const contract = (await q('SELECT client_id FROM client_contracts WHERE id = $1', [cert.client_contract_id])).rows[0];
    if (!contract) throw missing('client_contract_not_found', `Client contract #${cert.client_contract_id} not found`, { id: cert.client_contract_id });
    saved.invoice = await require('./financeEngine').createInvoiceFromCertificate(q, saved, contract.client_id, user);
  } else if (wf.status === 'approved' && cert.party_type === 'subcontractor') {
    await glPosting.postSubcontractorCertificate(q, saved, { userId: user.id });
    saved.ledger_posted = true;
  }
  return saved;
}

async function voidCertificate(q, certificateId, user, reason) {
  if (String(reason || '').trim().length < 3) throw bad('reason_required', 'A reason is required to void a certificate', {});
  const cert = (await q('SELECT * FROM payment_certificates WHERE id = $1 FOR UPDATE', [toInt(certificateId)])).rows[0];
  if (!cert) throw missing('payment_certificate_not_found', `Payment certificate #${certificateId} not found`, { id: certificateId });
  if (cert.status !== 'certified') throw conflict('payment_certificate_not_voidable', `Certificate ${cert.certificate_number} is ${cert.status}: only a certified certificate can be voided`, { id: cert.id, status: cert.status });
  if (cert.paid_at) throw conflict('payment_certificate_already_paid', 'A paid certificate cannot be voided', { id: cert.id });
  if (cert.party_type === 'client') {
    const invoice = (await q('SELECT id, status FROM invoices WHERE payment_certificate_id = $1 FOR UPDATE', [cert.id])).rows[0];
    if (invoice && !['void', 'cancelled'].includes(invoice.status)) {
      throw conflict('certificate_invoice_must_be_void', 'Void or cancel the linked client invoice before voiding its certificate', { invoice_id: invoice.id, status: invoice.status });
    }
  } else {
    await glPosting.reverseSubcontractorCertificate(q, cert, { userId: user.id });
  }
  return (await q(
    `UPDATE payment_certificates SET status = 'void', voided_by = $2, voided_at = NOW(), void_reason = $3, updated_at = NOW()
      WHERE id = $1 RETURNING *`, [cert.id, user.id, String(reason).trim()]
  )).rows[0];
}

module.exports = {
  listParties, addParty, updateParty,
  createGuarantee, listGuarantees, getGuarantee, updateGuarantee, closeGuarantee,
  createInsurance, listInsurances, getInsurance, updateInsurance, cancelInsurance,
  setRate, listRates, convert,
  getApplication, listApplications, createApplication, submitApplication, certifyApplication, rejectApplication, withdrawApplication,
  startCertificateWorkflow, decideCertificate, voidCertificate,
};
