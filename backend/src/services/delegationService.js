// Phase 5.1 (spec 04) — the ENFORCEMENT side of delegation of authority.
//
// The row store and its CRUD live in services/orgService.js. This service answers the questions the
// policy engine and any approval surface need, with every gate checked HERE so the rules stay in
// exactly one place:
//   * the delegation row is is_active,
//   * the window matches: compare CALENDAR dates in SQL (valid_from <= $now <= valid_to) so the
//     answer never depends on how the node process renders a DATE object in local time,
//   * the module_scope covers the module being judged ('*' covers everything; a named scope covers
//     its own module only — delegation currently AMPLIFIES approvals only, see services/policy.js),
//   * max_amount (NULL = unlimited) is never exceeded by the amount being decided — when an amount
//     is known (it is resolved for approval records by policy.js); an unknown amount is never refused.
//
// FAIL-CLOSED CONTRACT (asserted in fail-closed.pg.test.js + org-rbac-5-1.pg.test.js): a user with NO
// role rows at all is never amplified by policy — the policy hook checks that BEFORE consulting the
// delegation table, and lookupDelegation itself stays a pure row-finder that grants nothing by itself.
'use strict';

// UTC calendar day as YYYY-MM-DD — the same calendar the DATE values were written from
// (the routes use toISOString().slice(0, 10)). `now` may be a Date or an ISO string (tests).
function dayOf(v) {
  if (v == null) return new Date().toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return new Date(v).toISOString().slice(0, 10);
}

// JS-side window check (kept for pure-logic callers; the SQL finders enforce the window in the query).
function rowMatchesWindow(row, today = Date.now()) {
  const day = dayOf(today);
  // PostgreSQL hands a DATE back as a local-time Date; shift back to the calendar day it names.
  const from = row.valid_from instanceof Date
    ? new Date(row.valid_from.getTime() + row.valid_from.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    : dayOf(row.valid_from);
  const to = row.valid_to instanceof Date
    ? new Date(row.valid_to.getTime() + row.valid_to.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    : dayOf(row.valid_to);
  return from <= day && day <= to;
}

// Pure row-finder: returns the active, in-window, in-scope delegation for
// (delegate, delegator, module, amount) or null. No side effects.
async function lookupDelegation(q, delegateUserId, delegatorUserId, { module: moduleScope = null, amount = null, now = null } = {}) {
  const rows = (await q(
    `SELECT * FROM delegations
      WHERE delegate_user_id = $1 AND delegate_from_user_id = $2 AND is_active = true
        AND valid_from <= $3::date AND valid_to >= $3::date`,
    [Number(delegateUserId), Number(delegatorUserId), dayOf(now)]
  )).rows;
  for (const row of rows) {
    if (moduleScope != null && row.module_scope !== '*' && row.module_scope !== moduleScope) continue;
    if (row.max_amount != null && amount != null && Number(amount) > Number(row.max_amount)) continue;
    return row;
  }
  return null;
}

// The policy hook's finder: every ACTIVE delegation naming this delegate whose scope covers the
// module and whose window contains the caller's "now" (so the semantics stay testable); rows come
// back oldest-first for stable behaviour.
async function findActiveForDelegate(q, delegateUserId, { module: moduleScope = null, amount = null, now = null } = {}) {
  const rows = (await q(
    `SELECT * FROM delegations
      WHERE delegate_user_id = $1 AND is_active = true
        AND valid_from <= $2::date AND valid_to >= $2::date
      ORDER BY id`,
    [Number(delegateUserId), dayOf(now)]
  )).rows;
  return rows.filter((row) =>
    (moduleScope == null || row.module_scope === '*' || row.module_scope === moduleScope)
    && !(row.max_amount != null && amount != null && Number(amount) > Number(row.max_amount))
  );
}

module.exports = {
  lookupDelegation,
  findActiveForDelegate,
  rowMatchesWindow,
};
