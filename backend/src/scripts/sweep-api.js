'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const c = require('./sweep-common');

async function main() {
  const env = c.config(); c.assertClone(env);
  const only = process.argv[2] || 'all';
  const routes = require('./sweep-routes').enumerate();
  const policy = require('../services/policy');
  const pool = new Pool({ host: '127.0.0.1', port: 55441, database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, options: '-c default_transaction_read_only=on', max: 8, connectionTimeoutMillis: 10000 });
  const q = async (text, values) => pool.query(text, values);
  const output = { totals: {}, routes: routes.map(({ method, path: endpoint }) => ({ method, path: endpoint })), gets: [], writes: [], skips: [], pagination: [], findings: [], accounts: [], auditCountedTables: ['audit_events','activity_log','event_log'], started: new Date().toISOString() };
  if (only === 'gets' && fs.existsSync(path.join(c.artifacts, 'api.json'))) {
    const previous = JSON.parse(fs.readFileSync(path.join(c.artifacts, 'api.json'), 'utf8'));
    Object.assign(output, { writes: previous.writes, skips: previous.skips, findings: previous.findings.filter(f=>f.method!=='GET'), auditBefore: previous.auditBefore, auditAfter: previous.auditAfter, auditCountedTables: previous.auditCountedTables || previous.originalWriteAuditTables || ['audit_events'] });
  }
  for (const route of routes) output.totals[route.method] = (output.totals[route.method] || 0) + 1;
  const flag = (kind, row, extra = {}) => output.findings.push({ kind, ...row, ...extra });
  const checkpoint = () => c.save('api.json', output);
  try {
    if ((await q('SELECT current_database() AS name')).rows[0].name !== env.DB_NAME) throw new Error('Refusing sweep identity');
    const tables = (await q("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='id'")).rows;
    const ids = {}; const projectIds = {};
    const projectColumns = new Map((await q("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('project_id','current_project_id')")).rows.map(r=>[r.table_name,r.column_name]));
    for (const { table_name: table } of tables) {
      if (!/^[a-z_0-9]+$/.test(table)) throw new Error('Unexpected table name');
      ids[table] = (await q(`SELECT id FROM "${table}" ORDER BY id LIMIT 1`)).rows[0]?.id;
      if (projectColumns.has(table)) {
        for (const row of (await q(`SELECT DISTINCT ON ("${projectColumns.get(table)}") id, "${projectColumns.get(table)}" AS pid FROM "${table}" ORDER BY "${projectColumns.get(table)}", id`)).rows) {
          if (row.pid != null) { projectIds[row.pid] ||= {}; projectIds[row.pid][table] = row.id; }
        }
      }
    }
    const mappings = { pr: 'purchase_requests', po: 'purchase_orders', grn: 'goods_receipt_notes', mir: 'material_inspection_requests', rfq: 'rfqs', users: 'users', projects: 'projects', suppliers: 'suppliers', clients: 'clients', items: 'item_master', hr: 'employees', payroll: 'payroll_periods', approvals: 'approval_requests', documents: 'project_documents', 'work-orders': 'work_orders', 'client-portal': 'projects', 'project-setup': 'projects', journal: 'journal_entries' };
    function concrete(route, destructive = false, projectId = ids.projects) {
      const scopedIds = { ...ids, ...(projectIds[projectId] || {}), projects: projectId };
      const normalizedPrefix = route.policyPrefix || route.prefix.replace('/api/v1/', '/api/');
      const module = normalizedPrefix.split('/')[2];
      const rule = (policy.RECORD_SCOPE_RULES[module] || []).find(([regex]) => regex.test(route.policyRoutePath || route.routePath));
      const ruleTable = route.readModel?.table || (rule && (/^\w+$/.test(rule[1]) ? rule[1] : rule[1].match(/FROM\s+(\w+)/i)?.[1]));
      const source = route.handlers.map(h => h?.toString() || '').join('\n');
      const sqlTable = source.match(/FROM\s+(\w+)\s+(?:WHERE|[a-z]\b)/i)?.[1];
      let available = true; const params = {};
      const endpoint = route.path.replace(/:(\w+)(?:\([^)]*\))?\??/g, (_, name) => {
        const preceding = route.path.slice(0, route.path.indexOf(`:${name}`)).split('/').filter(Boolean).pop();
        let value;
        if (/project/i.test(name) || (module === 'projects' && name === 'id')) value = projectId;
        else if (name === 'date') value = '2026-10-16';
        else if (name === 'role') value = 'owner_ceo';
        else if (/key|type|kind|module/i.test(name)) { available = false; value = 'sweep_missing'; }
        else value = scopedIds[ruleTable] ?? scopedIds[mappings[preceding]] ?? scopedIds[preceding?.replace(/-/g, '_')] ?? scopedIds[mappings[module]] ?? scopedIds[sqlTable];
        if (destructive && !/project/i.test(name)) value = 999999999;
        if (value == null) { available = false; value = 999999999; }
        params[name] = String(value); return encodeURIComponent(value);
      });
      return { endpoint, available, params, module, normalizedPrefix, source };
    }
    const sessions = new Map();
    for (const account of c.credentials()) {
      const session = await c.login(account);
      sessions.set(account.key, session);
      output.accounts.push({ key: account.key, userId: session.user.id, login: true });
    }
    console.log(`Routes: ${JSON.stringify(output.totals)}; accounts authenticated: ${sessions.size}`);
    if (only !== 'writes') {
      for (const [role, session] of sessions) {
        const policyRows = (await q(policy.USER_POLICY_SQL, [session.user.id])).rows;
        const scoped = new Set(policyRows.filter(r => r.project_id != null).map(r => Number(r.project_id)));
        const companyWide = policyRows.some(r => r.project_id == null);
        let next = 0;
        const gets = routes.filter(r => r.method === 'GET');
        await Promise.all(Array.from({ length: 6 }, async () => {
          while (next < gets.length) {
            const route = gets[next++]; const target = concrete(route, false, [...scoped][0] ?? ids.projects);
            const query = { limit: '200', offset: '0' };
            // Supply query-only project context only when the handler explicitly requires it.
            if (/req\.query\.project_id/.test(target.source) && !Object.keys(target.params).some(k => /project/i.test(k))) query.project_id = String([...scoped][0] ?? ids.projects);
            const endpoint = target.endpoint + '?' + new URLSearchParams(query);
            const row = { role, method: 'GET', route: route.path, request: endpoint, idAvailable: target.available };
            let expected = null;
            const req = { method: 'GET', baseUrl: target.normalizedPrefix, route: { path: route.policyRoutePath || route.routePath }, originalUrl: endpoint, params: target.params, query, body: {}, user: session.user };
            const secured = route.handlers.some(h => h?.authorizeRoles);
            if(route.readModel){
              const model=route.readModel;
              expected=policy.decide({rows:policyRows,module:model.module,action:'view',projectId:null}).allowed;
              if(target.params.id&&model.projectColumn){
                const record=(await q(`SELECT ${model.projectExpression || model.projectColumn} AS project_id FROM ${model.table} WHERE id=$1`,[target.params.id])).rows[0];
                if(record)expected=expected&&policy.decide({rows:policyRows,module:model.module,action:'view',projectId:record.project_id}).allowed&&(record.project_id!=null||companyWide);
              }
            }else if (secured) {
              try {
                const decision = await policy.evaluateRequest(req, { query: q });
                const coarse = route.handlers.filter(h => h?.authorizeRoles?.length).every(h => h.authorizeRoles.includes(session.user.role));
                const portal = require('../middleware/auth').externalPortalAllowed(req);
                const requiresCompany = route.handlers.some(h => h?.name === 'companyOnly');
                expected = decision.allowed && coarse && portal && (!requiresCompany || decision.company_wide);
              } catch (_) { row.matrixUnavailable = true; }
            }
            try {
              const result = await c.request(endpoint, { token: session.token });
              Object.assign(row, { status: result.status, latencyMs: result.latencyMs, total: result.total, expectedAllowed: expected, errorCode: result.data?.error_code });
              if(Array.isArray(result.data?.data))row.returnedRows=result.data.data.length;
              if(result.status===200&&row.returnedRows>200&&result.total===null)flag('unbounded_list_without_total',row);
              if (result.status >= 500) flag('server_error', row);
              if (expected === false && result.status === 200) flag('unexpected_access', row);
              if (expected === true && result.status === 403) flag('unexpected_denial', row);
              if (!companyWide && /^(unassigned|expired_assignment|client_reviewer|subcontractor_|supplier_sales|testing_lab)/.test(role) && result.status === 200) {
                const leaks = [];
                function visit(node, pointer = 'data') {
                  if (!node || typeof node !== 'object') return;
                  if (Array.isArray(node)) { node.forEach((value, index) => visit(value, `${pointer}[${index}]`)); return; }
                  const pid = node.project_id ?? node.projectId;
                  if (pid != null && !scoped.has(Number(pid))) leaks.push({ pointer, projectId: pid });
                  if (Array.isArray(node.project_ids)) for (const pid of node.project_ids) if (!scoped.has(Number(pid))) leaks.push({ pointer: `${pointer}.project_ids`, projectId: pid });
                  for (const [key, value] of Object.entries(node)) visit(value, `${pointer}.${key}`);
                }
                visit(result.data?.data);
                if (leaks.length) flag('project_leak', row, { leaks });
              }
              if (role === 'owner_ceo' && result.status === 200 && Number(result.total) > 200 && Array.isArray(result.data?.data)) {
                const pageIds = result.data.data.map(r => r.id); let pagesOK = pageIds.every(id => id != null);
                for (let offset = 200; offset < Number(result.total); offset += 200) {
                  const page = await c.request(target.endpoint + '?' + new URLSearchParams({ ...query, offset: String(offset) }), { token: session.token });
                  if (page.status !== 200 || page.total !== result.total || !Array.isArray(page.data?.data)) { pagesOK = false; break; }
                  pageIds.push(...page.data.data.map(r => r.id));
                }
                const check = { request: endpoint, total: Number(result.total), seen: pageIds.length, unique: new Set(pageIds).size, ok: pagesOK && pageIds.length === Number(result.total) && new Set(pageIds).size === pageIds.length };
                output.pagination.push(check); if (!check.ok) flag('pagination', row, check);
              }
            } catch (error) { row.transportError = error.name; flag('transport_error', row); }
            output.gets.push(row);
          }
        }));
        checkpoint(); console.log(`GET completed: ${role}; requests=${output.gets.length}; flags=${output.findings.length}`);
      }
    }
    if (only !== 'gets') {
      const count = async () => (await q('SELECT ((SELECT count(*) FROM audit_events)+(SELECT count(*) FROM activity_log)+(SELECT count(*) FROM event_log))::int AS n')).rows[0].n;
      output.auditBefore = await count();
      const owner = sessions.get('owner_ceo'); const reader = sessions.get('client_reviewer');
      for (const route of routes.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method))) {
        // Never exercise credential rotation, impersonation or external send endpoints.
        if (/\/(?:auth|oauth)(?:\/|$)|\/preview(?:\/|$)|\/switch-role(?:\/|$)|\/send(?:\/|$)|\/test-delivery(?:\/|$)|\/rotate(?:\/|$)|\/revoke(?:\/|$)|\/mcp$|\/agent\/(?:chat|run)/.test(route.path)) {
          output.skips.push({ method: route.method, route: route.path, reason: 'credential/session mutation, external adapter or legacy role switch' }); continue;
        }
        const target = concrete(route, ['DELETE', 'PUT', 'PATCH'].includes(route.method));
        for (const [role, session, variant, body] of [
          ['owner_ceo', owner, 'empty', {}], ['owner_ceo', owner, 'wrong_type', { project_id: {}, name_en: [], amount: 'not-a-number', quantity: {}, status: [], items: 'wrong-type', lines: 'wrong-type' }],
          ['client_reviewer', reader, 'read_only_probe', {}],
        ]) {
          const row = { role, method: route.method, route: route.path, request: target.endpoint, variant, body, syntheticId: ['DELETE', 'PUT', 'PATCH'].includes(route.method) };
          const before = await count();
          try {
            const result = await c.request(target.endpoint, { method: route.method, token: session.token, body });
            Object.assign(row, { status: result.status, latencyMs: result.latencyMs, errorCode: result.data?.error_code, auditDelta: (await count()) - before });
            if (result.status >= 500) flag('write_server_error', row);
            const success = result.status >= 200 && result.status < 300;
            // DELETE and no-argument transitions are not invalid solely because their body is empty.
            const bodyRequired = /req\.body/.test(target.source) && route.method !== 'DELETE';
            if (success && bodyRequired && variant !== 'read_only_probe') flag('invalid_body_accepted_candidate', row);
            if (success && role === 'client_reviewer' && !/notifications|\/actions|\/me/.test(route.path)) flag('read_only_write_candidate', row);
            if (success && row.auditDelta === 0) flag('missing_audit_candidate', row);
          } catch (error) { row.transportError = error.name; flag('write_transport_error', row); }
          output.writes.push(row);
        }
        if (output.writes.length % 60 === 0) { checkpoint(); console.log(`Write probes=${output.writes.length}; flags=${output.findings.length}`); }
      }
      // One explicitly valid, local-only creation proves the success/audit path without invalidating UAT accounts.
      const marker = `SWEEP-${Date.now()}`;
      const before = await count();
      const validBody = { code: marker, name_en: marker, name_ar: 'اختبار', client_type: 'organization' };
      const result = await c.request('/api/clients', { method: 'POST', token: owner.token, body: validBody });
      const row = { role: 'owner_ceo', method: 'POST', request: '/api/clients', variant: 'valid', body: validBody, status: result.status, auditDelta: (await count()) - before };
      output.writes.push(row); if (result.status >= 500) flag('write_server_error', row); if (result.status < 300 && !row.auditDelta) flag('missing_audit_candidate', row);
      output.auditAfter = await count();
    }
    output.finished = new Date().toISOString(); checkpoint();
    console.log(JSON.stringify({ totals: output.totals, accounts: output.accounts.length, gets: output.gets.length, writes: output.writes.length, skippedWrites: output.skips.length, flags: output.findings.length, pagination: output.pagination.length, auditBefore: output.auditBefore, auditAfter: output.auditAfter }));
  } finally { checkpoint(); await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(`API sweep stopped: ${error.name}; raw error suppressed`); process.exitCode = 1; });
module.exports = { main };
