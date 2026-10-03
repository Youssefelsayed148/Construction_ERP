// Phase 11 tests — reorder points, projected inventory, gated auto-purchasing.
//
// Coverage:
//   - migration: purchase_requests / purchase_orders / replenishment_alerts;
//     storage capacity; the alert_only default policy seed (fail-safe);
//     NO second reorder-level column was introduced (static check)
//   - formulas: Lead-Time Demand, Reorder Point, Projected Available,
//     Shortage, suggested order quantity (max stock / MOQ / order multiple /
//     shelf life / storage capacity clamps)
//   - policy resolution precedence: material > category > default
//   - acceptance: a future floor activity with insufficient current+incoming
//     stock creates EXACTLY ONE draft PR when the sweep runs twice (no
//     duplicates); an auto-issue-PO material priced above the authority
//     ceiling produces a draft PO awaiting approval, never an issued one;
//     an unconfigured material stays alert-only
//   - alerts: projected shortage + below minimum raised once, resolved when
//     the condition clears; routed through the Phase 7 notification engine

const { MockDb } = require('../test-helpers/mock-db');
const migration = require('../replenishment-migration');
const replenishment = require('../../services/replenishment');

const db = new MockDb();
const q = (sql, params) => db.query(sql, params);

const NOW = new Date('2026-09-18T10:00:00Z');
const MAT = 50;        // auto_draft_pr, future scheduled demand
const MAT_CEIL = 51;   // auto_issue_po above the authority ceiling
const MAT_OK = 52;     // auto_issue_po below the ceiling
const MAT_DEFAULT = 53; // unconfigured → alert only
const MAT_CATEGORY = 54; // category-level policy only
const WH = 1;

function futureDate(days) {
  return new Date(NOW.getTime() + days * 86400000).toISOString().slice(0, 10);
}

async function count(table, where = '') {
  return (await q(`SELECT * FROM ${table}${where}`)).rows.length;
}

// The purchase order whose line carries the material (lines are authoritative, 2.6c).
async function orderFor(materialId) {
  const line = (await q('SELECT * FROM purchase_order_lines WHERE material_id = $1', [materialId])).rows[0];
  return line ? (await q('SELECT * FROM purchase_orders WHERE id = $1', [line.purchase_order_id])).rows[0] : undefined;
}

async function insertMaterial(id, category) {
  await q(`INSERT INTO item_master
      (id, code, category, unit, is_active, min_stock, max_stock, safety_stock,
       supplier_lead_time_days, moq, order_multiple, shelf_life_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, `MAT-${id}`, category, 'bag', true, 20, 200, 10, 10, 5, 5, 90]);
  await q(`INSERT INTO supplier_materials (supplier_id, material_id, unit_price, lead_time_days)
           VALUES ($1,$2,$3,$4)`, [9, id, 100, 10]);
}

async function insertStockRow(id, quantity, reorderLevel) {
  await q(`INSERT INTO warehouse_stock (id, warehouse_id, item_id, quantity, reorder_level,
           reserved_quantity, quarantined_quantity, available_quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, WH, id, quantity, reorderLevel, 0, 0, quantity]);
}

