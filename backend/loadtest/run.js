// Load-test runner (closeout B11). Starts the real app in a child process (no background schedulers), runs autocannon
// against the dashboard, list and three-way-match endpoints, then times the replenishment sweep directly.
// Baselines only: no thresholds, nothing here fails the build. Throwaway database only (see seed.js).
//
//   LOADTEST_CONFIRM_THROWAWAY=1 node loadtest/run.js          (LT_DURATION=10 LT_CONNECTIONS=10 to tune)
'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const autocannon = require('autocannon');

const DURATION = Number(process.env.LT_DURATION || 10);
const CONNECTIONS = Number(process.env.LT_CONNECTIONS || 10);
const PORT = Number(process.env.LT_PORT || 5055);
const BASE = `http://127.0.0.1:${PORT}`;

function guard() {
  if (process.env.LOADTEST_CONFIRM_THROWAWAY !== '1') throw new Error('Set LOADTEST_CONFIRM_THROWAWAY=1 (throwaway database only)');
  if (!['127.0.0.1', 'localhost'].includes(process.env.DB_HOST || 'localhost')) throw new Error('Refusing non-local DB_HOST');
}

async function waitHealthy() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.status === 200) return; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not become healthy');
}

function summarize(name, r) {
  return {
    name,
    requests: r.requests.total,
    req_per_sec: Math.round(r.requests.average * 10) / 10,
    p50_ms: r.latency.p50, p95_ms: r.latency.p97_5 && r.latency.p95 !== undefined ? r.latency.p95 : r.latency.p97_5,
    p99_ms: r.latency.p99, max_ms: r.latency.max,
    non_2xx: r.non2xx, errors: r.errors, timeouts: r.timeouts,
  };
}

async function main() {
  guard();
  const tokens = require('../src/services/tokens');
  const db = require('../src/config/database');
  const owner = (await db.query("SELECT id, token_version FROM users WHERE email = 'lt-owner@loadtest.local'")).rows[0];
  if (!owner) throw new Error('run loadtest/seed.js first');
  const token = tokens.signSession({ userId: owner.id, tokenVersion: owner.token_version });
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  const po = (await db.query(`SELECT po.id, po.supplier_id, pol.id line_id, pol.material_id
                                FROM purchase_orders po JOIN purchase_order_lines pol ON pol.purchase_order_id = po.id
                               WHERE po.order_number LIKE 'LT-PO-%' ORDER BY po.id, pol.id LIMIT 1`)).rows[0];
  const dataset = (await db.query(`SELECT (SELECT count(*) FROM projects)::int projects, (SELECT count(*) FROM item_master)::int items,
    (SELECT count(*) FROM stock_movements)::int stock_movements, (SELECT count(*) FROM invoices)::int invoices,
    (SELECT count(*) FROM purchase_orders)::int purchase_orders, (SELECT count(*) FROM goods_receipt_notes)::int grns,
    (SELECT count(*) FROM suppliers)::int suppliers, (SELECT count(*) FROM warehouses)::int warehouses`)).rows[0];

  const child = spawn(process.execPath, [path.join(__dirname, 'serve.js')], {
    env: { ...process.env, PORT: String(PORT), V1_RATE_LIMIT_PER_MIN: '10000000', AUTH_RATE_LIMIT_PER_15_MIN: '100000', LOG_LEVEL: 'error' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const results = [];
  try {
    await waitHealthy();
    const runId = Date.now().toString(36);
    const get = (name, url) => ({ name, opts: { url: `${BASE}${url}`, headers } });
    const targets = [
      get('GET /api/dashboard/overview', '/api/dashboard/overview'),
      get('GET /api/dashboard/portfolio', '/api/dashboard/portfolio'),
      get('GET /api/dashboard/role', '/api/dashboard/role'),
      get('GET /api/invoices (limit 100)', '/api/invoices'),
      get('GET /api/items', '/api/items'),
      get('GET /api/projects', '/api/projects'),
      get('GET /api/suppliers', '/api/suppliers'),
      get('GET /api/warehouses', '/api/warehouses'),
      {
        name: 'POST /api/procurement/invoices (three-way match)',
        opts: {
          url: `${BASE}/api/procurement/invoices`, method: 'POST', headers, idReplacement: true,
          body: JSON.stringify({
            supplier_id: po.supplier_id, purchase_order_id: po.id, invoice_number: `LT-${runId}-[<id>]`, total_amount: 100,
            lines: [{ purchase_order_line_id: po.line_id, material_id: po.material_id, quantity: 1, unit_price: 100 }],
          }),
        },
      },
    ];
    for (const t of targets) {
      // warm-up: 2 s, discarded
      await autocannon({ ...t.opts, connections: CONNECTIONS, duration: 2 });
      const r = await autocannon({ ...t.opts, connections: CONNECTIONS, duration: DURATION });
      results.push(summarize(t.name, r));
      console.log(JSON.stringify(results[results.length - 1]));
    }
  } finally {
    child.kill();
  }

  // Replenishment sweep, timed directly (cold first run, then two more).
  const replenishment = require('../src/services/replenishment');
  const sweeps = [];
  for (let i = 0; i < 3; i += 1) {
    const t0 = process.hrtime.bigint();
    const out = await replenishment.runReplenishmentSweep(db.query, { notify: false });
    sweeps.push({ run: i + 1, ms: Number((process.hrtime.bigint() - t0) / 1000000n), evaluated: out.evaluated, skipped: out.skipped });
    console.log(JSON.stringify({ sweep: sweeps[sweeps.length - 1] }));
  }

  const report = {
    when: new Date().toISOString(),
    machine: { cpu: os.cpus()[0].model, cores: os.cpus().length, mem_gb: Math.round(os.totalmem() / 1e9), os: `${os.type()} ${os.release()}`, node: process.version },
    config: { duration_s: DURATION, connections: CONNECTIONS, db: 'postgres:16-alpine in Docker, same host' },
    dataset, results, sweeps,
  };
  fs.writeFileSync(path.join(__dirname, 'last-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.machine));
  await db.pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
