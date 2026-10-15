'use strict';

function integerParam(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function parsePagination(query = {}) {
  const requestedLimit = integerParam(query.limit, 200);
  const requestedOffset = integerParam(query.offset, 0);
  return {
    limit: Math.min(1000, Math.max(1, requestedLimit)),
    offset: Math.max(0, requestedOffset),
  };
}

function orderClause(orderBy = [], tieBreaker = 'id') {
  if (!Array.isArray(orderBy) || !orderBy.length) throw new TypeError('pagination order is required');
  if (!/^[a-z_][a-z0-9_.]*$/i.test(tieBreaker || '')) throw new TypeError('Unsafe pagination tie-breaker');
  const normalized = orderBy.map(({ column, direction = 'ASC' }) => {
    if (!/^[a-z_][a-z0-9_.]*$/i.test(column || '') || !['ASC', 'DESC'].includes(String(direction).toUpperCase())) {
      throw new TypeError('Unsafe pagination order');
    }
    return `${column} ${String(direction).toUpperCase()}`;
  });
  if (!orderBy.some(({ column }) => String(column).split('.').pop().toLowerCase() === tieBreaker.split('.').pop().toLowerCase())) {
    normalized.push(`${tieBreaker} ASC`);
  }
  return normalized.join(', ');
}

function withoutTopLevelOrderBy(sql) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let orderStart = -1;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) {
        if (quote === "'" && sql[index + 1] === "'") index += 1;
        else quote = null;
      }
      continue;
    }
    if (char === '\'' || char === '"') { quote = char; continue; }
    if (char === '(') { depth += 1; continue; }
    if (char === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && /^ORDER\s+BY\b/i.test(sql.slice(index))
      && (index === 0 || !/[a-z0-9_]/i.test(sql[index - 1]))) orderStart = index;
  }
  return orderStart < 0 ? sql.trim() : sql.slice(0, orderStart).trim();
}

async function queryPaginated(req, res, query, { sql, params = [], orderBy, tieBreaker = 'id' }) {
  if (typeof query !== 'function' || typeof sql !== 'string' || !sql.trim()) throw new TypeError('pagination query and SQL are required');
  const { limit, offset } = parsePagination(req.query);
  const order = orderClause(orderBy, tieBreaker);
  const baseSql = withoutTopLevelOrderBy(sql.trim().replace(/;$/, ''));
  if (/\b(?:LIMIT|OFFSET)\b/i.test(baseSql)) throw new TypeError('Pass unbounded list SQL to queryPaginated');
  const count = await query(`SELECT COUNT(*)::bigint AS total FROM (${baseSql}) AS pagination_count`, params);
  const pageParams = [...params, limit, offset];
  const result = await query(
    `${baseSql} ORDER BY ${order} LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );
  const total = Number(count.rows[0]?.total || 0);
  res.setHeader('X-Total-Count', String(total));
  return { rows: result.rows, total, limit, offset };
}

function paginateRows(req, res, rows, { orderBy = [{ column: 'id' }], tieBreaker = 'id', preserveOrder = false } = {}) {
  if (!Array.isArray(rows)) throw new TypeError('pagination rows must be an array');
  const { limit, offset } = parsePagination(req.query);
  orderClause(orderBy, tieBreaker); // validate the caller's identifiers and directions
  const terms = [...orderBy];
  if (!terms.some(({ column }) => column.split('.').pop().toLowerCase() === tieBreaker.split('.').pop().toLowerCase())) {
    terms.push({ column: tieBreaker, direction: 'ASC' });
  }
  const valueAt = (row, column) => (row != null && typeof row === 'object' ? row[column.split('.').pop()] : row);
  const sorted = preserveOrder ? [...rows] : [...rows].sort((left, right) => {
    for (const { column, direction = 'ASC' } of terms) {
      const a = valueAt(left, column);
      const b = valueAt(right, column);
      if (a == null && b == null) continue;
      if (a == null) return 1;
      if (b == null) return -1;
      const comparison = typeof a === 'number' && typeof b === 'number'
        ? a - b
        : String(a).localeCompare(String(b), undefined, { numeric: true });
      if (comparison) return String(direction).toUpperCase() === 'DESC' ? -comparison : comparison;
    }
    return 0;
  });
  res.setHeader('X-Total-Count', String(rows.length));
  return { rows: sorted.slice(offset, offset + limit), total: rows.length, limit, offset };
}

module.exports = { parsePagination, orderClause, withoutTopLevelOrderBy, queryPaginated, paginateRows };
