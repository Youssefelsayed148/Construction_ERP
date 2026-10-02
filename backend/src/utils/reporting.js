// Phase 24 — the report catalog + the shared list/export contract.
//
// Every catalog report has: a key, a module, a permission-aware query, a
// column set (with `internal` columns marked — a client-facing export must
// never include internal cost/rate columns even if the underlying query has
// them), and Excel/CSV/PDF export over the same filtered result set the UI
// shows.
//
// The list contract (parseListQuery) gives every endpoint the same
// filter/sort/pagination query parameters; exports reuse the exact filtered
// dataset the UI shows.

'use strict';

const REPORTS = {
  projects: {
    module: 'projects', label: 'Projects register', table: 'projects',
    columns: [
      ['id', 'ID'], ['name_en', 'Project'], ['status', 'Status'], ['completion_percentage', 'Progress %'],
      ['budget', 'Budget', 'internal'], ['contract_value', 'Contract value', 'internal'],
    ],
  },
  quality_tests: {
    module: 'qhse', label: 'Quality tests', table: 'quality_tests',
    columns: [['id', 'ID'], ['test_type', 'Test type'], ['test_date', 'Date'], ['result', 'Result']],
  },
  ncrs: {
    module: 'qhse', label: 'NCRs', table: 'ncrs',
    columns: [['id', 'ID'], ['ncr_number', 'NCR'], ['severity', 'Severity'], ['status', 'Status'],
      ['cost_impact', 'Cost impact', 'internal']],
  },
  wirs: {
    module: 'qhse', label: 'Work inspection requests', table: 'wirs',
    columns: [['id', 'ID'], ['wir_number', 'WIR'], ['status', 'Stage'], ['result', 'Result'], ['inspection_date', 'Date']],
  },
  punch_items: {
    module: 'qhse', label: 'Punch list', table: 'punch_items',
    columns: [['id', 'ID'], ['punch_number', 'Item'], ['discipline', 'Discipline'], ['status', 'Status'], ['due_date', 'Due']],
  },
  incidents: {
    module: 'hse', label: 'Incidents', table: 'incidents',
    columns: [['id', 'ID'], ['incident_date', 'Date'], ['incident_category', 'Category'], ['severity', 'Severity'], ['status', 'Status'], ['lost_days', 'Lost days']],
  },
  near_misses: {
    module: 'hse', label: 'Near misses', table: 'near_misses',
    columns: [['id', 'ID'], ['near_miss_number', 'Ref'], ['incident_date', 'Date'], ['severity', 'Severity'], ['status', 'Status']],
  },
  permits: {
    module: 'hse', label: 'Permits to work', table: 'permits',
    columns: [['id', 'ID'], ['permit_number', 'Permit'], ['permit_type', 'Type'], ['status', 'Status'], ['valid_from', 'Valid from'], ['valid_to', 'Valid to']],
  },
  corrective_actions: {
    module: 'qhse', label: 'Corrective actions', table: 'corrective_actions',
    columns: [['id', 'ID'], ['description', 'Description'], ['status', 'Status'], ['due_date', 'Due']],
  },
  schedule_activities: {
    module: 'schedule', label: 'Schedule activities', table: 'schedule_activities',
    columns: [['id', 'ID'], ['activity_code', 'Code'], ['name', 'Activity'], ['planned_start', 'Planned start'],
      ['planned_finish', 'Planned finish'], ['percent_complete', '% complete'], ['critical', 'Critical']],
  },
  project_documents: {
    module: 'docs', label: 'Document register', table: 'project_documents',
    columns: [['id', 'ID'], ['doc_number', 'Doc number'], ['title', 'Title'], ['doc_type', 'Type'],
      ['discipline', 'Discipline'], ['doc_status', 'Status'], ['revision_code', 'Rev']],
  },
  transmittals: {
    module: 'docs', label: 'Transmittals', table: 'transmittals',
    columns: [['id', 'ID'], ['transmittal_number', 'Transmittal'], ['direction', 'Direction'], ['status', 'Status'], ['created_at', 'Created']],
  },
  correspondence: {
    module: 'docs', label: 'Correspondence', table: 'correspondence',
    columns: [['id', 'ID'], ['corr_number', 'Ref'], ['corr_type', 'Type'], ['subject', 'Subject'], ['status', 'Status'], ['revision', 'Rev']],
  },
  purchase_requests: {
    module: 'procurement', label: 'Purchase requisitions', table: 'purchase_requests',
    columns: [['id', 'ID'], ['pr_number', 'PR'], ['status', 'Status'], ['total_amount', 'Value', 'internal']],
  },
  purchase_orders: {
    module: 'procurement', label: 'Purchase orders', table: 'purchase_orders',
    columns: [['id', 'ID'], ['po_number', 'PO'], ['status', 'Status'], ['total_amount', 'Value', 'internal']],
  },
  deliveries: {
    module: 'procurement', label: 'Deliveries', table: 'deliveries',
    columns: [['id', 'ID'], ['delivery_number', 'Delivery'], ['status', 'Status'], ['delivery_date', 'Date']],
  },
  sub_contracts: {
    module: 'commercial', label: 'Subcontracts', table: 'sub_contracts',
    columns: [['id', 'ID'], ['sub_contract_number', 'Contract'], ['status', 'Status'], ['contract_value', 'Value', 'internal']],
  },
  variations: {
    module: 'commercial', label: 'Variations', table: 'variations',
    columns: [['id', 'ID'], ['variation_number', 'Ref'], ['title', 'Title'], ['status', 'Status'], ['amount', 'Amount', 'internal']],
  },
  invoices: {
    module: 'finance', label: 'Client invoices', table: 'invoices',
    columns: [['id', 'ID'], ['invoice_number', 'Invoice'], ['status', 'Status'], ['amount', 'Amount', 'internal'], ['due_date', 'Due', 'internal']],
  },
  expenses: {
    module: 'finance', label: 'Expenses', table: 'expenses',
    columns: [['id', 'ID'], ['description', 'Description'], ['date', 'Date'], ['status', 'Status'], ['amount', 'Amount', 'internal']],
  },
  employees: {
    module: 'hr', label: 'Employees', table: 'employees',
    columns: [['id', 'ID'], ['name', 'Name'], ['position', 'Position'], ['status', 'Status']],
  },
  inductions: {
    module: 'hse', label: 'Inductions', table: 'inductions',
    columns: [['id', 'ID'], ['person_name', 'Person'], ['induction_date', 'Date'], ['induction_type', 'Type'], ['status', 'Status']],
  },
};

