const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

// Mounted at /api/sales — buildings & sellable units (real estate).

const UNIT_TYPES = ['apartment', 'villa', 'penthouse', 'studio', 'townhouse', 'duplex', 'commercial', 'plot', 'office'];
const FINISHING_TYPES = ['finished', 'semi_finished', 'core_shell', 'land_only'];
const UNIT_STATUSES = ['available', 'reserved', 'contracted', 'delivered', 'blocked', 'closed'];

// Sales flow moves forward; blocked can be released back to available.
const UNIT_TRANSITIONS = {
  available: ['reserved', 'blocked'],
  reserved: ['contracted', 'available'],
  contracted: ['delivered', 'reserved'],
  delivered: ['closed'],
  blocked: ['available'],
};

// Auto-create invoice helper — creates an invoice for a unit sale to track receivables
async function createUnitSaleInvoice({ unit, building, clientId, userId, userName, userRole }) {
  const amount = unit.sold_amount || unit.price || 0;
  if (amount <= 0) {
    console.log(`[SALES] Skipping invoice for unit ${unit.code} — no amount (price=${unit.price}, sold_amount=${unit.sold_amount})`);
    return null;
  }

  const count = await query("SELECT COUNT(*) as cnt FROM invoices WHERE invoice_number LIKE 'INV-%'");
  const invoiceNumber = `INV-${String(parseInt(count.rows[0].cnt) + 1).padStart(4, '0')}`;

  const today = new Date().toISOString().split('T')[0];

  const result = await query(
    `INSERT INTO invoices (invoice_number, project_id, client_id, amount, issue_date, status, description)
     VALUES ($1, $2, $3, $4, $5, 'sent', $6) RETURNING *`,
    [invoiceNumber, building.project_id, clientId, amount, today,
     `Auto-generated: Sale of unit ${unit.code} (${building.name})`]
  );

  const { logActivity } = require('../utils/activity');
  await logActivity({
    userId, userName, userRole,
    action: 'create', module: 'invoices',
    description: `Auto-created invoice ${invoiceNumber} for unit ${unit.code} sale — ${amount} EGP`,
    entityId: result.rows[0].id, entityType: 'invoice', amount
  });

  console.log(`[SALES] Auto-created invoice ${invoiceNumber} for unit ${unit.code}, amount=${amount}`);
  return result.rows[0];
}

// ============ BUILDINGS ============

