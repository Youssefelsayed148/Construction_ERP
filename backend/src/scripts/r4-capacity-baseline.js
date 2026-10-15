'use strict';

// R4.0 only: capture operational behavior before any R4 fixes. The tracked
// PowerShell runner supplies a loopback-only, throwaway erp_r04_baseline DB.
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const { performance } = require('perf_hooks');
const { Pool, Client } = require('pg');
const path = require('path');

function assertSafeTarget(env = process.env) {
  if (env.APP_ENV !== 'test' || !['erp_r04_baseline', 'erp_r04_password_after'].includes(env.DB_NAME)) throw new Error('R4 measurement requires APP_ENV=test and an erp_r04 throwaway database');
  if (!['127.0.0.1', 'localhost', '::1'].includes(String(env.DB_HOST).toLowerCase())) throw new Error('R4 baseline requires loopback DB_HOST');
  if (!env.DB_PASSWORD || !env.DB_USER) throw new Error('R4 baseline requires process-only credentials');
}

function request(port, pathname, body, { abortAfterMs } = {}) {
  return new Promise((resolve) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: body ? 'POST' : 'GET', headers: payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {} }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, error: null }));
    });
    req.on('error', (error) => resolve({ status: null, error: error.code || error.message }));
    if (abortAfterMs) setTimeout(() => req.destroy(), abortAfterMs).unref();
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitReady(port, child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`server child exited during startup (${child.exitCode})`);
    const result = await request(port, '/api/health');
    if (result.status === 200 || result.status === 503) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server child readiness timed out');
}