// Pre-configured report packs.
const REPORT_PACKS = {
  commercial: { label: 'Commercial pack', reports: ['projects', 'sub_contracts', 'variations', 'purchase_orders'] },
  procurement: { label: 'Procurement pack', reports: ['purchase_requests', 'purchase_orders', 'deliveries'] },
  management: { label: 'Management pack', reports: ['projects', 'schedule_activities', 'quality_tests', 'incidents', 'invoices'] },
};

// ---------------------------------------------------------------------------
// The list contract — filter/sort/page, portable across PG and the MockDb
// ---------------------------------------------------------------------------

function parseListQuery(query, { searchColumns = [], allowedSorts = null, defaultSort = 'id', defaultOrder = 'DESC' } = {}) {
  const conditions = [];
  const params = [];
  let idx = 1;
  for (const [key, value] of Object.entries(query || {})) {
    if (['sort', 'order', 'page', 'page_size', 'format', 'search', 'columns'].includes(key)) continue;
    if (value == null || value === '') continue;
    if (!/^[a-z_][a-z0-9_.]*$/i.test(key)) continue; // identifier injection guard
    conditions.push(`${key} = $${idx++}`);
    params.push(value);
  }
  if (query && query.search && searchColumns.length) {
    const clause = searchColumns.map((c) => `${c} ILIKE $${idx++}`).join(' OR ');
    params.push(`%${query.search}%`);
    conditions.push(`(${clause})`);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  let sort = query && query.sort ? query.sort : defaultSort;
  if (allowedSorts && !allowedSorts.includes(sort)) sort = defaultSort;
  if (!/^[a-z_][a-z0-9_.]*$/i.test(sort)) sort = defaultSort;
  const order = query && ['ASC', 'DESC'].includes(String(query.order || '').toUpperCase())
    ? String(query.order).toUpperCase() : defaultOrder;
  const page = Math.max(1, parseInt((query && query.page) || 1, 10) || 1);
  const pageSizeRaw = parseInt((query && query.page_size) || 100, 10);
  const pageSize = Math.min(1000, Math.max(1, isNaN(pageSizeRaw) ? 100 : pageSizeRaw));
  return { where, params, order: ` ORDER BY ${sort} ${order}`, page, pageSize };
}

// ---------------------------------------------------------------------------
// Export renderers — the SAME filtered result set the UI shows
// ---------------------------------------------------------------------------

function csvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows, columns) {
  const header = columns.map(([, label]) => csvField(label)).join(',');
  const lines = [header];
  for (const row of rows) {
    lines.push(columns.map(([key]) => csvField(row[key])).join(','));
  }
  // BOM so Excel opens the UTF-8 CSV correctly.
  return '\uFEFF' + lines.join('\n');
}

// Permission-aware column filter — internal-only columns are stripped unless
// the viewer holds internal financial authority.
function visibleColumns(columns, user) {
  const showInternal = user && ['owner', 'admin', 'finance_manager'].includes(user.role);
  return columns.filter(([, , tag]) => !tag || tag !== 'internal' || showInternal);
}

// Branded PDF of the filtered set.
async function toPdf({ reportKey, label, columns, rows, user, projectName }) {
  const { renderDocument } = require('./procurementPdf');
  const vis = visibleColumns(columns, user);
  return renderDocument({
    docType: `REPORT — ${label}`,
    number: String(reportKey).toUpperCase(),
    date: new Date(),
    meta: [
      ...(projectName ? [['Project', projectName]] : []),
      ['Rows', String(rows.length)],
      ['Generated for', user && user.name ? user.name : '-'],
    ],
    columns: vis.map(([, header]) => header),
    rows: rows.map((row) => vis.map(([key]) => String(row[key] == null ? '-' : row[key]).slice(0, 60))),
  });
}

module.exports = {
  REPORTS,
  REPORT_PACKS,
  parseListQuery,
  toCsv,
  csvField,
  visibleColumns,
  toPdf,
};
