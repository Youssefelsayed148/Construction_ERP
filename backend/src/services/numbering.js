// Document numbering (Phase 2.4). The one place that builds PR-00012 / NCR-2026-0004 style numbers.
//
// Never derive a number from COUNT(*) or MAX()+1 of the target table: two requests read the
// same value and one dies on the UNIQUE index, and deleting a row hands the same number out again.
// A counter row per scope is incremented atomically instead:
//     UPDATE document_counters SET last_value = last_value + 1 WHERE scope_key = $1 RETURNING last_value
// Concurrent callers queue on that row lock. Run inside the caller's transaction (pass the
// transaction client as `q`) and a rolled-back document gives its number back; outside a
// transaction a number may be skipped but is never reused (gap-tolerant).
//
// The first time a scope is used the counter is seeded from the highest number already in the
// target table, so existing data keeps working. After that the table is never scanned again.
//
//   const number = await nextNumber(q, { table: 'purchase_requests', column: 'request_number', prefix: 'PR', pad: 5 });
//   // -> 'PR-00013'
//   await nextNumber(q, { table: 'ncrs', column: 'ncr_number', prefix: `NCR-${year}`, pad: 4 });
//   // -> 'NCR-2026-0004'   (the year is part of the prefix, so each year has its own counter)
//   await nextNumber(q, { table: 'boq_items', column: 'code', prefix: 'BOQ', pad: 4, where: { project_id: 12 } });
//   // -> per-project counter
const IDENT = /^[a-z_][a-z0-9_]*$/i;

function ident(name) {
  if (!IDENT.test(name)) throw new Error(`numbering: unsafe identifier ${JSON.stringify(name)}`);
  return name;
}

const escapeLike = (s) => String(s).replace(/[\\%_]/g, '\\$&');

function scopeKey({ table, column, prefix, sep, where }) {
  const w = where ? Object.keys(where).sort().map((k) => `${k}=${where[k]}`).join(',') : '';
  return `${table}.${column}|${prefix}${sep}|${w}`;
}

// Highest numeric suffix already stored for this prefix (and filters), or 0.
async function existingMax(q, { table, column, prefix, sep, where }) {
  const params = [`${escapeLike(prefix)}${escapeLike(sep)}%`];
  let sql = `SELECT ${ident(column)} AS n FROM ${ident(table)} WHERE ${ident(column)} LIKE $1`;
  for (const [col, value] of Object.entries(where || {})) {
    params.push(value);
    sql += ` AND ${ident(col)} = $${params.length}`;
  }
  const rows = (await q(sql, params)).rows;
  let max = 0;
  for (const { n } of rows) {
    const m = /(\d+)$/.exec(String(n));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

// Increment the counter row for `key`. `seed` (async, returns the highest value already issued in
// that scope) is only called the first time a scope is used.
async function bumpCounter(q, key, seed) {
  const bumped = await q(
    'UPDATE document_counters SET last_value = last_value + 1 WHERE scope_key = $1 RETURNING last_value',
    [key]
  );
  if (bumped.rows[0]) return Number(bumped.rows[0].last_value);

  const start = await seed();
  // Two first-time callers both get here: the second one's conflict branch increments instead.
  const created = await q(
    `INSERT INTO document_counters (scope_key, last_value) VALUES ($1, $2)
     ON CONFLICT (scope_key) DO UPDATE SET last_value = document_counters.last_value + 1
     RETURNING last_value`,
    [key, start + 1]
  );
  return Number(created.rows[0].last_value);
}

async function nextSequence(q, spec) {
  return bumpCounter(q, scopeKey(spec), () => existingMax(q, spec));
}

async function nextNumber(q, { table, column, prefix, pad = 4, sep = '-', where = null }) {
  ident(table); ident(column);
  const seq = await nextSequence(q, { table, column, prefix, sep, where });
  return `${prefix}${sep}${String(seq).padStart(pad, '0')}`;
}

module.exports = { nextNumber, nextSequence, bumpCounter, existingMax, scopeKey };
