// Load profiling (closeout B11). No thresholds, just measured numbers: each target is called
// at a small concurrency ladder and the per-call latency percentiles are recorded. Run against a
// THROWAWAY database container only (it needs TEST/throwaway-looking DB and creates tagged rows).
//
// Run: CONFIRM_THROWAWAY_DB=true LOAD_TAG=<label> node src/scripts/load-profiling.js
// (with DB_* pointing at the container and server.js NOT started here — the script boots its own
// app instance on LOAD_PORT (default 5130), creates and deactivates its own load user.)
// Targets: dashboards (portfolio + project + alerts), list endpoints (PRs, invoices, items),
// the three-way match (recording a supplier invoice exercises the match), an MCP tool call
// (auth + policy + handler end to end), and the replenishment sweep at the service level
// (5.3 adds the HTTP endpoints; profiling the service today is what the tests already do).

'use strict';

const PORT = Number(process.env.LOAD_PORT || 5130);
const TAG = process.env.LOAD_TAG || `load-${Date.now()}`;
let TOKEN = null; let BASE; let app; let server; let serverRef;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let FIRST_FAILURE = null;
async function timedCall(method, path, body) {
  const started = process.hrtime.bigint();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await (res.status >= 400 ? res.text() : res.arrayBuffer());
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  if (res.status >= 400 && !FIRST_FAILURE) FIRST_FAILURE = { method, path, status: res.status, body: String(text).slice(0, 400) };
  return { ms, status: res.status };
}

function percentiles(samples) {
  const sorted = samples.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return { n: samples.length, p50: +at(0.5).toFixed(0), p95: +at(0.95).toFixed(0), p99: +at(0.99).toFixed(0), max: +sorted[sorted.length - 1].toFixed(0) };
}

