'use strict';
// Server-side value masking (default-deny): one shared layer, applied by authorize() to every JSON response of a mount that carries
// monetary values. A field is removed unless the caller holds the matching visibility flag (policy.decide().flags). Unknown/missing flags
// mean "hidden". Rules are keyed by policy mount; extend RULES when a new value-bearing module appears.
//   see_client_price         client-facing values: client invoices, payment applications, client contract value, BOQ rates
//   see_subcontractor_price  subcontract values, subcontract payment certificates, work-order rates
//   see_internal_cost        internal cost: costing ledger / cost summaries
const set = (...k) => new Set(k);
const RULES = Object.freeze({
  invoices: [{ flag: 'see_client_price', keys: set('amount', 'total_amount', 'paid_amount', 'amount_paid', 'balance', 'balance_due', 'outstanding', 'gross_current_work', 'approved_variations_period', 'certified_gross', 'retention_amount', 'advance_recovery', 'other_deductions', 'tax_amount', 'net_amount', 'previous_cumulative', 'cumulative_certified', 'credited_amount') }],
  commercial: [{ flag: 'see_client_price', keys: set('claimed_work', 'claimed_variations', 'claimed_materials', 'certified_work', 'certified_variations', 'certified_materials', 'original_value', 'revised_value', 'advance_amount') }],
  boq: [{ flag: 'see_client_price', keys: set('unit_rate', 'total_price', 'amount') }],
  subcontractors: [{ flag: 'see_subcontractor_price', keys: set('contract_value', 'revised_amount', 'advance_amount', 'net_payable', 'work_value', 'retention_deduction', 'previous_paid', 'penalties', 'materials_deducted', 'total_value', 'amount', 'unit_rate') }],
  'work-orders': [{ flag: 'see_subcontractor_price', keys: set('unit_rate', 'rate', 'total_price', 'total_amount', 'amount') }],
  costing: [{ flag: 'see_internal_cost', test: (k) => /(cost|amount|budget|actual|committed|variance|forecast|total)/i.test(k) && !/(^|_)id$|percent|pct|count|status/i.test(k) }],
});

function ruleKeyTest(rule, key) { return rule.keys ? rule.keys.has(key) : rule.test(key); }

function maskValue(node, denied) {
  if (Array.isArray(node)) { for (const n of node) maskValue(n, denied); return node; }
  if (!node || typeof node !== 'object' || node instanceof Date) return node;
  for (const key of Object.keys(node)) {
    if (denied.some((r) => ruleKeyTest(r, key))) delete node[key];
    else maskValue(node[key], denied);
  }
  return node;
}

// rules for a mount that the caller's flags do NOT satisfy
function deniedRules(mount, flags) {
  return (RULES[mount] || []).filter((r) => !(flags && flags[r.flag] === true));
}

function maskPayload(payload, mount, flags) {
  const denied = deniedRules(mount, flags);
  if (!denied.length || !payload || typeof payload !== 'object') return payload;
  // clone so cached/shared objects the handler still holds are never mutated
  return maskValue(JSON.parse(JSON.stringify(payload)), denied);
}

module.exports = { RULES, maskPayload, deniedRules };
