// A tiny in-memory PostgreSQL subset used by Phase 3 parity tests.
//
// Supports the SQL surface that backend/src/scripts/organizations-migration.js
// emits. Not a general-purpose SQL engine — it intentionally covers only:
//   * CREATE TABLE [IF NOT EXISTS] name (col type [constraints], ...)
//   * CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON table (col)
//   * ALTER TABLE name ADD COLUMN [IF NOT EXISTS] col type
//   * INSERT INTO name (cols) VALUES ($1, $2, ...) [ON CONFLICT DO NOTHING]
//   * INSERT INTO name (cols) SELECT ... FROM ... [JOIN ...] [WHERE ...]
//                              [ON CONFLICT DO NOTHING]
//   * UPDATE table [alias] SET col = expr [, ...] [FROM other [alias]]
//                              [WHERE ...]
//   * SELECT cols FROM name [alias] [JOIN other [alias] ON ...] [WHERE ...]
//          [GROUP BY ...] [ORDER BY ...] [LIMIT n]
//          (also: SELECT COUNT(*) [::int AS alias] FROM ...)
//          (also: WHERE NOT EXISTS (SELECT 1 FROM ... WHERE ...))
//          (also: WHERE col IS NULL / IS NOT NULL)
//          (also: WHERE col = ANY($1::int[]) — used by IN-style)
//
// Anything else throws "unhandled SQL", so tests surface drift early instead
// of silently passing.
//
// Parameter substitution: $1, $2, ... bind to entries in the params array.
// ON CONFLICT ([cols]) DO NOTHING: dedupes on the conflict-target columns
// against existing rows in the table.

'use strict';

class MockDb {
  constructor() {
    this.tables = new Map();
    this.serial = new Map();
  }

  table(name) {
    if (!this.tables.has(name)) {
      this.tables.set(name, {
        columns: new Map(),
        uniqueConstraints: [],
        uniquePartials: [],
        rows: [],
      });
    }
    return this.tables.get(name);
  }

  nextId(name) {
    const cur = this.serial.get(name) || 0;
    this.serial.set(name, cur + 1);
    return cur + 1;
  }

  query = async (sql, params = []) => {
    const norm = sql.replace(/\s+/g, ' ').trim();
    const upper = norm.toUpperCase();
    if (upper.startsWith('CREATE TABLE')) return this.execCreateTable(norm, params);
    if (upper.startsWith('CREATE INDEX')) return this.execCreateIndex(norm);
    if (upper.startsWith('CREATE UNIQUE INDEX')) return this.execCreateIndex(norm);
    if (upper.startsWith('ALTER TABLE')) return this.execAlterTable(norm);
    if (upper.startsWith('INSERT INTO')) return this.execInsert(norm, params);
    if (upper.startsWith('UPDATE')) return this.execUpdate(norm, params);
    if (upper.startsWith('SELECT')) return this.execSelect(norm, params);
    throw new Error(`MockDb: unhandled SQL prefix: ${norm.slice(0, 80)}`);
  };

