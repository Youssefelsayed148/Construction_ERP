// Phase 11 — reorder points, projected inventory, gated auto-purchasing.
//
// Built ON TOP of the existing alert, not a blank slate:
//   * the reorder signal is warehouse_stock.reorder_level (migrate-2.2.js),
//     the same column dashboard.js's low-stock alert uses — no parallel
//     reorder column was added;
//   * the policy store is business_rules (setupDb.js), rows keyed
//     'replenishment_policy:material:<id>' > 'replenishment_policy:category:<cat>'
//     > 'replenishment_policy:default' (seeded alert_only — the fail-safe);
//   * Phase 9 item_master planning fields feed the math (safety_stock,
//     supplier_lead_time_days, moq, order_multiple, shelf_life_days, max_stock)
//     and Phase 9 material_requirements rows are the scheduled demand;
//   * alerts fan out through the Phase 7 notification engine.
//
// Formulas (implemented exactly, nothing invented):
//   Lead-Time Demand       = forecast daily usage × supplier lead-time days
//   Reorder Point          = Lead-Time Demand + Safety Stock
//   Projected Available(d) = Available + Confirmed Incoming(d) − Scheduled Demand(d)
//   Shortage               = max(Net Requirement − Available − Confirmed Incoming, 0)
//
// Modes: alert_only | auto_draft_pr | auto_draft_po | auto_issue_po.
// auto_issue_po issues ONLY when the order total is STRICTLY below the
// configured authority ceiling AND the supplier is pre-approved (framework
// price present); otherwise it degrades to a draft PO awaiting approval —
// never a silent escalation.

'use strict';

const { query: defaultQuery } = require('../config/database');
const numbering = require('./numbering');
const notificationService = require('./notificationService');

const MODES = ['alert_only', 'auto_draft_pr', 'auto_draft_po', 'auto_issue_po'];
const DEFAULT_MODE = 'alert_only';
const OPEN_PO_STATUSES = ['approved', 'issued', 'confirmed'];
const ALERT_ROLES = ['purchasing_mgr', 'owner'];
const USAGE_LOOKBACK_DAYS = 90;
const SCHEDULED_HORIZON_DAYS = 90;
const WASTAGE_ALERT_THRESHOLD = 0.10; // waste+damage > 10% of issued volume

const DAY_MS = 86400000;

function toNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function round3(n) {
  return Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000;
}

function parseJson(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return {}; }
}

// ---------------------------------------------------------------------------
// Formulas (pure)
// ---------------------------------------------------------------------------

function leadTimeDemand(forecastDailyUsage, leadTimeDays) {
  return round3(toNum(forecastDailyUsage) * toNum(leadTimeDays));
}

function reorderPoint(forecastDailyUsage, leadTimeDays, safetyStock) {
  return round3(leadTimeDemand(forecastDailyUsage, leadTimeDays) + toNum(safetyStock));
}

function projectedAvailable(available, confirmedIncoming, scheduledDemand) {
  return round3(toNum(available) + toNum(confirmedIncoming) - toNum(scheduledDemand));
}

function shortage(netRequirement, available, confirmedIncoming) {
  return round3(Math.max(toNum(netRequirement) - toNum(available) - toNum(confirmedIncoming), 0));
}

// Any order quantity (target-driven or shortage-driven) respects the MOQ and
// order-multiple rules: rounded UP to the multiple, floored at the MOQ.
function roundToOrderRules(quantity, moq, orderMultiple) {
  let qty = toNum(quantity);
  if (qty <= 0) return 0;
  const mult = toNum(orderMultiple);
  if (mult > 0) qty = Math.ceil(qty / mult) * mult;
  const minimum = toNum(moq);
  if (minimum > 0 && qty < minimum) qty = minimum;
  return round3(qty);
}

