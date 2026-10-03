// Data-cleaning report for NOT VALID constraints.
//
// Migrations add CHECKs and foreign keys NOT VALID when existing rows might break them: the constraint
// is enforced for every new write, but it cannot be VALIDATEd until the old rows are fixed. This lists
// those rows. It only reads. Fixing them is a decision for the data owner (never automatic), after which
// `validateConstraint` (or ALTER TABLE ... VALIDATE CONSTRAINT) turns the constraint fully on.
const quoteIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;
const qualified = (schema, table) => `${quoteIdent(schema)}.${quoteIdent(table)}`;

const INVALID_SQL = `
  SELECT c.oid, c.conname, c.contype, n.nspname AS schema, t.relname AS table_name,
         pg_get_constraintdef(c.oid) AS definition,
         CASE WHEN c.contype = 'c' THEN pg_get_expr(c.conbin, c.conrelid) END AS check_expr,
         CASE WHEN c.contype = 'f' THEN fn.nspname END AS ref_schema,
         CASE WHEN c.contype = 'f' THEN ft.relname END AS ref_table,
         CASE WHEN c.contype = 'f' THEN (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                                          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) END AS cols,
         CASE WHEN c.contype = 'f' THEN (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
                                          JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) END AS ref_cols
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_class ft ON ft.oid = c.confrelid
    LEFT JOIN pg_namespace fn ON fn.oid = ft.relnamespace
   WHERE NOT c.convalidated AND c.contype IN ('c', 'f')
     AND n.nspname NOT IN ('pg_catalog', 'information_schema')
   ORDER BY n.nspname, t.relname, c.conname`;

// WHERE clause (on alias `t`) that selects the rows violating the constraint.
function offenderPredicate(c) {
  if (c.contype === 'c') return { from: `${qualified(c.schema, c.table_name)} t`, where: `NOT (${c.check_expr})` };
  const pairs = c.cols.map((col, i) => `r.${quoteIdent(c.ref_cols[i])} = t.${quoteIdent(col)}`).join(' AND ');
  const notNull = c.cols.map((col) => `t.${quoteIdent(col)} IS NOT NULL`).join(' AND ');   // MATCH SIMPLE: any NULL passes
  return {
    from: `${qualified(c.schema, c.table_name)} t`,
    where: `${notNull} AND NOT EXISTS (SELECT 1 FROM ${qualified(c.ref_schema, c.ref_table)} r WHERE ${pairs})`,
  };
}

// q: (text, params) => Promise<{rows}>. Returns one entry per NOT VALID constraint, with the offender
// count and up to `limit` sample rows.
async function findInvalidConstraints(q, { limit = 20 } = {}) {
  const { rows } = await q(INVALID_SQL);
  const out = [];
  for (const c of rows) {
    const { from, where } = offenderPredicate(c);
    const count = Number((await q(`SELECT count(*) AS n FROM ${from} WHERE ${where}`)).rows[0].n);
    const sample = limit > 0 && count > 0
      ? (await q(`SELECT row_to_json(t) AS r FROM ${from} WHERE ${where} LIMIT ${Number(limit) | 0}`)).rows.map((x) => x.r)
      : [];
    out.push({
      schema: c.schema, table: c.table_name, constraint: c.conname,
      type: c.contype === 'c' ? 'check' : 'foreign_key', definition: c.definition,
      offenders: count, sample,
    });
  }
  return out;
}

// Validates one constraint after the rows are fixed. Refuses while offending rows exist so the error names
// the problem instead of surfacing as a bare ALTER TABLE failure.
async function validateConstraint(q, table, constraint, { schema = 'public' } = {}) {
  const found = (await findInvalidConstraints(q, { limit: 0 })).find(
    (r) => r.schema === schema && r.table === table && r.constraint === constraint);
  if (!found) throw new Error(`${constraint} on ${table} is not a NOT VALID constraint (already validated or unknown)`);
  if (found.offenders > 0) throw new Error(`${constraint} on ${table} still has ${found.offenders} offending row(s); fix them first`);
  await q(`ALTER TABLE ${qualified(schema, table)} VALIDATE CONSTRAINT ${quoteIdent(constraint)}`);
}

module.exports = { findInvalidConstraints, validateConstraint };