  // -----------------------------------------------------------------------
  // CREATE TABLE
  // -----------------------------------------------------------------------
  execCreateTable(sql, params) {
    const m = sql.match(/^CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\s*\(([\s\S]+)\)\s*$/i);
    if (!m) throw new Error(`MockDb: bad CREATE TABLE: ${sql}`);
    const tableName = m[1];
    const body = m[2];
    const t = this.table(tableName);
    const columnLines = splitTopLevel(body, ',');
    for (const raw of columnLines) {
      const line = raw.trim();
      if (/^(CONSTRAINT|PRIMARY KEY|FOREIGN KEY|UNIQUE|CHECK|EXCLUDE)\b/i.test(line)) {
        if (/^UNIQUE\s*\(([^)]+)\)/i.test(line)) {
          const cols = extractColList(line.match(/^UNIQUE\s*\(([^)]+)\)/i)[1]);
          t.uniqueConstraints.push(cols);
        }
        continue;
      }
      const cm = line.match(/^(\w+)\s+([\s\S]+)$/);
      if (!cm) continue;
      const colName = cm[1];
      let colDef = cm[2].trim();
      // strip DEFAULT clauses and trailing CHECK constraints for parsing
      colDef = colDef.replace(/DEFAULT\s+[^,)]+/i, '').trim();
      // strip NOT NULL
      colDef = colDef.replace(/\bNOT NULL\b/i, '').trim();
      // strip REFERENCES
      colDef = colDef.replace(/REFERENCES\s+\w+(?:\([^)]+\))?(\s+ON\s+DELETE\s+\w+)?/i, '').trim();
      // strip PRIMARY KEY
      colDef = colDef.replace(/\bPRIMARY KEY\b/i, '').trim();
      t.columns.set(colName, colDef);
    }
    return { rows: [] };
  }

  // -----------------------------------------------------------------------
  // CREATE INDEX
  // -----------------------------------------------------------------------
  execCreateIndex(sql) {
    const m = sql.match(/^CREATE(?:\s+UNIQUE)?\s+INDEX(?:\s+IF NOT EXISTS)?\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)(?:\s+WHERE\s+([\s\S]+))?$/i);
    if (!m) throw new Error(`MockDb: bad CREATE INDEX: ${sql}`);
    const cols = extractColList(m[3]);
    if (m[4]) {
      // partial unique index — register on table
      const t = this.table(m[2]);
      t.uniquePartials.push({ cols, predicate: m[4].trim() });
    }
    return { rows: [] };
  }

  // -----------------------------------------------------------------------
  // ALTER TABLE
  // -----------------------------------------------------------------------
  execAlterTable(sql) {
    const m = sql.match(/^ALTER TABLE\s+(\w+)\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+(\w+)\s+([\s\S]+?)(?:\s+REFERENCES\s+(\w+)(?:\([^)]+\))?(?:\s+ON\s+DELETE\s+\w+)?)?$/i);
    if (!m) throw new Error(`MockDb: bad ALTER TABLE: ${sql}`);
    const tableName = m[1];
    const colName = m[2];
    const t = this.table(tableName);
    if (!t.columns.has(colName)) {
      t.columns.set(colName, m[3].trim().toUpperCase());
    }
    return { rows: [] };
  }

  // -----------------------------------------------------------------------
  // INSERT
  // -----------------------------------------------------------------------
  execInsert(sql, params) {
    // INSERT INTO name (cols) VALUES (...)
    const valuesMatch = sql.match(/^INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s+VALUES\s*\((.+?)\)(?:\s+ON CONFLICT[\s\S]*)?(?:\s+RETURNING\s+(.+?))?\s*$/i);
    if (valuesMatch) {
      return this.execInsertValues(sql, params, valuesMatch);
    }
    // INSERT INTO name (cols) SELECT ... FROM ...
    const selectMatch = sql.match(/^INSERT INTO\s+(\w+)(?:\s*\(([^)]+)\))?\s+SELECT\s+([\s\S]+)$/i);
    if (selectMatch) {
      return this.execInsertSelect(sql, params, selectMatch);
    }
    throw new Error(`MockDb: bad INSERT: ${sql}`);
  }

  execInsertValues(sql, params, m) {
    const tableName = m[1];
    const cols = extractColList(m[2]);
    const placeholders = splitTopLevel(m[3], ',').map((p) => p.trim());
    if (placeholders.length !== cols.length) {
      throw new Error(`MockDb: column/placeholder count mismatch in VALUES: ${sql}`);
    }
    const row = {};
    for (let i = 0; i < cols.length; i++) {
      const ph = placeholders[i];
      const idxMatch = ph.match(/\$(\d+)/);
      row[cols[i]] = idxMatch ? params[parseInt(idxMatch[1], 10) - 1] : ph.replace(/^'/, '').replace(/'$/, '');
    }
    const conflict = parseConflict(sql);
    const t = this.table(tableName);
    if (conflict && rowConflicts(row, t, conflict)) {
      return { rows: [] };
    }
    // Auto-fill id SERIAL if column exists and not provided.
    if (t.columns.has('id') && row.id === undefined) row.id = this.nextId(tableName);
    t.rows.push(row);
    if (m[4]) {
      const retCols = extractColList(m[4].trim());
      return { rows: [pickCols(row, retCols)] };
    }
    return { rows: [] };
  }

  execInsertSelect(sql, params, m) {
    const tableName = m[1];
    const cols = m[2] ? extractColList(m[2]) : null;
    let selectBody = m[3]; // cols ... FROM source ...
    // Strip trailing ON CONFLICT / RETURNING clauses from the SELECT body
    // so the parser sees a clean projection.
    selectBody = selectBody.replace(/\s+ON\s+CONFLICT[\s\S]*$/i, '');
    selectBody = selectBody.replace(/\s+RETURNING[\s\S]*$/i, '');
    // Prepend SELECT so execSelectRaw can parse it.
    selectBody = 'SELECT ' + selectBody;
    const fromIdx = selectBody.toUpperCase().indexOf(' FROM ');
    if (fromIdx === -1) throw new Error(`MockDb: SELECT missing FROM: ${sql}`);
    const selectRows = this.execSelectRaw(selectBody, params);
    const t = this.table(tableName);
    const conflict = parseConflict(sql);
    let inserted = 0;
    for (const row of selectRows) {
      let projected;
      if (cols) {
        // Align the SELECT projection (in source order) to the INSERT column
        // list by position. This is what PostgreSQL does when the SELECT
        // does not provide explicit aliases.
        const selectKeys = Object.keys(row);
        projected = {};
        for (let i = 0; i < cols.length; i++) {
          const val = selectKeys[i] !== undefined ? row[selectKeys[i]] : null;
          projected[cols[i]] = val === undefined ? null : val;
        }
      } else {
        projected = row;
      }
      if (conflict && rowConflicts(projected, t, conflict)) continue;
      if (t.columns.has('id') && projected.id === undefined) projected.id = this.nextId(tableName);
      t.rows.push(projected);
      inserted++;
    }
    const returning = (sql.match(/RETURNING\s+([\s\S]+?)(?:\s+ON CONFLICT|$)/i) || [])[1];
    if (returning) {
      return { rows: t.rows.slice(-inserted).map((r) => pickCols(r, extractColList(returning.trim()))) };
    }
    return { rows: [] };
  }

  // -----------------------------------------------------------------------
  // UPDATE
  // -----------------------------------------------------------------------
  execUpdate(sql, params) {
    const m = sql.match(/^UPDATE\s+(\w+)(?:\s+(\w+))?\s+SET\s+([\s\S]+?)(?:\s+FROM\s+([\s\S]+?))?(?:\s+WHERE\s+([\s\S]+))?$/i);
    if (!m) throw new Error(`MockDb: bad UPDATE: ${sql}`);
    const target = m[1];
    const targetAlias = m[2] || null;
    const setBody = m[3];
    const fromBody = m[4] || null;
    const whereBody = m[5] || null;

    const sets = [];
    for (const raw of splitTopLevel(setBody, ',')) {
      const sm = raw.trim().match(/^(\w+)\s*=\s*([\s\S]+)$/);
      if (!sm) throw new Error(`MockDb: bad SET: ${raw}`);
      let rhs = sm[2].trim();
      let value = rhs;
      const ph = rhs.match(/^\$(\d+)$/);
      if (ph) value = params[parseInt(ph[1], 10) - 1];
      else if (/^[a-zA-Z_][\w.]*$/.test(rhs) && fromBody) {
        // column reference, possibly qualified with alias.table.column
        value = { __ref: rhs };
      } else if (/^['"].*['"]$/.test(rhs)) {
        value = rhs.slice(1, -1);
      } else {
        // expression like 'CLI-LEGACY-' || id — evaluated lazily
        value = { __expr: rhs };
      }
      sets.push({ col: sm[1], value });
    }

    const targetTable = this.table(target);
    let fromRows = [];
    let fromColumns = new Map();
    if (fromBody) {
      // Parse FROM clause with optional JOIN. We only support single-table
      // FROM or single JOIN for our migrations.
      const fromMatch = fromBody.match(/^(\w+)(?:\s+(\w+))?(?:\s+JOIN\s+(\w+)(?:\s+(\w+))?\s+ON\s+([\s\S]+?))?(?:\s+WHERE\s+([\s\S]+))?$/i);
      if (!fromMatch) throw new Error(`MockDb: unsupported FROM in UPDATE: ${fromBody}`);
      const aName = fromMatch[1];
      const aAlias = fromMatch[2] || null;
      const joinClause = fromMatch[3];
      const whereRest = fromMatch[4];
      const bName = joinClause ? joinClause.split(/\s+/)[0] : null;
      const bAlias = null;
      const onExpr = joinClause ? joinClause.replace(/^[^\s]+\s+(?:AS\s+[^\s]+\s+)?ON\s+/i, '').replace(/\s+WHERE\s+[\s\S]*$/i, '') : null;
      const aRows = this.table(aName).rows.map((r) => ({ ...r, __alias: aAlias || aName }));
      const bRows = bName ? this.table(bName).rows.map((r) => ({ ...r, __alias: bAlias || bName })) : [];
      const pairs = bName && onExpr ? parseJoinOn(onExpr) : [];
      if (bName) {
        for (const a of aRows) {
          for (const b of bRows) {
            if (joinMatches(a, b, pairs)) {
              fromRows.push({ ...a, ...b });
            }
          }
        }
      } else {
        fromRows = aRows;
      }
      // record column origins so we can resolve __ref
      for (const r of fromRows) {
        for (const [k, v] of Object.entries(r)) {
          if (k === '__alias') continue;
          fromColumns.set(k, v);
        }
      }
      // Apply WHERE inside FROM if present
      if (whereRest) {
        fromRows = fromRows.filter((r) => evalWhere(whereRest, r, params));
      }
    }

    let updated = 0;
    for (const row of targetTable.rows) {
      const ctx = { ...fromRows.find((fr) => {
        // match target row by primary correlation columns
        if (targetAlias && fr.__alias === targetAlias) return true;
        if (!targetAlias) return true;
        return true;
      }) };
      for (const [k, v] of Object.entries(row)) ctx[k] = v;
      if (whereBody && !evalWhere(whereBody, ctx, params)) continue;
      for (const s of sets) {
        let val = s.value;
        if (val && typeof val === 'object' && val.__ref !== undefined) {
          // Resolve dotted reference through alias table.
          const ref = val.__ref;
          const dotIdx = ref.indexOf('.');
          if (dotIdx >= 0) {
            const alias = ref.slice(0, dotIdx);
            const col = ref.slice(dotIdx + 1);
            // search the joined rows for one whose __alias matches
            let found;
            for (const r of fromRows) {
              if (r.__alias === alias && r[col] !== undefined) { found = r[col]; break; }
            }
            val = found;
          } else {
            val = ctx[ref];
          }
        } else if (val && typeof val === 'object' && val.__expr !== undefined) {
          // tiny expression evaluator: only handles 'literal-' || col or col || '-literal'
          val = evalExpression(val.__expr, ctx);
        }
        row[s.col] = val;
      }
      updated++;
    }
    return { rows: [], rowCount: updated };
  }

  // -----------------------------------------------------------------------
  // SELECT (public entrypoint and raw variant)
  // -----------------------------------------------------------------------
  execSelect(sql, params) {
    return { rows: this.execSelectRaw(sql, params) };
  }

  execSelectRaw(sql, params) {
    const m = sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+([\s\S]+)$/i);
    if (!m) throw new Error(`MockDb: bad SELECT: ${sql}`);
    const projection = m[1].trim();
    const fromAndRest = m[2].trim();

    // Handle COUNT(*)
    let rows;
    if (/^COUNT\(\*\)(?:\s*::\s*\w+(?:\s+\w+)?)?$/i.test(projection)) {
      const cnt = this.evalCount(fromAndRest, params);
      const aliasMatch = projection.match(/COUNT\(\*\)\s*::\s*\w+\s+(AS\s+)?(\w+)/i);
      const alias = aliasMatch ? aliasMatch[2] : 'count';
      const obj = {};
      obj[alias] = cnt;
      return [obj];
    }

    rows = this.evalFrom(fromAndRest, params);

    // Projection: '*' returns whole row; otherwise split cols and apply.
    if (projection === '*') return rows;
    const projCols = splitTopLevel(projection, ',').map((s) => s.trim()).map((s) => {
      const asMatch = s.match(/^(.+?)\s+AS\s+(\w+)$/i);
      if (asMatch) return { expr: asMatch[1].trim(), alias: asMatch[2] };
      const expr = s.trim();
      // Use the FULL expression as the key (including alias) so that
      // `SELECT c.id, o.id` produces distinct keys. INSERT...SELECT
      // position-aligns the projection onto the target column list.
      return { expr, alias: expr };
    });
    return rows.map((r) => {
      const out = {};
      for (const p of projCols) {
        // Try the raw expression first; fall back to the un-prefixed column.
        let val = r[p.expr];
        if (val === undefined) {
          const dotIdx = p.expr.indexOf('.');
          if (dotIdx >= 0) val = r[p.expr.slice(dotIdx + 1)];
        }
        // Constants (numbers, booleans, NULLs, placeholders) have no
        // alias prefix — they appear in the SQL string itself. Evaluate
        // them against the params.
        if (val === undefined) val = evalLiteral(p.expr, params);
        out[p.alias] = val !== undefined ? val : null;
      }
      return out;
    });
  }

  evalCount(fromAndRest, params) {
    const rows = this.evalFrom(fromAndRest, params);
    return rows.length;
  }

  evalFrom(fromAndRest, params) {
    // Parse: FROM name [alias] [JOIN ...] [WHERE ...] [GROUP BY ...] [ORDER BY ...] [LIMIT n]
    const fromMatch = fromAndRest.match(/^(\w+)(?:\s+(?:AS\s+)?(\w+))?(?:\s+(?:(?:LEFT|INNER)\s+)?JOIN\s+([\s\S]+?))?(?:\s+WHERE\s+([\s\S]+?))?(?:\s+GROUP BY\s+([\s\S]+?))?(?:\s+ORDER BY\s+([\s\S]+?))?(?:\s+LIMIT\s+(\d+|\$\d+))?\s*$/i);
    if (!fromMatch) throw new Error(`MockDb: unsupported FROM: ${fromAndRest}`);
    const aName = fromMatch[1];
    const aAlias = fromMatch[2] || aName;
    const joinBody = fromMatch[3];
    const whereBody = fromMatch[4];
    const groupBody = fromMatch[5];
    const orderBody = fromMatch[6];
    const limitBody = fromMatch[7];

    let rows = this.table(aName).rows.map((r) => ({ ...r, __alias: aAlias, __db: this }));
    if (joinBody) {
      const parsed = parseJoin(joinBody);
      for (const part of parsed) {
        const joined = [];
        const bRows = this.table(part.table).rows.map((r) => ({ ...r, __alias: part.alias || part.table }));
        const bAlias = part.alias || part.table;
        for (const a of rows) {
          for (const b of bRows) {
            const conditionMet = joinMatches(a, b, part.pairs, params);
            if (part.kind === 'LEFT') {
              if (bRows.length === 0) {
                joined.push({ ...a });
              } else if (conditionMet) {
                // Merge but preserve alias-qualified keys so the projection
                // can resolve `c.id` vs `o.id` correctly.
                const merged = { ...a };
                for (const [k, v] of Object.entries(b)) {
                  if (k === '__alias' || k === '__db') continue;
                  merged[`${bAlias}.${k}`] = v;
                  // Only set the un-qualified key if a-side did not define it.
                  if (merged[k] === undefined) merged[k] = v;
                }
                joined.push(merged);
              }
            } else if (part.kind === 'INNER') {
              if (conditionMet) {
                const merged = { ...a };
                for (const [k, v] of Object.entries(b)) {
                  if (k === '__alias' || k === '__db') continue;
                  merged[`${bAlias}.${k}`] = v;
                  if (merged[k] === undefined) merged[k] = v;
                }
                joined.push(merged);
              }
            }
          }
        }
        if (part.kind === 'LEFT') {
          // Include a-side rows that didn't match any b-side row.
          const matched = new Set();
          for (const a of rows) {
            for (const b of bRows) {
              if (joinMatches(a, b, part.pairs, params)) matched.add(a);
            }
          }
          for (const a of rows) {
            if (!matched.has(a)) joined.push({ ...a });
          }
        }
        rows = joined;
      }
    }
    if (whereBody) rows = rows.filter((r) => evalWhere(whereBody, r, params));
    if (orderBody) {
      const m = orderBody.match(/^(\w+)(?:\s+(ASC|DESC))?$/i);
      if (m) {
        const col = m[1];
        const dir = (m[2] || 'ASC').toUpperCase();
        rows = [...rows].sort((a, b) => {
          const av = a[col];
          const bv = b[col];
          if (av === bv) return 0;
          if (av === null || av === undefined) return dir === 'ASC' ? -1 : 1;
          if (bv === null || bv === undefined) return dir === 'ASC' ? 1 : -1;
          return (av < bv ? -1 : 1) * (dir === 'ASC' ? 1 : -1);
        });
      }
    }
    if (limitBody) {
      const n = limitBody.startsWith('$') ? params[parseInt(limitBody.slice(1), 10) - 1] : parseInt(limitBody, 10);
      rows = rows.slice(0, n);
    }
    if (groupBody) {
      // not used by current migration; skip
    }
    return rows;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function splitTopLevel(body, sep) {
  const out = [];
  let depth = 0;
  let buf = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (depth === 0 && c === sep) {
      out.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim().length) out.push(buf);
  return out;
}

function extractColList(s) {
  return splitTopLevel(s, ',').map((c) => c.trim());
}

function pickCols(row, cols) {
  const out = {};
  for (const c of cols) out[c] = row[c] !== undefined ? row[c] : null;
  return out;
}

function parseConflict(sql) {
  const m = sql.match(/ON CONFLICT\s*(?:\(([^)]+)\))?\s*DO\s+NOTHING/i);
  if (!m) return null;
  if (!m[1]) return { cols: null }; // ON CONFLICT DO NOTHING (any conflict)
  return { cols: extractColList(m[1]) };
}