async function buildFixture() {
  await q(`CREATE TABLE IF NOT EXISTS item_master (
    id SERIAL PRIMARY KEY, code VARCHAR(50), category VARCHAR(100), unit VARCHAR(50),
    is_active BOOLEAN DEFAULT true, min_stock DECIMAL(15,3), max_stock DECIMAL(15,3),
    safety_stock DECIMAL(15,3), supplier_lead_time_days INTEGER,
    reorder_policy VARCHAR(30), order_multiple DECIMAL(15,3), moq DECIMAL(15,3),
    shelf_life_days INTEGER, preferred_supplier_ids JSONB)`);
  await q(`CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY, name VARCHAR(255), type VARCHAR(50), project_id INTEGER)`);
  await q(`CREATE TABLE IF NOT EXISTS warehouse_stock (
    id SERIAL PRIMARY KEY, warehouse_id INTEGER, item_id INTEGER,
    quantity DECIMAL(15,3) DEFAULT 0, reorder_level DECIMAL(15,3) DEFAULT 0,
    reserved_quantity DECIMAL(15,3) DEFAULT 0, quarantined_quantity DECIMAL(15,3) DEFAULT 0,
    available_quantity DECIMAL(15,3) DEFAULT 0,
    UNIQUE(warehouse_id, item_id))`);
  await q(`CREATE TABLE IF NOT EXISTS business_rules (
    id SERIAL PRIMARY KEY, rule_key VARCHAR(100) UNIQUE NOT NULL,
    rule_value JSONB NOT NULL DEFAULT '{}', description TEXT,
    is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS stock_movements (
    id SERIAL PRIMARY KEY, warehouse_id INTEGER, material_id INTEGER,
    movement_type VARCHAR(30), quantity DECIMAL(15,3), reference_type VARCHAR(50),
    reference_id INTEGER, notes TEXT, created_by INTEGER, created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY, code VARCHAR(50), name_en VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS supplier_materials (
    id SERIAL PRIMARY KEY, supplier_id INTEGER, material_id INTEGER,
    unit_price DECIMAL(15,2), lead_time_days INTEGER,
    UNIQUE(supplier_id, material_id))`);
  await q(`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name VARCHAR(255))`);
  await q(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name VARCHAR(255), email VARCHAR(255), role VARCHAR(100), is_active BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY, user_id INTEGER, channel VARCHAR(30), event_type VARCHAR(255),
    entity_type VARCHAR(100), entity_id INTEGER, action_item_id INTEGER,
    title VARCHAR(500), body TEXT, status VARCHAR(30), created_at TIMESTAMPTZ)`);
  await q(`CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY, user_id INTEGER, event_type VARCHAR(255),
    channel VARCHAR(30), enabled BOOLEAN)`);
  await q(`CREATE TABLE IF NOT EXISTS material_requirements (
    id SERIAL PRIMARY KEY, project_id INTEGER, project_location_id INTEGER,
    boq_item_id INTEGER, work_package_id INTEGER, recipe_id INTEGER, recipe_line_id INTEGER,
    material_id INTEGER, unit VARCHAR(50), gross_requirement DECIMAL(18,4),
    wastage_pct DECIMAL(5,3), already_consumed DECIMAL(18,4), net_requirement DECIMAL(18,4),
    source_type VARCHAR(50), source_id INTEGER, source_activity_date DATE, status VARCHAR(30))`);

  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [1, 'Buyer', 'buyer@x.com', 'purchasing_mgr', true]);
  await q('INSERT INTO users (id, name, email, role, is_active) VALUES ($1,$2,$3,$4,$5)', [2, 'Owner', 'owner@x.com', 'owner', true]);
  await q('INSERT INTO suppliers (id, code, name_en) VALUES ($1,$2,$3)', [9, 'SUP-1', 'Supplier One']);
  await q('INSERT INTO projects (id, name) VALUES ($1, $2)', [1, 'Tower A']);

  // MAT: available 20, stored reorder_level 15 (above the point — the
  // shortage comes from scheduled demand, not the reorder trigger).
  await insertMaterial(MAT, 'cement');
  await insertStockRow(MAT, 20, 15);
  // Ceiling materials: at/below their reorder point, no scheduled demand.
  await insertMaterial(MAT_CEIL, 'cement');
  await insertStockRow(MAT_CEIL, 10, 15);
  await insertMaterial(MAT_OK, 'cement');
  await insertStockRow(MAT_OK, 10, 15);
  // Unconfigured: no policy row anywhere → alert only.
  await insertMaterial(MAT_DEFAULT, 'cement');
  await insertStockRow(MAT_DEFAULT, 10, 15);
}

beforeAll(async () => {
  await buildFixture();
  await migration.ensureTables(q);
  await migration.seedDefaultPolicy(q);

  // Policies (top-level so every later describe sees one consistent state).
  await q(`INSERT INTO business_rules (rule_key, rule_value) VALUES ($1,$2)`,
    ['replenishment_policy:material:50', JSON.stringify({ mode: 'auto_draft_pr' })]);
  await q(`INSERT INTO business_rules (rule_key, rule_value) VALUES ($1,$2)`,
    ['replenishment_policy:material:51', JSON.stringify({ mode: 'auto_issue_po', authority_ceiling: 2000 })]);
  await q(`INSERT INTO business_rules (rule_key, rule_value) VALUES ($1,$2)`,
    ['replenishment_policy:material:52', JSON.stringify({ mode: 'auto_issue_po', authority_ceiling: 50000 })]);
  await q(`INSERT INTO business_rules (rule_key, rule_value) VALUES ($1,$2)`,
    ['replenishment_policy:category:steel', JSON.stringify({ mode: 'auto_draft_po' })]);
  await insertMaterial(MAT_CATEGORY, 'steel');
  await insertStockRow(MAT_CATEGORY, 10, 15);

  // The future floor activity: 50 units of MAT scheduled in 7 days; only 20
  // on hand, nothing incoming (Phase 9 requirement row = scheduled demand).
  await q(`INSERT INTO material_requirements
      (project_id, project_location_id, boq_item_id, material_id, unit,
       gross_requirement, wastage_pct, already_consumed, net_requirement,
       source_type, source_id, source_activity_date, status)
     VALUES (1, NULL, NULL, $1, 'bag', 50, 0, 0, 50, 'location_allocation', 900, $2, 'planned')`,
    [MAT, futureDate(7)]);
});

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

describe('migration', () => {
  test('creates the procurement + alert tables and storage capacity', () => {
    expect(db.table('purchase_requests').columns.has('source_key')).toBe(true);
    expect(db.table('purchase_orders').columns.has('issuance_basis')).toBe(true);
    expect(db.table('purchase_orders').columns.has('authority_ceiling')).toBe(true);
    expect(db.table('replenishment_alerts').columns.has('alert_type')).toBe(true);
    expect(db.table('warehouses').columns.has('storage_capacity')).toBe(true);
  });

  test('seeds the alert_only default policy (fail-safe) and is idempotent', async () => {
    const row = (await q("SELECT * FROM business_rules WHERE rule_key = 'replenishment_policy:default'")).rows[0];
    const value = typeof row.rule_value === 'string' ? JSON.parse(row.rule_value) : row.rule_value;
    expect(value.mode).toBe('alert_only');
    expect(await migration.seedDefaultPolicy(q)).toBe(false);
  });

  test('NO parallel reorder-level column was introduced (built on the existing one)', () => {
    const stock = [...db.table('warehouse_stock').columns.keys()];
    expect(stock.filter((c) => c.includes('reorder')).sort()).toEqual(['reorder_level']);
  });
});

// ---------------------------------------------------------------------------
// Formulas (pure)
// ---------------------------------------------------------------------------

describe('replenishment formulas', () => {
  test('confirmed incoming is the undelivered part of each open PO line (header-only orders were backfilled to lines by 0014)', async () => {
    const fakeQuery = async (sql) => {
      if (sql.includes('FROM purchase_order_lines')) return { rows: [
        { quantity: 10, delivered_quantity: 2 },
        { quantity: 5, delivered_quantity: 1 },
      ] };
      return { rows: [] };
    };
    expect(await replenishment.openConfirmedQuantity(fakeQuery, 50)).toBe(12);
  });
  test('Lead-Time Demand = forecast daily usage × supplier lead-time days', () => {
    expect(replenishment.leadTimeDemand(12, 10)).toBe(120);
    expect(replenishment.leadTimeDemand(0, 10)).toBe(0);
  });

  test('Reorder Point = Lead-Time Demand + Safety Stock', () => {
    expect(replenishment.reorderPoint(12, 10, 30)).toBe(150);
    expect(replenishment.reorderPoint(5, 0, 25)).toBe(25);
  });

  test('Projected Available = Available + Confirmed Incoming − Scheduled Demand', () => {
    expect(replenishment.projectedAvailable(100, 40, 60)).toBe(80);
    expect(replenishment.projectedAvailable(10, 0, 50)).toBe(-40);
  });

  test('Shortage = max(Net Requirement − Available − Confirmed Incoming, 0)', () => {
    expect(replenishment.shortage(50, 20, 5)).toBe(25);
    expect(replenishment.shortage(50, 60, 5)).toBe(0);
  });

  test('suggested quantity respects max stock, MOQ, order multiple, shelf life, capacity', () => {
    // Target 200 − available 10 = 190; multiple 5 keeps 190.
    expect(replenishment.suggestedOrderQuantity({
      available: 10, confirmedIncoming: 0, scheduledDemand: 0, targetMaxStock: 200,
    })).toBe(190);

    // Order multiple rounds up.
    expect(replenishment.suggestedOrderQuantity({
      available: 0, confirmedIncoming: 0, scheduledDemand: 0,
      targetMaxStock: 43, orderMultiple: 5,
    })).toBe(45);

    // Shelf-life clamp: usage 2/day × 90-day shelf life → 180 max.
    expect(replenishment.suggestedOrderQuantity({
      available: 0, confirmedIncoming: 0, scheduledDemand: 0,
      targetMaxStock: 1000, shelfLifeDays: 90, forecastDailyUsage: 2,
    })).toBe(180);

    // Storage-capacity clamp.
    expect(replenishment.suggestedOrderQuantity({
      available: 0, confirmedIncoming: 0, scheduledDemand: 0,
      targetMaxStock: 200, storageHeadroom: 120,
    })).toBe(120);

    // MOQ / rounding must never push an order past shelf-life or storage caps.
    expect(replenishment.suggestedOrderQuantity({
      targetMaxStock: 200, storageHeadroom: 12, moq: 20, orderMultiple: 10,
    })).toBe(0);
    expect(replenishment.suggestedOrderQuantity({
      targetMaxStock: 43, storageHeadroom: 43, orderMultiple: 5,
    })).toBe(40);

    // MOQ floors a small need.
    expect(replenishment.roundToOrderRules(3, 10, 0)).toBe(10);

    // No need → no order.
    expect(replenishment.suggestedOrderQuantity({ available: 150, targetMaxStock: 100 })).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Policy resolution precedence
// ---------------------------------------------------------------------------

describe('policy resolution (business_rules)', () => {
  test('material policy beats category policy beats the alert_only default', async () => {
    const material = (await q('SELECT * FROM item_master WHERE id = $1', [MAT])).rows[0];
    expect((await replenishment.getPolicy(q, material)).mode).toBe('auto_draft_pr');

    const byCategory = (await q('SELECT * FROM item_master WHERE id = $1', [MAT_CATEGORY])).rows[0];
    expect((await replenishment.getPolicy(q, byCategory)).mode).toBe('auto_draft_po');
    expect((await replenishment.getPolicy(q, byCategory)).policy_key).toBe('replenishment_policy:category:steel');

    const unconfigured = (await q('SELECT * FROM item_master WHERE id = $1', [MAT_DEFAULT])).rows[0];
    const p = await replenishment.getPolicy(q, unconfigured);
    expect(p.mode).toBe('alert_only');
    expect(p.policy_key).toBe('replenishment_policy:default');
  });
});

// ---------------------------------------------------------------------------
// Acceptance — the two specified scenarios
// ---------------------------------------------------------------------------

describe('sweep idempotency (acceptance)', () => {
  test('a future activity with insufficient current+incoming stock creates exactly ONE draft PR across two consecutive runs', async () => {
    const first = await replenishment.runReplenishmentSweep(q, { now: NOW, notify: false });
    const second = await replenishment.runReplenishmentSweep(q, { now: NOW, notify: false });

    const drafts = (await q("SELECT * FROM purchase_requests WHERE source_key = $1 AND status = 'draft'", [`replenishment:${MAT}`])).rows;
    expect(drafts.length).toBe(1);
    expect(drafts[0].source_key).toBe('replenishment:50');
    expect(drafts[0].status).toBe('draft');
    // Need 30 (demand 50 − available 20), rounded up to the order multiple 5.
    expect(parseFloat(drafts[0].quantity)).toBe(30);

    const firstRun = first.results.find((r) => r.material_id === MAT);
    const secondRun = second.results.find((r) => r.material_id === MAT);
    expect(firstRun.actions.purchase_request.created).toBe(true);
    expect(secondRun.actions.purchase_request.created).toBe(false); // idempotent
    expect(secondRun.shortage).toBe(30);

    // The shortage alert exists exactly once.
    const alerts = (await q(
      "SELECT * FROM replenishment_alerts WHERE material_id = $1 AND alert_type = 'projected_shortage'", [MAT]
    )).rows;
    expect(alerts.length).toBe(1);
  });

  test('an unconfigured material is alert-only — never silently escalated', async () => {
    const r = await replenishment.runReplenishmentSweep(q, { now: NOW, notify: false });
    const result = r.results.find((x) => x.material_id === MAT_DEFAULT);
    expect(result.mode).toBe('alert_only');
    expect(result.actions.purchase_request).toBe(null);
    expect(result.actions.purchase_order).toBe(null);
    expect(await count('purchase_request_lines', ' WHERE material_id = 53')).toBe(0);
    expect(await count('purchase_order_lines', ' WHERE material_id = 53')).toBe(0);
  });
});

describe('authority-ceiling gate (acceptance)', () => {
  test('a material priced above the authority ceiling produces a draft PO awaiting approval, not an issued one', async () => {
    await replenishment.runReplenishmentSweep(q, { now: NOW, notify: false });
    const po = await orderFor(MAT_CEIL);
    expect(po).toBeTruthy();
    expect(po.status).toBe('draft');
    expect(po.issuance_basis).toBe('awaiting_approval');
    // 190 bags × 100 = 19,000 ≥ the 2,000 ceiling → must not issue.
    expect(parseFloat(po.total_amount)).toBeGreaterThanOrEqual(parseFloat(po.authority_ceiling));
  });

  test('strictly below the ceiling with a pre-approved supplier → the PO issues', async () => {
    await replenishment.runReplenishmentSweep(q, { now: NOW, notify: false });
    const po = await orderFor(MAT_OK);
    expect(po.status).toBe('issued');
    expect(po.issuance_basis).toBe('authority_ceiling');
    expect(parseFloat(po.total_amount)).toBeLessThan(parseFloat(po.authority_ceiling));
  });

  test('the sweep never stacks a second PO on the same material', async () => {
    await replenishment.runReplenishmentSweep(q, { now: NOW, notify: false });
    expect(await count('purchase_order_lines', ' WHERE material_id = 52')).toBe(1);
    expect(await count('purchase_order_lines', ' WHERE material_id = 51')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Alerts routed through the Phase 7 notification engine
// ---------------------------------------------------------------------------

describe('alert fan-out', () => {
  test('projected shortage notifies purchasing + owner via the notification engine', async () => {
    // Reset the already-open shortage alert so this sweep raises it fresh
    // and the fan-out actually fires.
    await q("UPDATE replenishment_alerts SET status = 'resolved', resolved_at = $1 WHERE alert_type = 'projected_shortage'", [NOW]);
    await replenishment.runReplenishmentSweep(q, { now: NOW, notify: true });
    const notes = (await q("SELECT * FROM notifications WHERE event_type = 'replenishment.projected_shortage'")).rows;
    expect(notes.length).toBe(2); // purchasing_mgr + owner, in_app channel
    expect(notes.every((n) => n.channel === 'in_app')).toBe(true);
    expect(notes.map((n) => n.user_id).sort()).toEqual([1, 2]);
  });

  test('clearing the condition resolves the open alerts (no accumulation)', async () => {
    await q('UPDATE warehouse_stock SET quantity = 500, available_quantity = 500 WHERE item_id = $1', [MAT]);
    await replenishment.runReplenishmentSweep(q, { now: NOW, notify: false });
    const open = (await q(
      "SELECT * FROM replenishment_alerts WHERE material_id = $1 AND status = 'open'", [MAT]
    )).rows.filter((a) => a.alert_type === 'projected_shortage' || a.alert_type === 'below_minimum');
    expect(open.length).toBe(0);
  });
});
