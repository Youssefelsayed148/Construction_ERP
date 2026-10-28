'use strict';

// Admin configuration routes added in closeout session G (cost-code and contract edits, workflow-template editor).
// Each edit writes back the values it read, so the shared throwaway database is left behaving as before.
const { group } = require('./util');

const costCode = ctx => ctx.api('POST', '/api/costing/codes', { code: `R02-${ctx.n()}`, name: `r02 cost code ${ctx.n()}` });

module.exports = {
  ...group(['POST /api/costing/codes'], async ctx => ({
    body: { code: `R02-${ctx.n()}`, name: `r02 cost code ${ctx.n()}` }, status: 201,
  })),
  ...group(['PUT /api/costing/codes/:id'], async ctx => ({
    params: { id: (await costCode(ctx)).id }, body: { name: `r02 renamed ${ctx.n()}` },
  })),
  ...group(['PUT /api/commercial/contracts/:id'], async ctx => {
    const contract = await ctx.api('POST', '/api/commercial/contracts', { project_id: ctx.pid, original_value: 1000, advance_percent: 0, title: `r02 contract ${ctx.n()}` });
    return { params: { id: contract.id }, body: { title: `r02 contract edited ${ctx.n()}` } };
  }),
  ...group(['PUT /api/workflow-templates/:id'], async ctx => {
    const template = await ctx.one('SELECT id, is_active FROM workflow_templates ORDER BY id LIMIT 1');
    return { params: { id: template.id }, body: { is_active: template.is_active } };
  }),
  ...group(['PUT /api/workflow-templates/:id/steps/:stepId'], async ctx => {
    const step = await ctx.one('SELECT id, template_id, resolver_value, sla_hours FROM workflow_steps ORDER BY id LIMIT 1');
    return { params: { id: step.template_id, stepId: step.id }, body: { resolver_value: step.resolver_value, sla_hours: step.sla_hours } };
  }),
};