router.get('/buildings', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let conditions = []; let params = []; let idx = 1;
    if (project_id) { conditions.push(`b.project_id = $${idx++}`); params.push(project_id); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    // Phase 8: floors are real project_locations child rows, not an integer
    // column — readers count the rows.
    const result = await query(
      `SELECT b.*,
        (SELECT COUNT(*) FROM units u WHERE u.building_id = b.id) as units_count,
        (SELECT COUNT(*) FROM units u WHERE u.building_id = b.id AND u.status = 'available') as available_count,
        (SELECT COUNT(*) FROM project_locations fl WHERE fl.parent_id = b.project_location_id) as floor_count,
        (SELECT COUNT(*) FROM project_locations fl
          JOIN location_types lt ON lt.id = fl.location_type_id
          WHERE fl.parent_id = b.project_location_id AND lt.code = 'floor') as floor_count_typed,
        b.project_location_id
       FROM buildings b ${where} ORDER BY b.code`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/buildings', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      project_id: Joi.number().integer().required(),
      code: Joi.string().required(),
      name: Joi.string().required(),
      floors: Joi.number().integer().min(1).default(1),
      status: Joi.string().valid('planning', 'under_construction', 'completed').default('planning'),
      completion_percentage: Joi.number().min(0).max(100).default(0),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const buildingTypeId = (await query("SELECT id FROM location_types WHERE code = 'building'")).rows[0]?.id || null;
    const floorTypeId = (await query("SELECT id FROM location_types WHERE code = 'floor'")).rows[0]?.id || null;
    const root = await query('SELECT id FROM project_locations WHERE project_id = $1 AND parent_id IS NULL ORDER BY id LIMIT 1', [value.project_id]);
    const parentId = root.rows[0] ? root.rows[0].id : null;

    // Building location rows are real project_locations; floors are one row
    // per integer, not a count. The buildings row keeps its legacy columns
    // during the transition and links to its location.
    const result = await query(
      `INSERT INTO buildings (project_id, code, name, status, completion_percentage)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [value.project_id, value.code, value.name, value.status, value.completion_percentage]
    );
    const building = result.rows[0];
    const loc = await query(
      `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, legacy_building_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0) RETURNING id`,
      [value.project_id, parentId, buildingTypeId, value.code, value.name, value.name, value.name, building.id]
    );
    const locationId = loc.rows[0].id;
    for (let f = 1; f <= value.floors; f++) {
      await query(
        `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [value.project_id, locationId, floorTypeId, `F-${String(f).padStart(2, '0')}`, `Floor ${f}`, `Floor ${f}`, `الطابق ${f}`, f]
      );
    }
    await query('UPDATE buildings SET project_location_id = $1 WHERE id = $2', [locationId, building.id]);
    const fresh = await query('SELECT * FROM buildings WHERE id = $1', [building.id]);

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'sales', description: `Created building ${value.code} - ${value.name}`, entityId: building.id, entityType: 'building' });
    res.status(201).json({ success: true, data: fresh.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'Building code already exists in this project' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/buildings/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string(), name: Joi.string(),
      status: Joi.string().valid('planning', 'under_construction', 'completed'),
      completion_percentage: Joi.number().min(0).max(100),
      floors: Joi.number().integer().min(0),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    // Phase 8: floors are managed as real location rows. Setting `floors`
    // here syncs the location tree (add/remove floor rows) — no counter.
    const { floors, ...fields } = value;

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE buildings SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Building not found' });

    if (floors !== undefined) {
      const floorTypeId = (await query("SELECT id FROM location_types WHERE code = 'floor'")).rows[0]?.id || null;
      const existing = await query(
        `SELECT pl.* FROM project_locations pl
         JOIN location_types lt ON lt.id = pl.location_type_id
         WHERE pl.parent_id = $1 AND lt.code = 'floor' ORDER BY pl.sort_order, pl.id`,
        [result.rows[0].project_location_id]
      );
      const floorLocs = existing.rows;
      if (floors > floorLocs.length) {
        for (let f = floorLocs.length + 1; f <= floors; f++) {
          await query(
            `INSERT INTO project_locations (project_id, parent_id, location_type_id, code, name, name_en, name_ar, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [result.rows[0].project_id, result.rows[0].project_location_id, floorTypeId,
             `F-${String(f).padStart(2, '0')}`, `Floor ${f}`, `Floor ${f}`, `الطابق ${f}`, f]
          );
        }
      } else if (floors < floorLocs.length) {
        for (let f = floorLocs.length; f > floors; f--) {
          const loc = floorLocs[f - 1];
          const kids = await query('SELECT COUNT(*) AS c FROM project_locations WHERE parent_id = $1', [loc.id]);
          if (Number(kids.rows[0].c) === 0) {
            await query('DELETE FROM project_locations WHERE id = $1', [loc.id]);
          }
        }
      }
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/buildings/:id', authenticate, authorize(), async (req, res) => {
  try {
    const unitsSold = await query(`SELECT COUNT(*) as cnt FROM units WHERE building_id = $1 AND status NOT IN ('available', 'blocked')`, [req.params.id]);
    if (parseInt(unitsSold.rows[0].cnt) > 0) return res.status(400).json({ success: false, error: 'Cannot delete building with reserved/sold units' });
    const result = await query('DELETE FROM buildings WHERE id = $1 RETURNING code, project_location_id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Building not found' });
    // Phase 8: the building's location rows are real rows — remove them with
    // the building (floor children cascade from project_locations.parent_id).
    if (result.rows[0].project_location_id != null) {
      await query('DELETE FROM project_locations WHERE id = $1', [result.rows[0].project_location_id]);
    }
    res.json({ success: true, message: 'Building deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ UNITS ============

router.get('/buildings/:buildingId/units', authenticate, authorize(), async (req, res) => {
  try {
    const { status } = req.query;
    let conditions = ['building_id = $1']; let params = [req.params.buildingId]; let idx = 2;
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    const result = await query(`SELECT * FROM units WHERE ${conditions.join(' AND ')} ORDER BY floor_no, code`, params);
    res.json({ success: true, data: result.rows });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/buildings/:buildingId/units', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string().required(),
      type: Joi.string().valid(...UNIT_TYPES).default('apartment'),
      area: Joi.number().min(0).allow(null).optional(),
      bedrooms: Joi.number().integer().min(0).allow(null).optional(),
      bathrooms: Joi.number().integer().min(0).allow(null).optional(),
      floor_no: Joi.number().integer().allow(null).optional(),
      finishing_type: Joi.string().valid(...FINISHING_TYPES).default('semi_finished'),
      price: Joi.number().min(0).allow(null).optional(),
      view: Joi.string().allow('').optional(),
      facing: Joi.string().allow('').optional(),
      features: Joi.array().items(Joi.string()).default([]),
      delivery_date: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const pricePerM2 = value.price && value.area ? (value.price / value.area) : null;
    const result = await query(
      `INSERT INTO units (building_id, code, type, area, bedrooms, bathrooms, floor_no, finishing_type, price, price_per_m2, view, facing, features, delivery_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14) RETURNING *`,
      [req.params.buildingId, value.code, value.type, value.area, value.bedrooms, value.bathrooms,
       value.floor_no, value.finishing_type, value.price, pricePerM2, value.view, value.facing,
       JSON.stringify(value.features), value.delivery_date]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'Unit code already exists in this building' });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk-create: generate floors × units_per_floor units from a pattern (e.g. prefix "A" → A-101, A-102...)
router.post('/buildings/:buildingId/bulk-units', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      floors: Joi.number().integer().min(1).max(100).required(),
      units_per_floor: Joi.number().integer().min(1).max(50).required(),
      start_floor: Joi.number().integer().default(1),
      prefix: Joi.string().allow('').default(''),
      type: Joi.string().valid(...UNIT_TYPES).default('apartment'),
      area: Joi.number().min(0).allow(null).optional(),
      bedrooms: Joi.number().integer().min(0).allow(null).optional(),
      bathrooms: Joi.number().integer().min(0).allow(null).optional(),
      finishing_type: Joi.string().valid(...FINISHING_TYPES).default('semi_finished'),
      price: Joi.number().min(0).allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const building = await query('SELECT * FROM buildings WHERE id = $1', [req.params.buildingId]);
    if (building.rows.length === 0) return res.status(404).json({ success: false, error: 'Building not found' });

    const pricePerM2 = value.price && value.area ? (value.price / value.area) : null;
    const created = await transaction(async (client) => {
      const units = [];
      for (let f = 0; f < value.floors; f++) {
        const floorNo = value.start_floor + f;
        for (let u = 1; u <= value.units_per_floor; u++) {
          const code = `${value.prefix}${floorNo}${String(u).padStart(2, '0')}`;
          const result = await client.query(
            `INSERT INTO units (building_id, code, type, area, bedrooms, bathrooms, floor_no, finishing_type, price, price_per_m2)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [req.params.buildingId, code, value.type, value.area, value.bedrooms, value.bathrooms,
             floorNo, value.finishing_type, value.price, pricePerM2]
          );
          units.push(result.rows[0]);
        }
      }
      return units;
    });

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'create', module: 'sales', description: `Bulk-created ${created.length} units in building ${building.rows[0].code}`, entityId: req.params.buildingId, entityType: 'building' });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, error: 'Generated unit codes collide with existing units — adjust prefix or start floor' });
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/units/:id', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      code: Joi.string(),
      type: Joi.string().valid(...UNIT_TYPES),
      area: Joi.number().min(0).allow(null),
      bedrooms: Joi.number().integer().min(0).allow(null),
      bathrooms: Joi.number().integer().min(0).allow(null),
      floor_no: Joi.number().integer().allow(null),
      finishing_type: Joi.string().valid(...FINISHING_TYPES),
      price: Joi.number().min(0).allow(null),
      view: Joi.string().allow(''), facing: Joi.string().allow(''),
      features: Joi.array().items(Joi.string()),
      delivery_date: Joi.date().iso().allow(null),
      handover_date: Joi.date().iso().allow(null),
      commission_percent: Joi.number().min(0).max(100).allow(null),
    }).min(1);
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const sets = []; const params = []; let idx = 1;
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      if (k === 'features') { sets.push(`features = $${idx++}::jsonb`); params.push(JSON.stringify(v)); }
      else { sets.push(`${k} = $${idx++}`); params.push(v); }
    }
    params.push(req.params.id);
    const result = await query(`UPDATE units SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Unit not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Status transition: available → reserved → contracted → delivered → closed (+ block/release)
router.post('/units/:id/status', authenticate, authorize(), async (req, res) => {
  try {
    const schema = Joi.object({
      status: Joi.string().valid(...UNIT_STATUSES).required(),
      client_id: Joi.number().integer().allow(null).optional(),
      sold_amount: Joi.number().min(0).allow(null).optional(),
      commission_percent: Joi.number().min(0).max(100).allow(null).optional(),
      handover_date: Joi.date().iso().allow(null).optional(),
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ success: false, error: error.details[0].message });

    const existing = await query(
      `SELECT u.*, b.project_id, b.name as building_name
       FROM units u JOIN buildings b ON u.building_id = b.id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Unit not found' });

    const unit = existing.rows[0];
    const current = unit.status;
    if (!UNIT_TRANSITIONS[current] || !UNIT_TRANSITIONS[current].includes(value.status)) {
      return res.status(400).json({ success: false, error: `Cannot transition from '${current}' to '${value.status}'` });
    }

    // Validate client_id for reserved/contracted transitions
    if (['reserved', 'contracted'].includes(value.status) && !value.client_id && !unit.client_id) {
      return res.status(400).json({ success: false, error: 'client_id is required when reserving or contracting a unit' });
    }

    const sets = ['status = $1', 'updated_at = NOW()']; const params = [value.status]; let idx = 2;
    if (value.client_id) { sets.push(`client_id = $${idx++}`); params.push(value.client_id); }
    if (value.sold_amount !== undefined && value.sold_amount !== null) { sets.push(`sold_amount = $${idx++}`); params.push(value.sold_amount); }
    if (value.commission_percent !== undefined && value.commission_percent !== null) { sets.push(`commission_percent = $${idx++}`); params.push(value.commission_percent); }
    if (value.handover_date !== undefined && value.handover_date !== null) { sets.push(`handover_date = $${idx++}`); params.push(value.handover_date); }
    if (value.status === 'available') { sets.push('sold_amount = NULL'); sets.push('client_id = NULL'); }
    params.push(req.params.id);

    const result = await query(`UPDATE units SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);

    // Auto-create invoice when unit transitions to 'contracted'
    let invoice = null;
    const clientId = value.client_id || unit.client_id;
    if (value.status === 'contracted' && clientId) {
      invoice = await createUnitSaleInvoice({
        unit: result.rows[0],
        building: { project_id: unit.project_id, name: unit.building_name },
        clientId,
        userId: req.user.id,
        userName: req.user.name,
        userRole: req.user.role
      });
    }

    await logActivity({ userId: req.user.id, userName: req.user.name, userRole: req.user.role, action: 'update', module: 'sales', description: `Unit ${unit.code} → ${value.status}`, entityId: req.params.id, entityType: 'unit' });
    res.json({
      success: true,
      data: { ...result.rows[0], auto_invoice: invoice }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.delete('/units/:id', authenticate, authorize(), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM units WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Unit not found' });
    if (!['available', 'blocked'].includes(existing.rows[0].status)) {
      return res.status(400).json({ success: false, error: 'Cannot delete a reserved/sold unit' });
    }
    await query('DELETE FROM units WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Unit deleted' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============ SALES SUMMARY ============

router.get('/summary', authenticate, authorize(), async (req, res) => {
  try {
    const { project_id } = req.query;
    let where = ''; let params = [];
    if (project_id) { where = 'WHERE b.project_id = $1'; params.push(project_id); }

    const result = await query(
      `SELECT u.status, COUNT(*) as count,
              COALESCE(SUM(u.price), 0) as total_list_price,
              COALESCE(SUM(u.sold_amount), 0) as total_sold_amount
       FROM units u JOIN buildings b ON u.building_id = b.id
       ${where} GROUP BY u.status`,
      params
    );

    const byStatus = {};
    let totalUnits = 0; let totalSold = 0; let totalListPrice = 0;
    for (const row of result.rows) {
      byStatus[row.status] = {
        count: parseInt(row.count),
        total_list_price: parseFloat(row.total_list_price),
        total_sold_amount: parseFloat(row.total_sold_amount),
      };
      totalUnits += parseInt(row.count);
      totalListPrice += parseFloat(row.total_list_price);
      if (['contracted', 'delivered', 'closed'].includes(row.status)) totalSold += parseFloat(row.total_sold_amount);
    }

    let clientBreakdown = [];
    if (project_id) {
      const clientsResult = await query(
        `SELECT c.id as client_id, c.name_en as client_name, c.name_ar,
                COUNT(u.id) as units_count,
                COALESCE(SUM(u.sold_amount), 0) as total_contracted,
                COALESCE(SUM(i.amount), 0) as total_invoiced,
                COALESCE(SUM(pm.amount), 0) as total_paid
         FROM units u
         JOIN buildings b ON u.building_id = b.id
         LEFT JOIN clients c ON u.client_id = c.id
         LEFT JOIN invoices i ON i.description LIKE '%' || u.code || '%' AND i.project_id = b.project_id
         LEFT JOIN payments pm ON pm.invoice_id = i.id
         WHERE b.project_id = $1 AND u.client_id IS NOT NULL
         GROUP BY c.id, c.name_en, c.name_ar
         ORDER BY total_contracted DESC`,
        [project_id]
      );
      clientBreakdown = clientsResult.rows;
    }

    res.json({
      success: true,
      data: {
        by_status: byStatus,
        total_units: totalUnits,
        total_list_price: totalListPrice,
        total_sold_amount: totalSold,
        client_breakdown: clientBreakdown
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