// Suggested order quantity — clamped by target max stock (net of the
// projected position), shelf life, storage capacity, then rounded up to the
// order multiple and floored at the MOQ.
function suggestedOrderQuantity({
  available = 0, confirmedIncoming = 0, scheduledDemand = 0,
  targetMaxStock = 0, moq = 0, orderMultiple = 0,
  shelfLifeDays = 0, forecastDailyUsage = 0, storageHeadroom = null,
}) {
  const projected = Math.max(projectedAvailable(available, confirmedIncoming, scheduledDemand), 0);
  let raw = Math.max(round3(toNum(targetMaxStock) - projected), 0);
  let hardCap = Infinity;

  const shelf = toNum(shelfLifeDays);
  const usage = toNum(forecastDailyUsage);
  if (shelf > 0 && usage > 0) {
    hardCap = Math.min(hardCap, round3(usage * shelf)); // cannot order more than is consumable before expiry
  }
  if (storageHeadroom != null) {
    hardCap = Math.min(hardCap, Math.max(toNum(storageHeadroom), 0)); // cannot exceed storage capacity
  }
  raw = Math.min(raw, hardCap);

  const mult = toNum(orderMultiple);
  const minimum = toNum(moq);
  if (minimum > hardCap) return 0; // an MOQ that breaches shelf/storage limits requires manual intervention
  if (mult > 0 && raw > 0) {
    const roundedUp = Math.ceil(raw / mult) * mult;
    raw = roundedUp <= hardCap ? roundedUp : Math.floor(hardCap / mult) * mult;
  }
  if (minimum > 0 && raw > 0 && raw < minimum) raw = minimum;
  raw = Math.min(raw, hardCap);
  return round3(raw);
}

// ---------------------------------------------------------------------------
// Policy resolution — business_rules is the store
// ---------------------------------------------------------------------------

