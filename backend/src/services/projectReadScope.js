'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const storage = new AsyncLocalStorage();
const inventories = new WeakMap();
const IDENTITIES = new Set(['user_project_roles']);
const SHARED_DEFAULTS = new Set(['business_rules', 'workflow_templates', 'report_templates']);

async function inventory(q) {
  if (!inventories.has(q)) {
    inventories.set(q, q(`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`).then(result => {
      const tables = new Map();
      for (const row of result.rows) {
        if (!/^[a-z][a-z0-9_]*$/.test(row.table_name)) continue;
        if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
        tables.get(row.table_name).add(row.column_name);
      }
      if (!tables.has('projects')) throw new Error('Project scope schema inventory unavailable');
      return tables;
    }).catch(error => { inventories.delete(q); throw error; }));
  }
  return inventories.get(q);
}

// Existing engines accept injectable queries. A request-local scoped query
// supplies SQL CTE relations restricted to the authorized project set, so
// aggregation happens AFTER filtering, including nested selects and joins.
// Company-wide queries without an explicit filter pass through unchanged.
async function scopedQuery(req, q) {
  const explicit = req.query?.project_id ?? req.query?.projectId;
  const scope = req.accessScope;
  if (!scope) throw new Error('Project access scope required');
  if (scope.companyWide && (explicit == null || explicit === '')) return q;
  const ids = explicit != null && explicit !== '' ? [Number(explicit)] : (scope.projectIds || []).map(Number);
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('Invalid authorized project scope');
  if (!scope.companyWide && ids.some(id => !scope.projectIds.map(Number).includes(id))) {
    throw Object.assign(new Error('Project outside authorized scope'), { status: 403, error_code: 'project_scope_denied' });
  }
  const tables = await inventory(q);
  return (sql, params = []) => {
    const config = sql && typeof sql === 'object' ? sql : null;
    const text = config ? config.text : sql;
    if (typeof text !== 'string') throw new Error('Scoped queries require SQL text');
    // Legacy GET commitment synchronization still writes (R3). Its mutation
    // behavior and global numbering counter are intentionally unchanged here;
    // the project list/record reads driving it are filtered before the loop.
    if (!/^\s*(SELECT|WITH)\b/i.test(text)
      || /^\s*SELECT\s+COUNT\(\*\)\s+FROM\s+commitments\s*;?\s*$/i.test(text)) return q(sql, params);
    const values = (config ? config.values : params) || [];
    const bind = `$${values.length + 1}::int[]`;
    const projectFilter = column => `${column} = ANY(${bind})`;
    const predicates = new Map([['projects', projectFilter('id')]]);
    for (const [table, columns] of tables) {
      if (IDENTITIES.has(table)) continue;
      const column = columns.has('project_id') ? 'project_id' : columns.has('current_project_id') ? 'current_project_id' : null;
      if (column) predicates.set(table, SHARED_DEFAULTS.has(table)
        ? `(${projectFilter(column)} OR ${column} IS NULL)` : projectFilter(column));
    }
    const employeeSources = [...tables].filter(([, columns]) => columns.has('employee_id') && columns.has('project_id'));
    const employeeIds = employeeSources.length
      ? employeeSources.map(([table]) => `SELECT employee_id FROM public.${table} WHERE ${projectFilter('project_id')}`).join(' UNION ')
      : 'SELECT NULL::int WHERE false';
    predicates.set('employees', `id IN (${employeeIds})`);
    const laborerSources = [...tables].filter(([, columns]) => columns.has('laborer_id') && columns.has('project_id'));
    const laborerIds = laborerSources.length
      ? laborerSources.map(([table]) => `SELECT laborer_id FROM public.${table} WHERE ${projectFilter('project_id')}`).join(' UNION ')
      : 'SELECT NULL::int WHERE false';
    predicates.set('daily_laborers', `id IN (${laborerIds})`);
    // Period headers carry COMPANY totals. A project seat may read a header
    // only when its entire salary is allocated to that seat's project set;
    // mixed, unallocated and partially allocated company totals stay hidden.
    const payrollIds = `SELECT p.id FROM public.payroll_periods p
      JOIN public.payroll_cost_allocations a ON a.payroll_id = p.id
      GROUP BY p.id, p.total_net_salary
      HAVING COUNT(*) FILTER (WHERE a.project_id IS NULL OR NOT (${projectFilter('a.project_id')})) = 0
        AND SUM(a.amount) = p.total_net_salary`;
    predicates.set('payroll_periods', `id IN (${payrollIds})`);
    predicates.set('payroll_details', `payroll_id IN (${payrollIds})`);
    // Material-wide alert snapshots aggregate company stock. Only alerts
    // linked to an authorized PO have a provable project owner.
    predicates.set('replenishment_alerts', `purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE ${projectFilter('project_id')})`);
    predicates.set('leave_requests', `employee_id IN (${employeeIds})`);
    if (!tables.get('attendance')?.has('project_id')) predicates.set('attendance', `employee_id IN (${employeeIds})`);
    predicates.set('warehouse_stock', `warehouse_id IN (SELECT id FROM public.warehouses WHERE ${projectFilter('project_id')})`);
    for (const table of ['deliveries', 'goods_receipt_notes']) {
      if (!tables.get(table)?.has('project_id')) predicates.set(table, `purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE ${projectFilter('project_id')})`);
    }
    predicates.set('journal_entry_lines', `journal_entry_id IN (SELECT id FROM public.journal_entries WHERE ${projectFilter('project_id')})`);
    predicates.set('units', `building_id IN (SELECT id FROM public.buildings WHERE ${projectFilter('project_id')})`);
    predicates.set('clients', `id IN (SELECT client_id FROM public.projects WHERE ${projectFilter('id')})`);
    if (!tables.get('supplier_invoices')?.has('project_id')) {
      predicates.set('supplier_invoices', `purchase_order_id IN (SELECT id FROM public.purchase_orders WHERE ${projectFilter('project_id')})`);
    }
    predicates.set('suppliers', `id IN (SELECT supplier_id FROM public.purchase_orders WHERE ${projectFilter('project_id')}
      UNION SELECT si.supplier_id FROM public.supplier_invoices si JOIN public.purchase_orders po ON po.id = si.purchase_order_id
      WHERE ${projectFilter('po.project_id')})`);
    predicates.set('subcontractors', `id IN (SELECT subcontractor_id FROM public.sub_contracts WHERE ${projectFilter('project_id')})`);
    const referenced = new Set([...text.matchAll(/\b(?:FROM|JOIN)\s+(?:public\.)?([a-z][a-z0-9_]*)\b/gi)].map(match => match[1].toLowerCase()));
    const ctes = [...referenced].filter(table => predicates.has(table) && tables.has(table))
      .map(table => `${table} AS (SELECT * FROM public.${table} WHERE ${predicates.get(table)})`);
    if (!ctes.length) return q(sql, params);
    let statement = text;
    for (const table of referenced) if (predicates.has(table)) statement = statement.replace(new RegExp(`\\bpublic\\.${table}\\b`, 'gi'), table);
    const recursive = /^\s*WITH\s+RECURSIVE\b/i.test(statement);
    const prefix = recursive ? 'WITH RECURSIVE ' : 'WITH ';
    statement = /^\s*WITH\b/i.test(statement)
      ? prefix + ctes.join(', ') + ', ' + statement.replace(/^\s*WITH\s+(?:RECURSIVE\s+)?/i, '')
      : prefix + ctes.join(', ') + ' ' + statement;
    if (config) return q({ ...config, text: statement, values: [...values, ids],
      ...(config.name ? { name: `${config.name}:project-scoped` } : {}) });
    return q(statement, [...values, ids]);
  };
}

module.exports = { storage, scopedQuery };
