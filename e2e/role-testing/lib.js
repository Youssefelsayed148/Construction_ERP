// Shared helpers for the role-testing run. Credentials are read from .live-users.json (ignored by git) and never printed or written to results.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'static-introspection-only-not-the-app-secret-0123456789';
process.env.APP_ENV = process.env.APP_ENV || 'test';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const BASE = process.env.ERP_BASE || 'http://localhost:8090';
const CONTAINER = 'construction-erp-db-1';
const accounts = JSON.parse(fs.readFileSync(path.join(ROOT, '.live-users.json'), 'utf8')).accounts;

// Read-only SQL (verification and expected-matrix derivation only; all data changes go through the API).
function sql(q) {
  try { return sql_(q); } catch (e) { throw new Error('SQL failed: ' + String(e.stderr || e.message).split('\n').slice(0, 2).join(' | ')); }
}
function sql_(q) {
  return execFileSync('docker', ['exec', '-i', CONTAINER, 'sh', '-c', 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1'], { input: q, maxBuffer: 1 << 26 }).toString().trim();
}
const sqlJson = (q) => JSON.parse(sql(`select coalesce(json_agg(t),'[]'::json) from (${q}) t`));
const num = (v) => Math.round(Number(v) * 100) / 100;

// Session tokens are cached on disk (git-excluded) so repeated scripts do not trip the login rate limiter.
const TOKEN_FILE = path.join(__dirname, 'out/.tokens.json');
const tokens = (() => { try { return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')); } catch { return {}; } })();
const persistTokens = () => { try { fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens)); } catch { /* cache is optional */ } };
// Logins are serialised and spaced (LOGIN_GAP_MS) so the login rate limiter is never tripped and nothing runs in parallel.
const LOGIN_GAP_MS = Number(process.env.LOGIN_GAP_MS || 1500);
let lastLoginAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(key, { force = false } = {}) {
  if (!force && tokens[key]) return tokens[key];
  const email = key.includes('@') ? key : `pilot-${key}@pilot.example.com`;
  const a = accounts.find((x) => x.email === email);
  if (!a) return null;
  const wait = lastLoginAt + LOGIN_GAP_MS - Date.now(); if (wait > 0) await sleep(wait);
  lastLoginAt = Date.now();
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email, password: a.password }) });
  const b = await r.json().catch(() => ({}));
  if (b.data?.token) { tokens[key] = b.data.token; if (b.data.user) tokens['__user:' + key] = b.data.user; persistTokens(); return tokens[key]; }
  delete tokens[key]; // never cache a failed login
  if (r.status === 429) { console.error('LOGIN RATE LIMITED for', key, '- backing off 20 s'); await sleep(20000); }
  return null;
}
async function call(key, method, p, body, extra = {}) {
  const once = async () => {
    const token = await login(key);
    const r = await fetch(BASE + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, body: j, data: j?.data, code: j?.error_code || j?.error?.error_code, headers: r.headers, text };
  };
  let res = await once();
  if (res.status === 401 && key) { await login(key, { force: true }); res = await once(); } // expired/revoked session: one re-login, once
  return res;
}
const results = [];
function rec(r) { results.push(r); return r; }
async function sessionUser(key) { await login(key); return tokens['__user:' + key] || null; }
module.exports = { sessionUser, ROOT, BASE, accounts, sql, sqlJson, num, login, call, results, rec, tokens };
