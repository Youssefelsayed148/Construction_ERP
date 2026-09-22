// Phase 24 tests — reporting engine: the list contract (filter/sort/page),
// the permission-aware export column filter (client-facing exports never
// include internal cost columns), the CSV export, the report packs, and the
// zero-record contract.

const reporting = require('../../utils/reporting');

const OWNER = { id: 1, name: 'Owner', role: 'owner' };
const CLIENT = { id: 30, name: 'Client Rep', role: 'client' };
const CONSULTANT = { id: 20, name: 'Consultant Rep', role: 'consultant' };

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe('report catalog', () => {
  test('covers the required modules with labelled columns', () => {
    for (const key of ['projects', 'quality_tests', 'ncrs', 'wirs', 'schedule_activities',
      'project_documents', 'purchase_orders', 'variations', 'invoices', 'employees']) {
      expect(reporting.REPORTS[key]).toBeTruthy();
      expect(reporting.REPORTS[key].label).toBeTruthy();
      expect(reporting.REPORTS[key].columns.length).toBeGreaterThan(0);
    }
  });

  test('the three report packs are pre-configured', () => {
    expect(reporting.REPORT_PACKS.commercial.reports).toContain('variations');
    expect(reporting.REPORT_PACKS.procurement.reports).toContain('purchase_orders');
    expect(reporting.REPORT_PACKS.management.reports).toContain('projects');
  });

  test('internal (cost) columns are marked in the catalog', () => {
    expect(reporting.REPORTS.invoices.columns.some(([, , tag]) => tag === 'internal')).toBe(true);
    expect(reporting.REPORTS.employees.columns.every(([, , tag]) => tag !== 'internal')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The list contract
// ---------------------------------------------------------------------------

describe('list contract', () => {
  test('consistent filter/sort/page parameters', () => {
    const q = reporting.parseListQuery(
      { status: 'active', sort: 'name', order: 'asc', page: 2, page_size: 25 },
      { defaultSort: 'id' }
    );
    expect(q.where).toBe(' WHERE status = $1');
    expect(q.order).toBe(' ORDER BY name ASC');
    expect(q.page).toBe(2);
    expect(q.pageSize).toBe(25);
  });

  test('sort keys outside the whitelist fall back to the default', () => {
    const q = reporting.parseListQuery({ sort: 'password_hash; DROP TABLE users' }, { allowedSorts: ['status'] });
    expect(q.order).toBe(' ORDER BY id DESC');
  });

  test('free-text search filters over declared columns', () => {
    const q = reporting.parseListQuery({ search: 'tower' }, { searchColumns: ['name_en', 'description'] });
    expect(q.where).toContain('ILIKE');
    expect(q.params).toEqual(['%tower%']);
  });
});

// ---------------------------------------------------------------------------
// Export — permission-aware columns + CSV
// ---------------------------------------------------------------------------

describe('exports', () => {
  const rows = [
    { id: 1, invoice_number: 'INV-001', status: 'sent', amount: 1000, due_date: '2026-04-01' },
    { id: 2, invoice_number: 'INV-002', status: 'paid', amount: 2500.5, due_date: '2026-04-15' },
  ];

  test('a client-facing export never includes internal cost columns', () => {
    const cols = reporting.visibleColumns(reporting.REPORTS.invoices.columns, CLIENT);
    expect(cols.map(([k]) => k)).toEqual(['id', 'invoice_number', 'status']);
    const ownerCols = reporting.visibleColumns(reporting.REPORTS.invoices.columns, OWNER);
    expect(ownerCols.map(([k]) => k)).toContain('amount');
  });

  test('the CSV export renders the same filtered set the UI shows', () => {
    const cols = reporting.visibleColumns(reporting.REPORTS.invoices.columns, OWNER);
    const csv = reporting.toCsv(rows, cols);
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('Invoice');
    expect(lines[1]).toContain('INV-001');
    expect(lines[1]).toContain('1000');
  });

  test('CSV quoting survives commas and quotes', () => {
    const csv = reporting.toCsv([{ id: 1, description: 'honeycombing, "major"' }], [['id', 'ID'], ['description', 'Description']]);
    expect(csv).toContain('"honeycombing, ""major""');
  });
});

// ---------------------------------------------------------------------------
// Zero-record contract
// ---------------------------------------------------------------------------

describe('zero-record contract', () => {
  test('an empty dataset exports a header-only CSV', () => {
    const csv = reporting.toCsv([], reporting.REPORTS.projects.columns);
    expect(csv.replace(/^\uFEFF/, '').trim()).toContain('Project');
  });
});
