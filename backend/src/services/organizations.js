// Phase 3 service helper: routes call this when they need to read a
// "client / supplier / subcontractor" row. The helper prefers the new
// `organizations` table when present and falls back to the legacy table
// otherwise. This lets each route migrate to `organizations` one at a time
// without a big-bang cutover.
//
// Until a route is migrated, callers should pass `{ preferOrg: false }` and
// rely on the legacy path. After migration, callers pass `{ preferOrg: true }`
// and the helper resolves to the `organizations` row.
//
// Resolver contract:
//
//   const { rows: [row] } = await service.resolveParty({ type: 'client', id: 7 });
//     → row.code, row.name_ar, row.contact_person, row.tax_id, ...
//     (identical shape regardless of which side answered)
//
//   const { rows: [row] } = await service.resolvePartyByProject(clientId);
//
// All functions accept a query function as the last argument so tests can
// inject a mock without going through the pg pool.

'use strict';

const LEGACY_TYPES = ['client', 'supplier', 'subcontractor'];

function legacyTable(type) {
  if (type === 'client') return 'clients';
  if (type === 'supplier') return 'suppliers';
  if (type === 'subcontractor') return 'subcontractors';
  throw new Error(`organizations.resolveParty: unknown legacy type '${type}'`);
}

function mapTable(type) {
  if (type === 'client') return '_migration_client_org_map';
  if (type === 'supplier') return '_migration_supplier_org_map';
  if (type === 'subcontractor') return '_migration_subcontractor_org_map';
  throw new Error(`organizations.resolveParty: unknown legacy type '${type}'`);
}

// Pick the same columns from both sides so callers don't have to branch.
// Add new columns here as the unified shape grows.
const UNIFIED_COLUMNS = [
  'id',
  'code',
  'name_ar',
  'name_en',
  'contact_person',
  'phone',
  'email',
  'address',
  'city',
  'tax_id',
  'payment_terms',
  'status',
];

function buildUnifiedRow(source, type, side) {
  const row = { __source: side, __type: type };
  for (const col of UNIFIED_COLUMNS) {
    if (col === 'name_en' && source.name_en !== undefined) row.name_en = source.name_en;
    else if (col === 'name_ar') row.name_ar = source.name_ar ?? source.name ?? null;
    else row[col] = source[col] ?? null;
  }
  return row;
}

/**
 * Resolve a legacy party id to a unified-shape row.
 * @param {object} opts
 * @param {'client'|'supplier'|'subcontractor'} opts.type
 * @param {number|string} opts.id — legacy id
 * @param {boolean} [opts.preferOrg=true] — read from organizations first
 * @param {(sql,params)=>Promise<{rows:any[]}>} opts.query — pg-like query
 * @returns {Promise<{row: object|null, source: 'organizations'|'legacy'|'none'}>}
 */
async function resolveParty({ type, id, preferOrg = true, query }) {
  if (!LEGACY_TYPES.includes(type)) {
    throw new Error(`resolveParty: type must be one of ${LEGACY_TYPES.join(', ')}`);
  }
  if (id === null || id === undefined) return { row: null, source: 'none' };

  if (preferOrg) {
    const r = await query(
      `SELECT ${UNIFIED_COLUMNS.join(', ')} FROM organizations o
         JOIN ${mapTable(type)} m ON m.organization_id = o.id
        WHERE m.old_${type}_id = $1`,
      [id]
    );
    if (r.rows && r.rows[0]) {
      return { row: r.rows[0], source: 'organizations' };
    }
  }

  const r = await query(
    `SELECT ${UNIFIED_COLUMNS.join(', ')} FROM ${legacyTable(type)} WHERE id = $1`,
    [id]
  );
  if (r.rows && r.rows[0]) {
    return { row: r.rows[0], source: 'legacy' };
  }
  return { row: null, source: 'none' };
}

/**
 * Given a project's client_id, return the canonical organization row.
 * Routes that have already moved to organizations can call this directly
 * without going through the legacy table.
 *
 * Returns null when projects.client_id is null or unmapped.
 */
async function resolveOrganizationByClientId(clientId, { query }) {
  if (clientId === null || clientId === undefined) return null;
  const r = await query(
    `SELECT o.* FROM organizations o
       JOIN _migration_client_org_map m ON m.organization_id = o.id
      WHERE m.old_client_id = $1`,
    [clientId]
  );
  return r.rows && r.rows[0] ? r.rows[0] : null;
}

/**
 * Given a projects.organization_id, return the legacy client_id (if any)
 * the organization was backfilled from. Returns null if the organization
 * is not backfilled from a legacy client row (e.g. a brand-new
 * organization created post-migration).
 */
async function resolveLegacyClientIdByOrgId(orgId, { query }) {
  if (orgId === null || orgId === undefined) return null;
  const r = await query(
    `SELECT old_client_id FROM _migration_client_org_map WHERE organization_id = $1`,
    [orgId]
  );
  return r.rows && r.rows[0] ? r.rows[0].old_client_id : null;
}

/**
 * Inverse: for a given organization_id, return its legacy supplier_id (if any).
 */
async function resolveLegacySupplierIdByOrgId(orgId, { query }) {
  if (orgId === null || orgId === undefined) return null;
  const r = await query(
    `SELECT old_supplier_id FROM _migration_supplier_org_map WHERE organization_id = $1`,
    [orgId]
  );
  return r.rows && r.rows[0] ? r.rows[0].old_supplier_id : null;
}

/**
 * Inverse: for a given organization_id, return its legacy subcontractor_id (if any).
 */
async function resolveLegacySubcontractorIdByOrgId(orgId, { query }) {
  if (orgId === null || orgId === undefined) return null;
  const r = await query(
    `SELECT old_subcontractor_id FROM _migration_subcontractor_org_map WHERE organization_id = $1`,
    [orgId]
  );
  return r.rows && r.rows[0] ? r.rows[0].old_subcontractor_id : null;
}

/**
 * Sanity check used by tests and ops: report coverage of the backfill.
 *   {
 *     clients: { legacy: N, mapped: N, unmapped: N },
 *     suppliers: { legacy: N, mapped: N, unmapped: N },
 *     subcontractors: { legacy: N, mapped: N, unmapped: N }
 *   }
 */
async function migrationCoverage({ query }) {
  const out = {};
  for (const type of LEGACY_TYPES) {
    const legacyTableName = legacyTable(type);
    const mapTableName = mapTable(type);
    const oldIdCol = `old_${type}_id`;
    const [legacy, mapped] = await Promise.all([
      query(`SELECT COUNT(*)::int AS cnt FROM ${legacyTableName}`),
      query(`SELECT COUNT(*)::int AS cnt FROM ${mapTableName}`),
    ]);
    const legacyCount = legacy.rows[0].cnt;
    const mappedCount = mapped.rows[0].cnt;
    out[type] = {
      legacy: legacyCount,
      mapped: mappedCount,
      unmapped: legacyCount - mappedCount,
    };
  }
  return out;
}

module.exports = {
  LEGACY_TYPES,
  UNIFIED_COLUMNS,
  resolveParty,
  resolveOrganizationByClientId,
  resolveLegacyClientIdByOrgId,
  resolveLegacySupplierIdByOrgId,
  resolveLegacySubcontractorIdByOrgId,
  migrationCoverage,
};
