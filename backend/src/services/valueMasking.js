'use strict';
// Server-side value masking (default-deny): one shared layer, applied by authorize() to every JSON response of a mount that carries
// monetary values. A field is removed unless the caller holds the matching visibility flag (policy.decide().flags). Unknown/missing flags
// mean "hidden". Rules are keyed by policy mount; extend RULES when a new value-bearing module appears.
//   see_client_price         client-facing values: client invoices, payment applications, client contract value, BOQ rates
//   see_subcontractor_price  subcontract values, subcontract payment certificates, work-order rates
//   see_internal_cost        internal cost: costing ledger / cost summaries
const set = (...k) => new Set(k);
const NON_VALUE = /(^|_)id$|percent|pct|count|status|date|number|_no$|code|currency|type|name|method|reference|notes?$|month|year|days/i;
const MONEY = (re) => (k) => re.test(k) && !NON_VALUE.test(k);
// The AP clerk works the payable side and holds no visibility flag (granting see_internal_cost would also open commercial budgets): allow it by role here.
const AP_ROLES = ['accountant_ap'];
const ANY_FINANCE = ['see_client_price', 'see_subcontractor_price', 'see_internal_cost'];
// A rule hides its fields unless the caller holds `flag`, or any of `anyOf`, or one of `allowRoles` (explicit allow-list, default-deny otherwise).
const RULES = Object.freeze({
  invoices: [{ flag: 'see_client_price', keys: set('amount', 'total_paid', 'total_received', 'paid_total', 'open_balance', 'remaining', 'total_amount', 'paid_amount', 'amount_paid', 'balance', 'balance_due', 'outstanding', 'gross_current_work', 'approved_variations_period', 'certified_gross', 'retention_amount', 'advance_recovery', 'other_deductions', 'tax_amount', 'net_amount', 'previous_cumulative', 'cumulative_certified', 'credited_amount') }],
  commercial: [{ flag: 'see_client_price', keys: set('claimed_work', 'claimed_variations', 'claimed_materials', 'certified_work', 'certified_variations', 'certified_materials', 'original_value', 'revised_value', 'advance_amount') }],
  boq: [{ flag: 'see_client_price', keys: set('unit_rate', 'total_price', 'amount') }],
  subcontractors: [{ flag: 'see_subcontractor_price', keys: set('contract_value', 'revised_amount', 'advance_amount', 'net_payable', 'work_value', 'retention_deduction', 'previous_paid', 'penalties', 'materials_deducted', 'total_value', 'amount', 'unit_rate') }],
  'work-orders': [{ flag: 'see_subcontractor_price', keys: set('unit_rate', 'rate', 'total_price', 'total_amount', 'amount') }],
  costing: [{ flag: 'see_internal_cost', test: (k) => /(cost|amount|budget|actual|committed|variance|forecast|total)/i.test(k) && !/(^|_)id$|percent|pct|count|status/i.test(k) }],
  // HR salaries: internal cost holders plus the HR manager (who runs payroll but does not hold see_internal_cost).
  hr: [{ flag: 'see_internal_cost', allowRoles: ['hr_manager'], keys: set('salary', 'basic_salary', 'net_salary', 'gross_salary', 'daily_rate', 'hourly_rate', 'allowances', 'bonus') }],
  payroll: [{ flag: 'see_internal_cost', allowRoles: ['hr_manager'], test: MONEY(/(salary|wage|pay|deduction|allowance|overtime|bonus|net|gross|advance|total|amount|rate)/i) }],
  // Finance ledger and money-moving summaries: any finance flag is enough (AR sees client side, AP/finance see internal cost); no flag = no values.
  'finance-ledger': [{ anyOf: ANY_FINANCE, allowRoles: AP_ROLES, test: MONEY(/(held|released|retained|amount|balance|debit|credit|total|retention|advance|paid|outstanding|net|gross|tax|value|cash|inflow|outflow)/i) }],
  finance: [{ anyOf: ANY_FINANCE, allowRoles: AP_ROLES, test: MONEY(/(amount|balance|debit|credit|total|revenue|profit|cost|paid|outstanding|net|gross|tax|value|cash|income|expense|receivable|payable)/i) }],
  // `month_total` / `total_*` are money here (`total` alone and `*_count` are counts); NON_VALUE's month/year exclusion does not apply to dashboard cards.
  dashboard: [{ anyOf: ANY_FINANCE, test: (k) => /(revenue|profit|receivable|payable|outstanding|cost|budget|amount|balance|income|expense|value|collected|billed|invoiced|_total$|^total_)/i.test(k) && !/(^|_)id$|percent|pct|count|status|projects|items|invoices_|employees/i.test(k) }],
  projects: [{ anyOf: ANY_FINANCE, keys: set('budget', 'budget_amount', 'contract_value', 'estimated_cost', 'actual_cost', 'total_budget', 'contract_amount') }],
  payments: [{ anyOf: ANY_FINANCE, allowRoles: AP_ROLES, keys: set('amount', 'total_amount', 'allocated_amount', 'unallocated_amount', 'base_amount') }],
  expenses: [{ anyOf: ANY_FINANCE, allowRoles: AP_ROLES, keys: set('amount', 'total_amount', 'tax_amount', 'base_amount') }],
});

function ruleKeyTest(rule, key) { return rule.keys ? rule.keys.has(key) : rule.test(key); }

function maskValue(node, denied) {
  if (Array.isArray(node)) { for (const n of node) maskValue(n, denied); return node; }
  if (!node || typeof node !== 'object' || node instanceof Date) return node;
  for (const key of Object.keys(node)) {
    const v = node[key];
    // Only LEAF values are withheld. A matching key that holds an object/array (e.g. dashboard `expenses: { ... }`) is recursed into, never deleted,
    // otherwise screens that read `modules.expenses.month_total` crash on the missing section.
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) maskValue(v, denied);
    else if (denied.some((r) => ruleKeyTest(r, key))) delete node[key];
  }
  return node;
}

// rules for a mount that the caller's flags / roles do NOT satisfy
function satisfied(rule, flags, roleKeys) {
  const f = flags || {};
  if (rule.flag && f[rule.flag] === true) return true;
  if (rule.anyOf && rule.anyOf.some((x) => f[x] === true)) return true;
  if (rule.allowRoles && (roleKeys || []).some((r) => rule.allowRoles.includes(r))) return true;
  return false;
}
function deniedRules(mount, flags, roleKeys) {
  return (RULES[mount] || []).filter((r) => !satisfied(r, flags, roleKeys));
}

function maskPayload(payload, mount, flags, roleKeys) {
  const denied = deniedRules(mount, flags, roleKeys);
  if (!denied.length || !payload || typeof payload !== 'object') return payload;
  // clone so cached/shared objects the handler still holds are never mutated
  return maskValue(JSON.parse(JSON.stringify(payload)), denied);
}

module.exports = { RULES, maskPayload, deniedRules };
