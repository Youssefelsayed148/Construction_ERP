'use strict';

// Happy-path fixtures for the R2 mutation audit registry (mutation-audit.pg.test.js).
// Each entry is `async (ctx) => ({ path, body, status })` and must create its own
// prerequisites on the throwaway database through ctx helpers. No placeholders,
// disabled entries or 4xx allowances. Aliases (v1 mounts) need their own entry.
// Keep one file per route family; add the file name here.
const FAMILIES = ['commercial', 'boq', 'payroll', 'subcontractors', 'procurement', 'materials', 'sitestructure', 'workorders', 'projects', 'site', 'quantities', 'schedule', 'hr', 'hse', 'qhse', 'portal', 'misc', 'approvals', 'agent-auth', 'finance-ledger', 'inventory', 'project-setup', 'documents', 'organizations', 'invoices', 'suppliers', 'assets', 'clients', 'expenses', 'legal', 'payments', 'schedule-extra', 'webhooks', 'items-extra'];

module.exports = Object.assign({}, ...[...FAMILIES, 'consultant', 'handover'].map(name => require(`./${name}`)));
