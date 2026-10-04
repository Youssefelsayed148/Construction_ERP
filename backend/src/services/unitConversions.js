// Phase 5.3 - the unit conversion table (spec 07). The table (migration 0034) is the authority: a row is
// per material, or company-wide when material_id is NULL; a material row beats a company row for the same
// pair. The per-item JSONB item_master.unit_conversions (seeded by the planning migration, written by no
// route) is a compatibility copy that is still read for pairs the table does not hold.
'use strict';

const { convertQuantity, parseConversions, toNum } = require('../utils/units');

class UnitError extends Error {
  constructor(status, code, message, params = {}) {
    super(message);
    this.status = status; this.error_code = code; this.error_params = params;
  }
}

const rowShape = (r) => ({ from_unit: r.from_unit, to_unit: r.to_unit, factor: toNum(r.factor) });

// Every conversion that applies to a material, as [{from_unit, to_unit, factor}].
async function conversionsFor(q, materialId) {
  const rows = (await q(
    `SELECT material_id, from_unit, to_unit, factor FROM unit_conversions
      WHERE material_id = $1 OR material_id IS NULL ORDER BY material_id NULLS FIRST, id`, [materialId == null ? null : Number(materialId)])).rows;
  const byPair = new Map();
  for (const r of rows) byPair.set(`${r.from_unit}|${r.to_unit}`, rowShape(r));   // material rows come last and win
  if (materialId != null) {
    const legacy = (await q('SELECT unit_conversions FROM item_master WHERE id = $1', [Number(materialId)])).rows[0];
    for (const c of parseConversions(legacy && legacy.unit_conversions)) {
      const key = `${c.from_unit}|${c.to_unit}`;
      if (!byPair.has(key) && c.from_unit && c.to_unit && toNum(c.factor) > 0) byPair.set(key, rowShape(c));
    }
  }
  return [...byPair.values()];
}

async function convert(q, materialId, quantity, fromUnit, toUnit) {
  try {
    return convertQuantity(quantity, fromUnit, toUnit, await conversionsFor(q, materialId));
  } catch (e) {
    throw new UnitError(400, 'unit_conversion_missing', e.message, { material_id: materialId, from_unit: fromUnit, to_unit: toUnit });
  }
}

async function list(q, { material_id = null } = {}) {
  const params = []; let where = '';
  if (material_id != null) { params.push(Number(material_id)); where = 'WHERE material_id = $1 OR material_id IS NULL'; }
  return (await q(`SELECT * FROM unit_conversions ${where} ORDER BY material_id NULLS FIRST, from_unit, to_unit`, params)).rows;
}

function validatePair({ from_unit, to_unit, factor }) {
  const f = String(from_unit || '').trim(); const t = String(to_unit || '').trim();
  if (!f || !t) throw new UnitError(400, 'unit_conversion_units_required', 'from_unit and to_unit are required');
  if (f.toLowerCase() === t.toLowerCase()) throw new UnitError(400, 'unit_conversion_same_unit', 'A unit cannot be converted to itself', { unit: f });
  if (!(toNum(factor) > 0)) throw new UnitError(400, 'unit_conversion_factor_invalid', 'factor must be positive', { factor });
  return { from_unit: f, to_unit: t, factor: toNum(factor) };
}

async function create(q, body, userId = null) {
  const v = validatePair(body);
  const materialId = body.material_id == null ? null : Number(body.material_id);
  if (materialId != null) {
    const item = (await q('SELECT id FROM item_master WHERE id = $1', [materialId])).rows[0];
    if (!item) throw new UnitError(404, 'material_not_found', `Material #${materialId} not found`, { material_id: materialId });
  }
  const dup = (await q(
    'SELECT id FROM unit_conversions WHERE COALESCE(material_id, 0) = $1 AND from_unit = $2 AND to_unit = $3', [materialId || 0, v.from_unit, v.to_unit])).rows[0];
  if (dup) throw new UnitError(409, 'unit_conversion_exists', `${v.from_unit} -> ${v.to_unit} is already declared`, { id: dup.id });
  return (await q(
    `INSERT INTO unit_conversions (material_id, from_unit, to_unit, factor, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [materialId, v.from_unit, v.to_unit, v.factor, body.notes || null, userId])).rows[0];
}

async function update(q, id, body) {
  const row = (await q('SELECT * FROM unit_conversions WHERE id = $1', [Number(id)])).rows[0];
  if (!row) throw new UnitError(404, 'unit_conversion_not_found', `Unit conversion #${id} not found`, { id });
  const v = validatePair({ from_unit: body.from_unit ?? row.from_unit, to_unit: body.to_unit ?? row.to_unit, factor: body.factor ?? row.factor });
  const clash = (await q(
    'SELECT id FROM unit_conversions WHERE COALESCE(material_id, 0) = $1 AND from_unit = $2 AND to_unit = $3 AND id <> $4',
    [row.material_id || 0, v.from_unit, v.to_unit, row.id])).rows[0];
  if (clash) throw new UnitError(409, 'unit_conversion_exists', `${v.from_unit} -> ${v.to_unit} is already declared`, { id: clash.id });
  return (await q(
    'UPDATE unit_conversions SET from_unit = $2, to_unit = $3, factor = $4, notes = COALESCE($5, notes) WHERE id = $1 RETURNING *',
    [row.id, v.from_unit, v.to_unit, v.factor, body.notes ?? null])).rows[0];
}

async function remove(q, id) {
  const r = (await q('DELETE FROM unit_conversions WHERE id = $1 RETURNING *', [Number(id)])).rows[0];
  if (!r) throw new UnitError(404, 'unit_conversion_not_found', `Unit conversion #${id} not found`, { id });
  return r;
}

module.exports = { UnitError, conversionsFor, convert, list, create, update, remove };