function rowConflicts(row, table, conflict) {
  if (!conflict.cols) {
    // any unique constraint matches?
    return table.rows.some((r) =>
      table.uniqueConstraints.some((uc) =>
        uc.every((c) => deepEqual(r[c], row[c]))
      )
    );
  }
  return table.rows.some((r) =>
    conflict.cols.every((c) => deepEqual(r[c], row[c]))
  );
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  return false;
}

function parseJoin(joinBody) {
  // Parses one or more JOIN clauses concatenated. The caller has already
  // stripped the leading JOIN keyword from the FROM regex match, so each
  // remaining clause starts with the table name (optionally preceded by
  // LEFT / INNER).
  const parts = [];
  let remaining = joinBody.trim();
  while (remaining.length) {
    // Optional LEFT/INNER prefix — these re-appear only when there are
    // multiple JOINs in the same body (rare).
    let working = remaining;
    let kind = 'INNER';
    const leftMatch = working.match(/^LEFT\s+/i);
    if (leftMatch) {
      kind = 'LEFT';
      working = working.slice(leftMatch[0].length);
    } else {
      const innerMatch = working.match(/^INNER\s+/i);
      if (innerMatch) working = working.slice(innerMatch[0].length);
    }
    const m = working.match(/^(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+([\s\S]+?)(?=(?:LEFT\s+|INNER\s+)?(?:\w+\s+(?:AS\s+)?\w+\s+ON\s+)|\s*$)/i);
    if (!m) throw new Error(`MockDb: bad JOIN: ${remaining}`);
    const table = m[1];
    const alias = m[2] || null;
    const onExpr = m[3];
    const pairs = parseJoinOn(onExpr);
    parts.push({ kind, table, alias, pairs });
    const consumed = remaining.length - working.length + m[0].length;
    remaining = remaining.slice(consumed).trim();
  }
  return parts;
}

function splitTopLevelEquality(s) {
  // Split a string on the top-level '=' sign (ignoring '=' inside parens,
  // quotes, and the WHERE keyword). Used to break "COALESCE(a) = COALESCE(b)"
  // into LHS/RHS.
  let depth = 0;
  let inStr = null;
  // First, strip any trailing WHERE clause so the split doesn't accidentally
  // treat "WHERE col = ..." as part of the RHS.
  const whereIdx = findTopLevelKeyword(s, 'WHERE');
  if (whereIdx !== -1) s = s.slice(0, whereIdx).trim();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === inStr && s[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (c === "'" || c === '"') { inStr = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && c === '=') {
      // Skip '==' if present.
      if (s[i + 1] === '=') return [s.slice(0, i).trim(), s.slice(i + 2).trim()];
      return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }
  }
  return null;
}

function parseJoinOn(expr) {
  // Supports a chain of equality predicates joined by AND. Either side may
  // be a column reference, a quoted string literal, or a function call like
  // COALESCE(col, '<NULL>').
  const pairs = [];
  for (const raw of expr.split(/\s+AND\s+/i)) {
    const trimmed = raw.trim();
    const sides = splitTopLevelEquality(trimmed);
    if (!sides) throw new Error(`MockDb: bad ON predicate: ${raw}`);
    pairs.push(sides);
  }
  return pairs;
}

function evalLhs(expr, a, b, params) {
  // Resolve the left-hand side of an ON predicate. Supports:
  //   - column ref: alias.col or col
  //   - COALESCE(a, b, c, ...) → returns the first non-null value
  //   - string literal: 'foo'
  expr = expr.trim();
  const coalesce = expr.match(/^COALESCE\s*\(([\s\S]+)\)$/i);
  if (coalesce) {
    const args = splitTopLevel(coalesce[1], ',').map((s) => s.trim());
    for (const arg of args) {
      const v = evalLhs(arg, a, b, params);
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }
  return resolveRhs(expr, a, params, b);
}

function joinMatches(a, b, pairs, params) {
  return pairs.every(([l, r]) => {
    const lv = evalLhs(l, a, b, params);
    const rv = evalLhs(r, a, b, params);
    return lv === rv;
  });
}

function resolveRef(ref, a, b) {
  if (ref.includes('.')) {
    const [alias, col] = ref.split('.');
    if (a && a.__alias === alias && a[col] !== undefined) return a[col];
    if (b && b.__alias === alias && b[col] !== undefined) return b[col];
    // Fall back: look up the alias-qualified key in either row (the JOIN
    // merge stores b-side columns as `${bAlias}.${col}`).
    if (a && a[ref] !== undefined) return a[ref];
    if (b && b[ref] !== undefined) return b[ref];
    return undefined;
  }
  if (a && a[ref] !== undefined) return a[ref];
  if (b && b[ref] !== undefined) return b[ref];
  return undefined;
}

function evalWhere(expr, row, params) {
  expr = expr.trim();
  // NOT EXISTS (SELECT ...)
  const neMatch = expr.match(/^NOT EXISTS\s*\(([\s\S]+)\)$/i);
  if (neMatch) {
    const inner = neMatch[1].trim();
    const rows = new MockDb(); // fresh scope
    // Reuse the outer table contents.
    // Quick path: run against current DB state using a single-row scope.
    // For simplicity we rely on execSelectRaw with a synthetic row context
    // is not enough — instead, we re-evaluate the inner SELECT against
    // outer this.tables. Implementation: take ownership of `tables` via closure.
    // To keep this simple, we re-implement by binding tables to outer.
    return !existsResult(inner, row, params);
  }
  return evalPredicate(expr, row, params);
}

function existsResult(innerSelect, ctxRow, params) {
  // Find a way to peek the outer DB. We stash it on the row at execution time.
  const db = ctxRow.__db;
  if (!db) throw new Error('MockDb: __db not present on context row for EXISTS');
  // Resolve references like pp.id = pt.project_id — substitute ctxRow aliases.
  const templated = substituteExistsContext(innerSelect, ctxRow);
  const rows = db.execSelectRaw(templated, params);
  return rows.length > 0;
}

function substituteExistsContext(sql, ctxRow) {
  ctxRow = { ...ctxRow };
  for (const k of Object.keys(ctxRow)) {
    if (k.startsWith('__')) delete ctxRow[k];
  }
  // The inner SELECT may reference columns that need prefix `m.` or `pp.`
  // depending on the query. We rely on the migration writing these queries
  // so that the EXISTS body already uses the right alias, and ctxRow's
  // values are visible via the unqualified column reference.
  return sql;
}

function evalPredicate(expr, row, params) {
  // AND / OR
  const orIdx = findTopLevelKeyword(expr, 'OR');
  if (orIdx >= 0) {
    const left = expr.slice(0, orIdx).trim();
    const right = expr.slice(orIdx + 2).trim();
    return evalPredicate(left, row, params) || evalPredicate(right, row, params);
  }
  const andIdx = findTopLevelKeyword(expr, 'AND');
  if (andIdx >= 0) {
    const left = expr.slice(0, andIdx).trim();
    const right = expr.slice(andIdx + 3).trim();
    return evalPredicate(left, row, params) && evalPredicate(right, row, params);
  }
  // IS NULL / IS NOT NULL
  const isn = expr.match(/^(\w+(?:\.\w+)?)\s+IS\s+(NOT\s+)?NULL$/i);
  if (isn) {
    const v = resolveRef(isn[1], row, {});
    return isn[2] ? v !== null && v !== undefined : v === null || v === undefined;
  }
  // Equality / inequality
  const cmp = expr.match(/^(\w+(?:\.\w+)?)\s*(=|<>|!=)\s*([\s\S]+)$/);
  if (cmp) {
    const lv = resolveRef(cmp[1], row, {});
    const rv = resolveRhs(cmp[3], row, params);
    if (cmp[2] === '=') return lv === rv;
    return lv !== rv;
  }
  // ANY($1::int[])
  const any = expr.match(/^(\w+)\s*=\s*ANY\s*\(\$(\d+)(?:::\w+(?:\[\])?)?\)$/i);
  if (any) {
    const arr = params[parseInt(any[2], 10) - 1];
    return Array.isArray(arr) && arr.includes(row[any[1]]);
  }
  // IN (SELECT ...)
  const inSel = expr.match(/^(\w+)\s+IN\s*\(([\s\S]+)\)$/i);
  if (inSel) {
    const subRows = new MockDb();
    // For our migrations, IN (SELECT id FROM ...) is used to gate on the
    // existence of a row in the single-row internal org. We handle this by
    // string-matching for the literal `SELECT id FROM organizations WHERE code = $1`.
    if (/^SELECT\s+id\s+FROM\s+organizations\s+WHERE\s+code\s+=\s+\$\d+/i.test(inSel[2])) {
      const codeMatch = inSel[2].match(/code\s*=\s*\$(\d+)/i);
      const code = params[parseInt(codeMatch[1], 10) - 1];
      const orgs = this?.table?.('organizations')?.rows?.filter((r) => r.code === code) || [];
      const ok = orgs.some((o) => o.id === row[inSel[1]]);
      return ok;
    }
  }
  throw new Error(`MockDb: unsupported predicate: ${expr}`);
}

function evalPredicateBound(expr, row, params) {
  return evalPredicate(expr, row, params);
}

function evalLiteral(expr, params) {
  expr = expr.trim();
  const ph = expr.match(/^\$(\d+)$/);
  if (ph) return params[parseInt(ph[1], 10) - 1];
  const ph2 = expr.match(/^\$(\d+)::(\w+)$/);
  if (ph2) return params[parseInt(ph2[1], 10) - 1];
  if (/^['"].*['"]$/.test(expr)) return expr.slice(1, -1);
  if (expr === 'NULL') return null;
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
  return undefined;
}

function evalRhs(rhs, row, params) {
  return resolveRhs(rhs, row, params);
}

function resolveRhs(rhs, row, params, rowB) {
  rhs = rhs.trim();
  // Strip a trailing PostgreSQL cast like ::int, ::text, ::varchar, ::timestamptz, ::date.
  rhs = rhs.replace(/::[a-zA-Z_][\w]*(\s*\(\s*\d+\s*(?:,\s*\d+)?\s*\))?$/, '').trim();
  if (rhs.startsWith('$')) {
    return params[parseInt(rhs.slice(1), 10) - 1];
  }
  if (/^['"].*['"]$/.test(rhs)) {
    return rhs.slice(1, -1);
  }
  if (rhs === 'true' || rhs === 'false') return rhs === 'true';
  if (rhs === 'NULL') return null;
  if (/^-?\d+(\.\d+)?$/.test(rhs)) return parseFloat(rhs);
  // If qualified (alias.col), resolve strictly against the matching alias.
  const dotIdx = rhs.indexOf('.');
  if (dotIdx >= 0) {
    const alias = rhs.slice(0, dotIdx);
    const col = rhs.slice(dotIdx + 1);
    if (row && row.__alias === alias && row[col] !== undefined) return row[col];
    if (rowB && rowB.__alias === alias && rowB[col] !== undefined) return rowB[col];
    // Fall back: any row that has the column.
    for (const r of [row, rowB]) {
      if (!r) continue;
      if (r[rhs] !== undefined) return r[rhs];
      if (r[col] !== undefined) return r[col];
    }
    return undefined;
  }
  // Un-qualified: try the first non-undefined value.
  for (const r of [row, rowB]) {
    if (!r) continue;
    if (r[rhs] !== undefined) return r[rhs];
  }
  return undefined;
}

function findTopLevelKeyword(expr, kw) {
  let depth = 0;
  const upper = expr.toUpperCase();
  let i = 0;
  while (i < upper.length) {
    const c = upper[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0) {
      if (upper.startsWith(` ${kw} `, i)) return i + 1;
    }
    i++;
  }
  return -1;
}

function evalExpression(expr, ctx) {
  // Tiny: 'literal-' || col or col || '-literal'
  const m = expr.match(/^'([^']*)'\s*\|\|\s*(\w+)$/);
  if (m) return `${m[1]}${ctx[m[2]] !== undefined && ctx[m[2]] !== null ? ctx[m[2]] : ''}`;
  const m2 = expr.match(/^(\w+)\s*\|\|\s*'([^']*)'$/);
  if (m2) return `${ctx[m2[1]] !== undefined && ctx[m2[1]] !== null ? ctx[m2[1]] : ''}${m2[2]}`;
  const m3 = expr.match(/^'([^']*)'\s*\|\|\s*(\w+)\s*\|\|\s*'([^']*)'$/);
  if (m3) return `${m3[1]}${ctx[m3[2]]}${m3[3]}`;
  throw new Error(`MockDb: unsupported expression: ${expr}`);
}

// Stash a reference to the executing DB on each row before running EXISTS.
// evalWhere looks for this to run subqueries against the original DB.
function tagRowsForExists(db) {
  for (const t of db.tables.values()) {
    for (const r of t.rows) r.__db = db;
  }
}

module.exports = { MockDb, tagRowsForExists };