// Run `count` calls at `concurrency` using a plain worker pool.
async function run(call, count, concurrency) {
  const samples = [];
  let cursor = 0; const statuses = {};
  async function worker() {
    while (cursor < count) {
      const mine = ++cursor;
      const r = await call(mine);
      samples.push(r.ms);
      statuses[r.status] = (statuses[r.status] || 0) + 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { ...percentiles(samples), statuses };
}

// The MCP tool call: POST /api/mcp with a stored UI-equivalent JWT exercises authenticate →
// policy → resolveProjectContext → the inventory handler, the whole surface in one request.
const mcpCall = async () => timedCall('POST', '/api/mcp',
  { name: 'get_inventory_status', arguments: {} });

const TARGETS = [
  { name: 'dashboard portfolio', method: 'GET', path: () => '/api/dashboard' },
  { name: 'dashboard project overview', method: 'GET', path: (i) => `/api/dashboard/project/${i.projectIds[0]}` },
  { name: 'dashboard alerts', method: 'GET', path: () => '/api/dashboard/alerts' },
  { name: 'list purchase requisitions (v1 family)', method: 'GET', path: () => '/api/v1/purchase-requisitions' },
  { name: 'list invoices', method: 'GET', path: () => '/api/invoices' },
  { name: 'list items', method: 'GET', path: () => '/api/items' },
  { name: 'three-way match (record supplier invoice)', method: 'POST', path: (i) => '/api/procurement/invoices', body: (i, n) => ({
      supplier_id: i.supplierId,
      invoice_number: `LOAD-SI-${i.invoiceId}-${n}`,
      purchase_order_id: i.poId,
      total_amount: 1000,
      lines: [{ quantity: 10, unit_price: 100 }],
    }) },
  { name: 'mcp get_inventory_status', call: mcpCall },
];

(async () => {
  if (process.env.CONFIRM_THROWAWAY_DB !== 'true') {
    throw new Error('Set CONFIRM_THROWAWAY_DB=true only when DB_* points at a throwaway container (never real data).');
  }
  const db = require('../config/database');
  const tokens = require('../services/tokens');

  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  // A load user (owner, deactivated after the run) and the workspace fixture the targets lean on:
  // one project, a supplier, a material, an issued PO + invoice lines for the three-way-match target.
  const loadUser = await one(
    "INSERT INTO users (name, email, password, role) VALUES ('load-owner', $1, 'x', 'owner') RETURNING id, token_version, email",
    [`load-owner-${TAG}-${Date.now()}@load.test.io`]);
  await db.query("INSERT INTO user_project_roles (user_id, project_id, role_id) SELECT $1, NULL, id FROM roles WHERE key = 'owner'", [loadUser.id]);
  TOKEN = tokens.signSession({ userId: loadUser.id, tokenVersion: loadUser.token_version });
  ({ app } = require('../../server'));
  await new Promise((resolve) => { server = app.listen(PORT, '127.0.0.1', resolve); });
  BASE = `http://127.0.0.1:${PORT}`;
  serverRef = server;
  const runId = Date.now() % 1000000;
  const project = await one(
    "INSERT INTO projects (name, name_en, code, status) VALUES ($1, $1, $2, 'active') RETURNING id",
    [`load-${TAG}`, `L${TAG}${Date.now() % 100000}`.slice(0, 25)]);
  const supplier = await one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`load-s-${runId}`]);
  const material = await one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'load', $1, $1, 'ea') RETURNING id", [`load-m-${runId}`]);
  const po = await one(
    "INSERT INTO purchase_orders (order_number, supplier_id, project_id, status, total_amount) VALUES ($1, $2, $3, 'issued', 1000) RETURNING id",
    [`load-po-${runId}`, supplier.id, project.id]);
  const poLine = await one(
    'INSERT INTO purchase_order_lines (purchase_order_id, material_id, quantity, unit_rate) VALUES ($1, $2, 10, 100) RETURNING id',
    [po.id, material.id]);
  const invoice = await one(
    "INSERT INTO supplier_invoices (invoice_number, supplier_id, purchase_order_id, total_amount, tax_amount, status) VALUES ($1, $2, $3, 1000, 0, 'received') RETURNING id",
    [`load-si-${runId}`, supplier.id, po.id]);
  await one('INSERT INTO supplier_invoice_lines (supplier_invoice_id, purchase_order_line_id, quantity, unit_price) VALUES ($1, $2, 10, 100)', [invoice.id, poLine.id]);
  await db.query('UPDATE goods_receipt_notes SET status = status WHERE purchase_order_id = $1', [po.id]); // harmless touch

  // The lifecycle targets mutate: each three-way-match POST creates one invoice (unique number),
  // and the sweep writes what it decides; the ladders below are small and every row is tagged.
  const replenishment = require('../services/replenishment');
  const ctx = { projectIds: [project.id], invoiceId: invoice.id, supplierId: supplier.id, poId: po.id };
  let siSeq = 0;
  const results = {};
  for (const target of TARGETS) {
    const ladder = {};
    for (const concurrency of [1, 4, 8]) {
      if (target.call) {
        ladder[`c${concurrency}`] = await run(() => target.call(), concurrency * 5, concurrency);
        continue;
      }
      ladder[`c${concurrency}`] = await run(
        (n) => timedCall(target.method, target.path(ctx), target.body ? target.body(ctx, ++siSeq) : undefined),
        concurrency * 5, concurrency);
    }
    results[target.name] = ladder;
    console.log(`\n${target.name}`);
    for (const [key, value] of Object.entries(ladder)) {
      console.log(`  ${key}: p50 ${value.p50}ms  p95 ${value.p95}ms  p99 ${value.p99}ms  max ${value.max}ms  statuses ${JSON.stringify(value.statuses)}`);
    }
  }

  // Replenishment sweep: service-level timing, sequential, against the seeded catalog.
  const sweepStarted = process.hrtime.bigint();
  const sweep = await replenishment.runReplenishmentSweep((sql, p) => db.query(sql, p), { notify: false });
  const sweepMs = Number(process.hrtime.bigint() - sweepStarted) / 1e6;
  results['replenishment sweep (service, dry run)'] = { single: { ms: +sweepMs.toFixed(0), evaluated: Array.isArray(sweep) ? sweep.length : undefined } };
  console.log(`\nreplenishment sweep (service): ${sweepMs.toFixed(0)}ms${Array.isArray(sweep) ? ` over ${sweep.length} materials` : ''}`);
  if (FIRST_FAILURE) console.log(`\nFIRST FAILURE: ${JSON.stringify(FIRST_FAILURE)}`);

  // Best-effort cleanup (tagged rows; users untouched — the caller deactivated its own).
  // FK order: lines → documents → header rows → masters → the tagged project.
  await db.query('DELETE FROM supplier_invoice_lines WHERE supplier_invoice_id IN (SELECT id FROM supplier_invoices WHERE purchase_order_id = $1)', [po.id]);
  await db.query('DELETE FROM supplier_invoices WHERE purchase_order_id = $1', [po.id]);
  await db.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [po.id]);

  await db.query('DELETE FROM purchase_orders WHERE id = $1', [po.id]);
  const optionalCleanup = [
    ['DELETE FROM replenishment_alerts WHERE material_id = $1', [material.id]],
    ['DELETE FROM commitments WHERE project_id = $1', [project.id]],
    ['DELETE FROM purchase_requests WHERE project_id = $1', [project.id]],
    ['DELETE FROM project_costs WHERE project_id = $1', [project.id]],
    ['DELETE FROM item_master WHERE id = $1', [material.id]],
    ['DELETE FROM suppliers WHERE id = $1', [supplier.id]],
    ['DELETE FROM projects WHERE id = $1', [project.id]],
  ];
  for (const [sql, params] of optionalCleanup) {
    try { await db.query(sql, params); } catch (e) {
      // Optional-table cleanup (the condemned rows are tagged junk); log with context, never swallow.
      console.error(`[load] cleanup skipped: ${sql.split('FROM')[1].trim().slice(0, 40)}: ${e.message}`);
    }
  }

  if (serverRef) await new Promise((resolve) => serverRef.close(resolve));
  await db.query('DELETE FROM user_project_roles WHERE user_id = $1', [loadUser.id]);
  await db.query('UPDATE users SET is_active = false WHERE id = $1', [loadUser.id]);
  const fs = require('fs');
  const path = require('path');
  const reportPath = path.join(__dirname, process.env.LOAD_REPORT_DIR || '..', '..', '..', 'docs', `LOAD_BASELINE_${new Date().toISOString().slice(0, 10)}_${TAG}.json`);
  fs.writeFileSync(reportPath, JSON.stringify({ tag: TAG, base: BASE, started: new Date().toISOString(), results }, null, 2));
  console.log(`\nReport written to ${reportPath}`);
  await db.pool.end();
})().catch((e) => { console.error('[load] failed:', e.message); process.exit(1); });