function startServer(port, baselineId) {
  const passwordAfter = process.argv.includes('--password-after');
  const child = spawn(process.execPath, [path.resolve(__dirname, '../../server.js')], {
    env: { ...process.env, PORT: String(port), AUTH_RATE_LIMIT_PER_15_MIN: '20', R4_BASELINE_ID: baselineId,
      ...(passwordAfter ? { UV_THREADPOOL_SIZE: '16', R4_PASSWORD_AFTER: '1' } : {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.output = '';
  child.stdout.on('data', (chunk) => { child.output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { child.output += chunk.toString(); });
  return child;
}

async function stopChild(child, signal = 'SIGTERM') {
  if (child.exitCode !== null) return child.exitCode;
  child.kill(signal);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve('SIGKILL'); }, 3000);
    child.once('exit', (code, sig) => { clearTimeout(timer); resolve(code ?? sig); });
  });
}

async function main() {
  assertSafeTarget();
  const cpu = os.cpus()[0]?.model || 'unknown';
  console.log(`environment node=${process.version}; platform=${process.platform}; arch=${process.arch}; cpu_model=${cpu}; cpu_logical_count=${os.cpus().length}; memory_gib=${(os.totalmem() / 1024 ** 3).toFixed(2)}`);
  const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await db.connect();
  const counts = await db.query(`SELECT 'projects' AS name, count(*)::int AS rows FROM projects UNION ALL SELECT 'users', count(*)::int FROM users UNION ALL SELECT 'invoices', count(*)::int FROM invoices`);
  console.log(`fixture_rows=${counts.rows.map((r) => `${r.name}:${r.rows}`).join(',')}`);

  const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, max: 20, connectionTimeoutMillis: 5000 });
  let first;
  let second;
  try {
    const port1 = 18000 + Math.floor(Math.random() * 10000);
    const port2 = port1 + 10001;
    first = startServer(port1, 'a');
    second = startServer(port2, 'b');
    await Promise.all([waitReady(port1, first), waitReady(port2, second)]);

    const burstStarted = performance.now();
    const burst = await Promise.all(Array.from({ length: 10 }, (_, i) => request(port1, '/api/auth/login', { email: `r4-unknown-${i}@example.com`, password: 'baseline-incorrect-password' })));
    const burstMs = performance.now() - burstStarted;
    const loopMetrics = [...first.output.matchAll(/R4_BASELINE_EVENT_LOOP[^\n]*p95_ms=([0-9.]+) max_ms=([0-9.]+)/g)].map((m) => ({ p95: Number(m[1]), max: Number(m[2]) }));
    console.log(`login_burst mode=${process.argv.includes('--password-after') ? 'scrypt' : 'bcryptjs-baseline'} requests=10 invalid_credentials=${burst.filter((r) => r.status === 401).length} rate_limited=${burst.filter((r) => r.status === 429).length} errors=${burst.filter((r) => r.status !== 401 && r.status !== 429).length} elapsed_ms=${burstMs.toFixed(1)} throughput_per_s=${(10000 / burstMs).toFixed(2)} event_loop_lag_ms_p95=${loopMetrics.length ? Math.max(...loopMetrics.map((m) => m.p95)).toFixed(2) : 'not-sampled'} event_loop_lag_ms_max=${loopMetrics.length ? Math.max(...loopMetrics.map((m) => m.max)).toFixed(2) : 'not-sampled'}`);

    const saturationStarted = performance.now();
    let maxWaiting = 0;
    const pending = Array.from({ length: 24 }, () => pool.query('SELECT pg_sleep(0.2)'));
    const waitingSampler = setInterval(() => { maxWaiting = Math.max(maxWaiting, pool.waitingCount); }, 2);
    await Promise.all(pending);
    clearInterval(waitingSampler);
    console.log(`pool_saturation max=20 requests=24 max_waiting=${maxWaiting} elapsed_ms=${(performance.now() - saturationStarted).toFixed(1)} after_waiting=${pool.waitingCount} idle=${pool.idleCount}`);

    const slowStarted = performance.now();
    await db.query('SELECT pg_sleep(0.5)');
    console.log(`slow_query_no_statement_timeout requested_sleep_ms=500 result=success elapsed_ms=${(performance.now() - slowStarted).toFixed(1)} statement_timeout=0`);

    const disconnect = await pool.connect();
    const disconnectPid = (await disconnect.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    let disconnectedQueryFinished = false;
    const disconnectedQuery = disconnect.query('SELECT pg_sleep(2)').then(() => { disconnectedQueryFinished = true; }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    disconnect.release();
    const activeAfterRelease = await db.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=$1 AND state='active'", [disconnectPid]);
    console.log(`db_client_release_mid_query backend_still_active=${activeAfterRelease.rows[0].n === 1} query_finished_at_release=${disconnectedQueryFinished}`);
    await disconnectedQuery;

    const { runSweepAsLeader } = require('../services/sweepLeader');
    let sweepRuns = 0;
    await runSweepAsLeader('r4_baseline_repeat', async () => { sweepRuns += 1; });
    await runSweepAsLeader('r4_baseline_repeat', async () => { sweepRuns += 1; });
    console.log(`sweep_immediate_rerun calls=2 actual_runs=${sweepRuns} minimum_interval=none`);

    const split = await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => request(port1, '/api/auth/login', { email: `r4-limiter-a-${i}@example.com`, password: 'baseline-incorrect-password' })),
      ...Array.from({ length: 11 }, (_, i) => request(port2, '/api/auth/login', { email: `r4-limiter-b-${i}@example.com`, password: 'baseline-incorrect-password' })),
    ]);
    const splitStatuses = Object.fromEntries([...new Set(split.map((r) => r.status ?? r.error ?? 'unknown'))].map((status) => [status, split.filter((r) => (r.status ?? r.error ?? 'unknown') === status).length]));
    console.log(`two_instance_rate_limit requests=${split.length} per_instance=10,11 combined_over_limit=true configured_limit=20 statuses=${JSON.stringify(splitStatuses)}`);
    const processErrors = `${first.output}${second.output}`;
    console.log(`two_instance_server_error_log_count=${(processErrors.match(/Login error:/g) || []).length}`);

    await stopChild(first, 'SIGTERM');
    first = startServer(port1, 'sigterm');
    await waitReady(port1, first);
    const abortAt = 50;
    const inFlight = request(port1, '/api/auth/login', { email: 'r4-sigterm@example.com', password: 'baseline-incorrect-password' });
    await new Promise((resolve) => setTimeout(resolve, abortAt));
    const exit = await stopChild(first, 'SIGTERM');
    first = null;
    const sigtermResult = await inFlight;
    console.log(`sigterm_mid_request signal=SIGTERM sent_after_ms=${abortAt} client_status=${sigtermResult.status ?? 'none'} client_error=${sigtermResult.error || 'none'} process_exit=${exit}`);

    const abortServer = startServer(port1, 'disconnect');
    await waitReady(port1, abortServer);
    const disconnectRequest = request(port1, '/api/auth/login', { email: 'r4-disconnect@example.com', password: 'baseline-incorrect-password' }, { abortAfterMs: 50 });
    const disconnectResult = await disconnectRequest;
    console.log(`http_client_disconnect abort_after_ms=50 client_error=${disconnectResult.error || 'none'} server_error_log=${/Login error/.test(abortServer.output)}`);
    await stopChild(abortServer);
    second.kill('SIGTERM');
    await stopChild(second);
    second = null;
  } finally {
    if (first) await stopChild(first, 'SIGTERM');
    if (second) await stopChild(second, 'SIGTERM');
    await pool.end();
    await db.end();
  }
}

main().catch((error) => { console.error(`R4 baseline failed: ${error.message}`); process.exitCode = 1; });
