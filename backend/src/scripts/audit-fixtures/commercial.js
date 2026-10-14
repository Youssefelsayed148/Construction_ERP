'use strict';

const { group } = require('./util');
let rateDay = 0;
const rateDate = () => new Date(Date.UTC(2040, 0, 1 + rateDay++)).toISOString().slice(0, 10);

const contract = ctx => ctx.api('POST', '/api/commercial/contracts', { project_id: ctx.pid, original_value: 1000, advance_percent: 0, title: `r02 contract ${ctx.n()}` });
const party = async ctx => ctx.api('POST', `/api/commercial/contracts/${(await contract(ctx)).id}/parties`, { party_role: 'employer', name_en: `r02 party ${ctx.n()}` });
const guarantee = ctx => ctx.api('POST', '/api/commercial/guarantees', { guarantee_type: 'performance', project_id: ctx.pid, amount: 100, expires_on: '2030-01-01' });
const insurance = ctx => ctx.api('POST', '/api/commercial/insurances', { insurance_type: 'other', project_id: ctx.pid, policy_number: `r02-pol-${ctx.n()}`, coverage_amount: 1000, expiry_date: '2030-01-01' });
const application = async ctx => ctx.api('POST', '/api/commercial/payment-applications', { party_type: 'client', project_id: ctx.pid, client_contract_id: (await contract(ctx)).id, claimed_work: 100 });
const variation = ctx => ctx.api('POST', '/api/commercial/variations', { project_id: ctx.pid, title: `r02 variation ${ctx.n()}` });
const budget = ctx => ctx.api('POST', '/api/commercial/budget-versions', { project_id: ctx.pid, name: `r02 budget ${ctx.n()}`, lines: [{ amount: 100 }] });

module.exports = {
  ...group(['POST /api/commercial/currency-rates', 'POST /api/v1/currency-rates'], async ctx => ({
    body: { from_currency: 'USD', to_currency: 'EGP', rate: 48.5, effective_date: rateDate(), source: `r02-${ctx.n()}` }, status: 201,
  })),
  ...group(['PUT /api/commercial/parties/:id', 'PUT /api/v1/contracts/parties/:id'], async ctx => ({ params: { id: (await party(ctx)).id }, body: { notes: 'r02 edited' } })),
  ...group(['PUT /api/commercial/guarantees/:id', 'PUT /api/v1/guarantees/:id'], async ctx => ({ params: { id: (await guarantee(ctx)).id }, body: { reference: 'r02 ref' } })),
  ...group(['PUT /api/commercial/insurances/:id', 'PUT /api/v1/insurances/:id'], async ctx => ({ params: { id: (await insurance(ctx)).id }, body: { notes: 'r02 edited' } })),
  ...group(['PUT /api/commercial/budget-versions/:id', 'PUT /api/v1/budgets/:id'], async ctx => ({ params: { id: (await budget(ctx)).id }, body: { notes: 'r02 edited' } })),
  ...group(['POST /api/commercial/payment-applications/:id/reject', 'POST /api/v1/payment-applications/:id/reject'], async ctx => {
    const app = await application(ctx);
    await ctx.api('POST', `/api/commercial/payment-applications/${app.id}/submit`, {});
    return { params: { id: app.id }, body: { reason: 'r02 rejection' } };
  }),
  ...group(['POST /api/commercial/payment-applications/:id/withdraw', 'POST /api/v1/payment-applications/:id/withdraw'], async ctx => ({ params: { id: (await application(ctx)).id }, body: {} })),
  ...group(['POST /api/commercial/variations/:id/start', 'POST /api/v1/variations/:id/start'], async ctx => ({ params: { id: (await variation(ctx)).id }, body: {} })),
  ...group(['POST /api/commercial/variations/:id/decide', 'POST /api/v1/variations/:id/decide'], async ctx => {
    const v = await variation(ctx);
    await ctx.api('POST', `/api/commercial/variations/${v.id}/start`, {});
    return { params: { id: v.id }, body: { decision: 'approve', approved_amount: 0 } };
  }),
};
