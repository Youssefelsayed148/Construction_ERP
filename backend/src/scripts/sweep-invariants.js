'use strict';
const fs = require('fs');
const path = require('path');
const c = require('./sweep-common');

async function main() {
  c.assertClone(c.config());
  const phase = process.argv[2] === 'baseline' ? 'baseline' : 'after';
  const result = { phase, observedAt: new Date().toISOString(), checks: {}, errors: [] };
  const check = (key, sql) => {
    try { result.checks[key] = c.sql(sql); }
    catch (error) { result.errors.push({ check: key, error: error.name }); }
  };
  check('money', `SELECT json_build_object(
    'all_payments', COALESCE(SUM(amount) FILTER (WHERE voided_at IS NULL),0),
    'client_payments', COALESCE(SUM(amount) FILTER (WHERE voided_at IS NULL AND client_id IS NOT NULL AND supplier_id IS NULL),0),
    'supplier_payments', COALESCE(SUM(amount) FILTER (WHERE voided_at IS NULL AND supplier_id IS NOT NULL),0),
    'unclassified_payments', COALESCE(SUM(amount) FILTER (WHERE voided_at IS NULL AND supplier_id IS NULL AND client_id IS NULL),0),
    'invoices', (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status NOT IN ('void','cancelled','credited')),
    'expected_outstanding', (SELECT COALESCE(SUM(amount),0) FROM invoices WHERE status NOT IN ('void','cancelled','credited')) - COALESCE(SUM(amount) FILTER (WHERE voided_at IS NULL AND client_id IS NOT NULL AND supplier_id IS NULL),0)) FROM payments`);
  check('trialBalance', 'SELECT json_build_object(\'debits\',COALESCE(SUM(debit),0),\'credits\',COALESCE(SUM(credit),0),\'balanced\',COALESCE(SUM(debit),0)=COALESCE(SUM(credit),0)) FROM journal_entry_lines');
  check('unbalancedEntries', `SELECT row_to_json(t) FROM (SELECT je.id, je.entry_number, je.total_amount, COUNT(l.id) AS lines, COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit FROM journal_entries je LEFT JOIN journal_entry_lines l ON l.journal_entry_id=je.id GROUP BY je.id HAVING COUNT(l.id)<2 OR COALESCE(SUM(l.debit),0)<>COALESCE(SUM(l.credit),0) OR COALESCE(SUM(l.debit),0)<>je.total_amount) t`);
  check('poQuantities', `SELECT row_to_json(t) FROM (SELECT po.order_number AS po_number, pol.id AS line_id, pol.quantity AS ordered, pol.delivered_quantity, pol.accepted_quantity,
    COALESCE((SELECT SUM(dl.quantity) FROM delivery_lines dl JOIN deliveries d ON d.id=dl.delivery_id WHERE dl.purchase_order_line_id=pol.id AND COALESCE(d.status,'') NOT IN ('cancelled','voided')),0) AS delivery_lines,
    COALESCE((SELECT SUM(GREATEST(gl.quantity-COALESCE(gl.returned_quantity,0),0)) FROM grn_lines gl JOIN goods_receipt_notes grn ON grn.id=gl.grn_id WHERE gl.purchase_order_line_id=pol.id AND grn.status='posted'),0) AS posted_grn,
    COALESCE((SELECT SUM(ml.accepted_quantity) FROM mir_lines ml JOIN material_inspection_requests mir ON mir.id=ml.mir_id WHERE ml.purchase_order_line_id=pol.id AND mir.status IN ('accepted','partially_accepted','approved')),0) AS accepted_mir
    FROM purchase_order_lines pol JOIN purchase_orders po ON po.id=pol.purchase_order_id) t WHERE delivered_quantity<>delivery_lines OR accepted_quantity<>posted_grn OR accepted_mir<>posted_grn OR accepted_quantity>ordered`);
  check('numberColumns', `SELECT json_build_object('table',table_name,'column',column_name) FROM information_schema.columns WHERE table_schema='public' AND (column_name LIKE '%\\_number' ESCAPE '\\' OR column_name IN ('pr_no','po_no','grn_no','mir_no','invoice_no','document_no')) AND data_type IN ('character varying','text') ORDER BY table_name,column_name`);
  result.checks.duplicateNumbers = [];
  for (const item of result.checks.numberColumns || []) {
    if (!/^[a-z_0-9]+$/.test(item.table) || !/^[a-z_0-9]+$/.test(item.column)) throw new Error('Unexpected identifier');
    const rows = c.sql(`SELECT json_build_object('table','${item.table}','column','${item.column}','number',"${item.column}",'count',count(*)) FROM "${item.table}" WHERE "${item.column}" IS NOT NULL AND "${item.column}"<>'' GROUP BY "${item.column}" HAVING count(*)>1`);
    result.checks.duplicateNumbers.push(...rows);
  }
  const auth = await c.login(c.credentials().find(a => a.key === 'owner_ceo'));
  result.api = {};
  for (const route of ['/api/dashboard/overview', '/api/finance/summary']) {
    const response = await c.request(route, { token: auth.token });
    result.api[route] = { status: response.status, data: response.data?.data };
  }
  result.checks.listCounts = [];
  const ownerId = Number(auth.user.id);
  if (!Number.isSafeInteger(ownerId)) throw new Error('Invalid clone owner identity');
  const scope = `SELECT project_id FROM user_project_roles WHERE user_id=${ownerId} AND (expires_at IS NULL OR expires_at>=CURRENT_DATE)`;
  const lists = [
    ['/api/projects','projects',`id IN (${scope})`], ['/api/clients','clients',`id IN (SELECT client_id FROM projects WHERE id IN (${scope}))`],
    ['/api/suppliers','suppliers',`deleted_at IS NULL AND id IN (SELECT supplier_id FROM purchase_orders WHERE project_id IN (${scope}) UNION SELECT si.supplier_id FROM supplier_invoices si JOIN purchase_orders po ON po.id=si.purchase_order_id WHERE po.project_id IN (${scope}))`],
    ['/api/items','item_master','deleted_at IS NULL'], ['/api/invoices','invoices',`project_id IN (${scope})`], ['/api/payments','payments',`project_id IN (${scope})`],
    ['/api/expenses','expenses',`project_id IN (${scope})`], ['/api/assets','assets',`current_project_id IN (${scope})`], ['/api/warehouses','warehouses',`project_id IN (${scope})`], ['/api/procurement/rfq','rfqs',`project_id IN (${scope})`],
  ];
  for (const [route, table, where] of lists) {
    const response = await c.request(`${route}?limit=1&offset=0`, { token: auth.token });
    const sqlCount = c.sql(`SELECT to_json(count(*)) FROM ${table} WHERE ${where}`)[0];
    result.checks.listCounts.push({ request: `${route}?limit=1&offset=0`, status: response.status, total: response.total, sql: `SELECT COUNT(*) FROM ${table} WHERE ${where}`, sqlCount, match: response.status===200 && response.total !== null && Number(response.total)===sqlCount });
  }
  if (phase === 'after' && fs.existsSync(path.join(c.artifacts, 'api.json'))) {
    const api = JSON.parse(fs.readFileSync(path.join(c.artifacts, 'api.json'), 'utf8'));
    const success = api.writes.filter(row => row.status>=200 && row.status<300);
    result.checks.audit = { before: api.auditBefore, after: api.auditAfter, delta: api.auditAfter-api.auditBefore, countedTables: api.originalWriteAuditTables || ['audit_events','activity_log','event_log'], successfulRequests: success.length, withoutObservedAudit: success.filter(row => row.auditDelta===0).map(({method,request,role,variant})=>({method,request,role,variant})), limitation: 'Original run counted audit_events alone; activity_log must also be checked. Per-request count deltas do not prove same-transaction or exact entity attribution.' };
  }
  c.save(`invariants-${phase}.json`, result);
  console.log(JSON.stringify({ phase, money: result.checks.money, trialBalance: result.checks.trialBalance, unbalancedEntries: result.checks.unbalancedEntries?.length, poDisagreements: result.checks.poQuantities?.length, duplicateNumbers: result.checks.duplicateNumbers.length, listsMatching: result.checks.listCounts.filter(r=>r.match).length, errors: result.errors, audit: result.checks.audit }));
  if (result.errors.length) process.exitCode = 1;
}
if (require.main===module) main().catch(error=>{ console.error(`Invariant sweep stopped: ${error.name}; raw error suppressed`); process.exitCode=1; });
module.exports = { main };
