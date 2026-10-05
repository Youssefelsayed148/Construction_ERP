// Typed errors of the Phase 5.5 commercial and finance services (error + error_code + error_params, like awardService).
'use strict';

class CommercialError extends Error {
  constructor(status, code, message, params = {}) {
    super(message);
    this.status = status; this.error_code = code; this.error_params = params;
  }
}
const bad = (code, message, params) => new CommercialError(400, code, message, params);
const forbidden = (code, message, params) => new CommercialError(403, code, message, params);
const missing = (code, message, params) => new CommercialError(404, code, message, params);
const conflict = (code, message, params) => new CommercialError(409, code, message, params);

// Maker/checker: ONE configuration line (business_rules 'finance:maker_checker' {"enforced": false} turns it off for a
// single-person company). When it is on, the person who prepared a document is not the one who approves it.
async function makerCheckerEnforced(q) {
  const row = (await q("SELECT rule_value FROM business_rules WHERE rule_key = 'finance:maker_checker'")).rows[0];
  if (!row) return true;
  const value = typeof row.rule_value === 'string' ? JSON.parse(row.rule_value) : row.rule_value;
  return !(value && value.enforced === false);
}

async function assertNotMaker(q, makerId, checkerId, what) {
  if (makerId == null || checkerId == null || Number(makerId) !== Number(checkerId)) return;
  if (!(await makerCheckerEnforced(q))) return;
  throw forbidden('maker_checker_violation', `The person who prepared this ${what} cannot also approve it (maker/checker)`, { document: what });
}

module.exports = { CommercialError, bad, forbidden, missing, conflict, makerCheckerEnforced, assertNotMaker };