async function getPolicy(q, item) {
  const keys = [
    `replenishment_policy:material:${item.id}`,
    `replenishment_policy:category:${item.category}`,
    'replenishment_policy:default',
  ];
  for (const key of keys) {
    const r = (await q('SELECT rule_value FROM business_rules WHERE rule_key = $1', [key])).rows[0];
    if (!r) continue;
    const value = parseJson(r.rule_value);
    if (!value || value.enabled === false) continue;
    return {
      ...value,
      mode: MODES.includes(value.mode) ? value.mode : DEFAULT_MODE,
      policy_key: key,
    };
  }
  return { mode: DEFAULT_MODE, policy_key: 'replenishment_policy:default' };
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

// Forecast daily usage: ledgered issues over the lookback window. If history
// is shorter than the window, the rate is taken over the observed span.
async function forecastDailyUsage(q, materialId, { now = new Date(), days = USAGE_LOOKBACK_DAYS } = {}) {
  const movements = (await q(
    "SELECT * FROM stock_movements WHERE material_id = $1 AND movement_type = 'issue'",
    [materialId]
  )).rows;
  const nowMs = new Date(now).getTime();
  const cutoff = nowMs - toNum(days) * DAY_MS;
  let total = 0;
  let earliest = null;
  for (const m of movements) {
    const t = m.created_at ? new Date(m.created_at).getTime() : nowMs;
    if (t < cutoff || t > nowMs) continue;
    total += toNum(m.quantity);
    if (earliest == null || t < earliest) earliest = t;
  }
  if (total === 0) return 0;
  const observedDays = Math.max((nowMs - earliest) / DAY_MS, 1);
  const spanDays = Math.min(toNum(days), observedDays);
  return round3(total / Math.max(spanDays, 1));
}

// Open confirmed POs = committed, not-yet-received incoming quantity.
async function openConfirmedQuantity(q, materialId) {
  const orders = (await q(
    `SELECT * FROM purchase_orders WHERE material_id = $1 AND status IN ('approved','issued','confirmed','partially_delivered')`,
    [materialId]
  )).rows;
  let headerOnly = orders;
  let lineTotal = 0;
  try {
    const openOrders = (await q("SELECT * FROM purchase_orders WHERE status IN ('approved','issued','confirmed','partially_delivered')")).rows;
    const openIds = new Set(openOrders.map((po) => po.id));
    const lines = (await q('SELECT * FROM purchase_order_lines WHERE material_id = $1', [materialId])).rows;
    const ordersWithLines = new Set(lines.map((line) => line.purchase_order_id));
    headerOnly = orders.filter((po) => !ordersWithLines.has(po.id));
    lineTotal = lines.filter((line) => openIds.has(line.purchase_order_id))
      .reduce((s, line) => s + Math.max(toNum(line.quantity) - toNum(line.delivered_quantity), 0), 0);
  } catch (e) { /* Phase 11 database before line tables: header total above is authoritative. */ }
  return round3(headerOnly.reduce((s, r) => s + Math.max(toNum(r.quantity) - toNum(r.delivered_quantity), 0), 0) + lineTotal);
}

// Scheduled demand = future planned material_requirements rows (Phase 9).
async function scheduledDemand(q, materialId, { now = new Date() } = {}) {
  const rows = (await q(
    "SELECT * FROM material_requirements WHERE material_id = $1 AND status = 'planned'",
    [materialId]
  )).rows;
  const nowMs = new Date(now).getTime();
  let total = 0;
  let earliest = null;
  for (const r of rows) {
    if (r.source_activity_date == null) continue;
    const d = new Date(r.source_activity_date).getTime();
    if (Number.isNaN(d)) continue;
    if (d < nowMs - DAY_MS || d > nowMs + SCHEDULED_HORIZON_DAYS * DAY_MS) continue;
    total += toNum(r.net_requirement);
    if (earliest == null || d < earliest) earliest = d;
  }
  return {
    total: round3(total),
    earliest_date: earliest != null ? new Date(earliest).toISOString().slice(0, 10) : null,
  };
}

// Available now across all warehouses (from the Phase 10 projection).
async function availableNow(q, materialId) {
  const rows = (await q('SELECT * FROM warehouse_stock WHERE item_id = $1', [materialId])).rows;
  let available = 0;
  let physical = 0;
  let storedReorderLevel = 0;
  for (const r of rows) {
    const a = r.available_quantity != null ? toNum(r.available_quantity) : toNum(r.quantity);
    available += a;
    physical += toNum(r.quantity);
    storedReorderLevel = Math.max(storedReorderLevel, toNum(r.reorder_level));
  }
  return {
    available: round3(available),
    physical: round3(physical),
    stored_reorder_level: storedReorderLevel,
    stock_by_warehouse: rows,
  };
}

// Storage headroom for the material across its warehouses.
async function storageHeadroomFor(q, stockRows) {
  let headroom = null;
  for (const r of stockRows) {
    const wh = (await q('SELECT storage_capacity FROM warehouses WHERE id = $1', [r.warehouse_id])).rows[0];
    if (!wh || wh.storage_capacity == null) continue;
    const h = toNum(wh.storage_capacity) - toNum(r.quantity);
    headroom = headroom == null ? h : Math.max(headroom, h);
  }
  return headroom;
}

// Preferred supplier + framework price (supplier_materials, migrate-12).
async function resolveSupplier(q, item, policy) {
  const candidates = [];
  if (policy.preferred_supplier_id != null) candidates.push(policy.preferred_supplier_id);
  const preferred = parseJson(item.preferred_supplier_ids);
  if (Array.isArray(preferred)) candidates.push(...preferred.filter((x) => x != null));
  for (const supplierId of candidates) {
    const link = (await q(
      'SELECT * FROM supplier_materials WHERE supplier_id = $1 AND material_id = $2',
      [supplierId, item.id]
    )).rows[0];
    if (link) return { supplier_id: supplierId, unit_price: toNum(link.unit_price), lead_time_days: link.lead_time_days };
  }
  const links = (await q('SELECT * FROM supplier_materials WHERE material_id = $1', [item.id])).rows
    .filter((r) => r.unit_price != null)
    .sort((a, b) => toNum(a.unit_price) - toNum(b.unit_price));
  if (links[0]) {
    return { supplier_id: links[0].supplier_id, unit_price: toNum(links[0].unit_price), lead_time_days: links[0].lead_time_days };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Document creation (idempotent — one open draft per material per source key)
// ---------------------------------------------------------------------------

async function ensureDraftPurchaseRequest(q, { item, quantity, neededBy, mode, createdBy = null }) {
  const sourceKey = `replenishment:${item.id}`;
  const existing = (await q(
    "SELECT * FROM purchase_requests WHERE material_id = $1 AND status = 'draft' AND source_key = $2",
    [item.id, sourceKey]
  )).rows[0];
  if (existing) return { created: false, request: existing };

  const requestNumber = await numbering.nextNumber(q, { table: 'purchase_requests', column: 'request_number', prefix: 'PR', pad: 5 });
  const r = await q(
    `INSERT INTO purchase_requests
       (request_number, material_id, quantity, unit, needed_by, status, source_type, source_id, source_key, policy_mode, created_by)
     VALUES ($1, $2, $3, $4, $5, 'draft', 'replenishment', $6, $7, $8, $9) RETURNING *`,
    [requestNumber, item.id, quantity, item.unit || null, neededBy || null, item.id, sourceKey, mode, createdBy]
  );
  try {
    await q(
      `INSERT INTO purchase_request_lines
         (purchase_request_id, material_id, description, quantity, unit, needed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.rows[0].id, item.id, item.name_en || item.name_ar || item.code, quantity, item.unit || null, neededBy || null]
    );
  } catch (e) {
    if (!/purchase_request_lines/.test(e.message)) throw e;
  }
  return { created: true, request: r.rows[0] };
}

async function ensurePurchaseOrder(q, { item, supplier, quantity, unitPrice, status, basis, ceiling = null, neededBy = null, createdBy = null }) {
  const sourceKey = `replenishment:${item.id}`;
  // One open PO per material — a second sweep must never stack orders.
  const existing = (await q(
    "SELECT * FROM purchase_orders WHERE material_id = $1 AND status IN ('draft','issued','approved')",
    [item.id]
  )).rows[0];
  if (existing) return { created: false, order: existing };

  const orderNumber = await numbering.nextNumber(q, { table: 'purchase_orders', column: 'order_number', prefix: 'PO', pad: 5 });
  const r = await q(
    `INSERT INTO purchase_orders
       (order_number, supplier_id, material_id, quantity, unit, unit_price, total_amount,
        status, issuance_basis, authority_ceiling, needed_by, source_type, source_id, source_key, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
    [orderNumber, supplier ? supplier.supplier_id : null, item.id, quantity, item.unit || null,
     unitPrice, round3(toNum(quantity) * toNum(unitPrice)), status, basis, ceiling, neededBy,
     'replenishment', item.id, sourceKey, createdBy]
  );
  try {
    await q(
      `INSERT INTO purchase_order_lines
         (purchase_order_id, material_id, description, quantity, unit, unit_rate, needed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [r.rows[0].id, item.id, item.name_en || item.name_ar || item.code, quantity,
       item.unit || null, unitPrice || 0, neededBy]
    );
  } catch (e) {
    if (!/purchase_order_lines/.test(e.message)) throw e;
  }
  return { created: true, order: r.rows[0] };
}

// ---------------------------------------------------------------------------
// Alerts — one open alert per (material, type); notifications via Phase 7
// ---------------------------------------------------------------------------

async function raiseAlert(q, { materialId, purchaseOrderId = null, alertType, snapshot, notify = true }) {
  const existing = (await q(
    "SELECT * FROM replenishment_alerts WHERE material_id = $1 AND alert_type = $2 AND status = 'open'",
    [materialId, alertType]
  )).rows[0];
  if (existing) return { created: false, alert: existing };

  const r = await q(
    "INSERT INTO replenishment_alerts (material_id, purchase_order_id, alert_type, status, snapshot) VALUES ($1, $2, $3, 'open', $4) RETURNING *",
    [materialId, purchaseOrderId, alertType, JSON.stringify(snapshot || {})]
  );
  const alert = r.rows[0];
  if (['below_minimum', 'projected_shortage'].includes(alertType)) {
    // inventory.low — the external-API webhook event for stock at/below its
    // floor. Only raised on NEW alerts (the early-return above handles the
    // already-open case). Same durability contract as every other event: an
    // event_log row + a bus emit; webhook dispatch never blocks the sweep.
    try {
      const { fireEvent } = require('../utils/activity');
      await fireEvent({
        eventType: 'inventory.low', entityType: 'material', entityId: materialId,
        payload: { material_id: materialId, alert_type: alertType, snapshot: snapshot || {} },
      }, { query: q });
    } catch (e) { console.error('[REPLENISH] inventory.low event failed:', e.message); }
  }
  if (notify) {
    try {
      await notificationService.notifyRoles(ALERT_ROLES, {
        title: `[${alertType}] material #${materialId}`,
        body: (snapshot && snapshot.summary) || null,
        eventType: `replenishment.${alertType}`,
        entityType: 'material',
        entityId: materialId,
      }, { query: q });
    } catch (e) {
      console.error('[REPLENISH] alert notification failed:', e.message);
    }
  }
  return { created: true, alert };
}

async function resolveAlerts(q, { materialId, alertTypes }) {
  let resolved = 0;
  for (const alertType of alertTypes) {
    const open = (await q(
      "SELECT * FROM replenishment_alerts WHERE material_id = $1 AND alert_type = $2 AND status = 'open'",
      [materialId, alertType]
    )).rows;
    for (const a of open) {
      await q(
        "UPDATE replenishment_alerts SET status = 'resolved', resolved_at = $1 WHERE id = $2",
        [new Date(), a.id]
      );
      resolved++;
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Per-material evaluation
// ---------------------------------------------------------------------------

async function evaluateMaterial(q, item, opts = {}) {
  const now = opts.now || new Date();
  const stock = await availableNow(q, item.id);
  if (stock.stock_by_warehouse.length === 0) {
    return { material_id: item.id, evaluated: false, reason: 'no stock records' };
  }

  const usage = await forecastDailyUsage(q, item.id, { now, days: opts.usageLookbackDays });
  const effectiveRop = Math.max(
    reorderPoint(usage, item.supplier_lead_time_days, item.safety_stock),
    stock.stored_reorder_level // the existing dashboard column stays authoritative when higher
  );
  const incoming = await openConfirmedQuantity(q, item.id);
  const demand = await scheduledDemand(q, item.id, { now });
  const shortfall = shortage(demand.total, stock.available, incoming);
  const belowReorder = stock.available + incoming <= effectiveRop;
  const belowMinimum = toNum(item.min_stock) > 0 && stock.available + incoming <= toNum(item.min_stock);

  const policy = await getPolicy(q, item);
  const actions = { alerts: [], purchase_request: null, purchase_order: null };

  // Alerts — always on, whatever the purchasing mode.
  if (shortfall > 0) {
    const raised = await raiseAlert(q, {
      materialId: item.id, alertType: 'projected_shortage',
      snapshot: {
        summary: `Scheduled demand ${demand.total} exceeds available ${stock.available} + incoming ${incoming} by ${shortfall}`,
        scheduled_demand: demand.total, available: stock.available, confirmed_incoming: incoming,
        shortage: shortfall, earliest_activity_date: demand.earliest_date,
      },
      notify: opts.notify !== false,
    });
    if (raised.created) actions.alerts.push('projected_shortage');
  } else {
    await resolveAlerts(q, { materialId: item.id, alertTypes: ['projected_shortage'] });
  }
  if (belowMinimum) {
    const raised = await raiseAlert(q, {
      materialId: item.id, alertType: 'below_minimum',
      snapshot: {
        summary: `Available ${stock.available} + incoming ${incoming} is at/below minimum stock ${toNum(item.min_stock)}`,
        available: stock.available, confirmed_incoming: incoming, min_stock: toNum(item.min_stock),
      },
      notify: opts.notify !== false,
    });
    if (raised.created) actions.alerts.push('below_minimum');
  } else {
    await resolveAlerts(q, { materialId: item.id, alertTypes: ['below_minimum'] });
  }

  // Replenishment need + gated action per mode.
  let need = shortfall;
  if (belowReorder) {
    const headroom = await storageHeadroomFor(q, stock.stock_by_warehouse);
    const suggested = suggestedOrderQuantity({
      available: stock.available,
      confirmedIncoming: incoming,
      scheduledDemand: demand.total,
      targetMaxStock: policy.target_max_stock != null ? policy.target_max_stock : toNum(item.max_stock),
      moq: toNum(item.moq),
      orderMultiple: toNum(item.order_multiple),
      shelfLifeDays: toNum(item.shelf_life_days),
      forecastDailyUsage: usage,
      storageHeadroom: headroom,
    });
    need = Math.max(need, suggested);
  }
  // The shortage path needs the same hard shelf/storage bounds as the target
  // stock path. A larger MOQ is unsafe to auto-order; the shortage alert above
  // stays open for manual resolution.
  if (need > 0) {
    const headroom = await storageHeadroomFor(q, stock.stock_by_warehouse);
    need = suggestedOrderQuantity({
      targetMaxStock: need, moq: item.moq, orderMultiple: item.order_multiple,
      shelfLifeDays: item.shelf_life_days, forecastDailyUsage: usage,
      storageHeadroom: headroom,
    });
  }

  if (need > 0 && policy.mode !== 'alert_only') {
    if (policy.mode === 'auto_draft_pr') {
      actions.purchase_request = await ensureDraftPurchaseRequest(q, {
        item, quantity: need, neededBy: demand.earliest_date, mode: policy.mode,
      });
    } else {
      const supplier = await resolveSupplier(q, item, policy);
      if (!supplier) {
        // No pre-approved supplier → never issue blind; the draft PO (no
        // supplier, no price) awaits the purchasing manager.
        actions.purchase_order = await ensurePurchaseOrder(q, {
          item, supplier: null, quantity: need, unitPrice: null, status: 'draft',
          basis: 'no_preapproved_supplier', neededBy: demand.earliest_date,
        });
      } else {
        const total = round3(need * supplier.unit_price);
        const ceiling = toNum(policy.authority_ceiling);
        const canIssue = policy.mode === 'auto_issue_po' && ceiling > 0 && total < ceiling;
        actions.purchase_order = await ensurePurchaseOrder(q, {
          item, supplier, quantity: need, unitPrice: supplier.unit_price,
          status: canIssue ? 'issued' : 'draft',
          basis: canIssue ? 'authority_ceiling' : 'awaiting_approval',
          ceiling, neededBy: demand.earliest_date,
        });
      }
    }
  }

  return {
    material_id: item.id,
    evaluated: true,
    available: stock.available,
    confirmed_incoming: incoming,
    scheduled_demand: demand.total,
    reorder_point: effectiveRop,
    below_reorder: belowReorder,
    shortage: shortfall,
    mode: policy.mode,
    policy_key: policy.policy_key,
    suggested_quantity: need,
    actions,
  };
}

// ---------------------------------------------------------------------------
// The scheduled sweep (idempotent — twice on the same data creates nothing)
// ---------------------------------------------------------------------------

async function runReplenishmentSweep(q = defaultQuery, opts = {}) {
  const items = (await q('SELECT * FROM item_master WHERE is_active = true')).rows;
  const results = [];
  for (const item of items) {
    try {
      results.push(await evaluateMaterial(q, item, opts));
    } catch (e) {
      console.error(`[REPLENISH] material ${item.id} evaluation failed:`, e.message);
      results.push({ material_id: item.id, evaluated: false, error: e.message });
    }
  }
  const other = await evaluateOtherAlerts(q, opts);
  return {
    evaluated: results.filter((r) => r.evaluated).length,
    skipped: results.filter((r) => !r.evaluated).length,
    results,
    other_alerts: other,
  };
}

// The alert classes outside the per-material stock math: rejected delivery,
// delayed PO, abnormal wastage, excess/slow-moving, expiring material.
async function evaluateOtherAlerts(q, opts = {}) {
  const now = opts.now || new Date();
  const lookbackDays = toNum(opts.usageLookbackDays || USAGE_LOOKBACK_DAYS);
  const cutoff = new Date(now).getTime() - lookbackDays * DAY_MS;
  const raised = { excess_slow_moving: 0, rejected_delivery: 0, delayed_po: 0, abnormal_wastage: 0, expiring_material: 0 };

  // Excess / slow-moving: stock present but nothing issued from it recently.
  const stockRows = (await q('SELECT * FROM warehouse_stock')).rows;
  const byMaterial = new Map();
  for (const r of stockRows) {
    if (!byMaterial.has(r.item_id)) byMaterial.set(r.item_id, { physical: 0 });
    byMaterial.get(r.item_id).physical += toNum(r.quantity);
  }
  for (const [materialId, entry] of byMaterial.entries()) {
    if (entry.physical <= 0) {
      await resolveAlerts(q, { materialId, alertTypes: ['excess_slow_moving'] });
      continue;
    }
    const issues = (await q(
      "SELECT * FROM stock_movements WHERE material_id = $1 AND movement_type = 'issue'",
      [materialId]
    )).rows;
    const recent = issues.some((m) => m.created_at && new Date(m.created_at).getTime() >= cutoff);
    if (recent) {
      await resolveAlerts(q, { materialId, alertTypes: ['excess_slow_moving'] });
    } else {
      const raisedAlert = await raiseAlert(q, {
        materialId, alertType: 'excess_slow_moving',
        snapshot: { summary: `${entry.physical} in stock with no issues in the last ${lookbackDays} days` },
        notify: opts.notify !== false,
      });
      if (raisedAlert.created) raised.excess_slow_moving++;
    }
  }

  // Rejected deliveries: quarantine_reject movements in the window.
  const rejects = (await q("SELECT * FROM stock_movements WHERE movement_type = 'quarantine_reject'")).rows
    .filter((m) => m.created_at && new Date(m.created_at).getTime() >= cutoff);
  for (const m of rejects) {
    const r = await raiseAlert(q, {
      materialId: m.material_id, alertType: 'rejected_delivery',
      snapshot: { summary: `Delivery rejected (movement #${m.id}, qty ${m.quantity})` },
      notify: opts.notify !== false,
    });
    if (r.created) raised.rejected_delivery++;
  }

  // Delayed POs: issued but past their needed-by date.
  const pos = (await q("SELECT * FROM purchase_orders WHERE status = 'issued'")).rows;
  for (const po of pos) {
    const overdue = po.needed_by != null && new Date(po.needed_by).getTime() < now.getTime();
    if (overdue) {
      const r = await raiseAlert(q, {
        materialId: po.material_id, purchaseOrderId: po.id, alertType: 'delayed_po',
        snapshot: { summary: `PO ${po.order_number || po.id} overdue since ${po.needed_by}` },
        notify: opts.notify !== false,
      });
      if (r.created) raised.delayed_po++;
    } else {
      await resolveAlerts(q, { materialId: po.material_id, alertTypes: ['delayed_po'] });
    }
  }

  // Abnormal wastage: waste+damage vs issued volume in the window.
  const materials = (await q('SELECT * FROM item_master WHERE is_active = true')).rows;
  for (const item of materials) {
    const movements = (await q('SELECT * FROM stock_movements WHERE material_id = $1', [item.id])).rows
      .filter((m) => m.created_at && new Date(m.created_at).getTime() >= cutoff);
    const issued = movements.filter((m) => m.movement_type === 'issue').reduce((s, m) => s + toNum(m.quantity), 0);
    const wasted = movements.filter((m) => m.movement_type === 'waste' || m.movement_type === 'damage')
      .reduce((s, m) => s + toNum(m.quantity), 0);
    const abnormal = issued > 0 && wasted / issued > WASTAGE_ALERT_THRESHOLD;
    if (abnormal) {
      const r = await raiseAlert(q, {
        materialId: item.id, alertType: 'abnormal_wastage',
        snapshot: { summary: `Wastage ${wasted} of ${issued} issued exceeds ${(WASTAGE_ALERT_THRESHOLD * 100).toFixed(0)}% in the last ${lookbackDays} days` },
        notify: opts.notify !== false,
      });
      if (r.created) raised.abnormal_wastage++;
    } else {
      await resolveAlerts(q, { materialId: item.id, alertTypes: ['abnormal_wastage'] });
    }
  }

  // Expiring material: shelf life is tracked per material (Phase 9), but lots
  // only exist once GRN/lot tracking lands (Phase 12). The hook is here; the
  // data is not — this class stays silent rather than inventing expiry dates.
  return raised;
}

// ---------------------------------------------------------------------------
// Scheduler — the repo pattern (escalationScheduler): an in-process interval
// registered at server startup; the sweep itself is pure and testable.
// ---------------------------------------------------------------------------

function initReplenishmentScheduler(opts = {}) {
  const intervalHours = toNum(opts.intervalHours) || 6;
  const timer = setInterval(() => {
    runReplenishmentSweep().catch((e) => console.error('[REPLENISH] sweep failed:', e.message));
  }, intervalHours * 3600 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  runReplenishmentSweep().catch((e) => console.error('[REPLENISH] initial sweep failed:', e.message));
  console.log(`[REPLENISH] scheduler initialized — sweep every ${intervalHours}h`);
  return timer;
}

module.exports = {
  MODES,
  DEFAULT_MODE,
  OPEN_PO_STATUSES,
  ALERT_ROLES,
  USAGE_LOOKBACK_DAYS,
  SCHEDULED_HORIZON_DAYS,
  WASTAGE_ALERT_THRESHOLD,
  toNum,
  round3,
  parseJson,
  leadTimeDemand,
  reorderPoint,
  projectedAvailable,
  shortage,
  roundToOrderRules,
  suggestedOrderQuantity,
  getPolicy,
  forecastDailyUsage,
  openConfirmedQuantity,
  scheduledDemand,
  availableNow,
  resolveSupplier,
  ensureDraftPurchaseRequest,
  ensurePurchaseOrder,
  evaluateMaterial,
  evaluateOtherAlerts,
  runReplenishmentSweep,
  initReplenishmentScheduler,
};
