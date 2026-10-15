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

// Immutable prerequisites are shared within this registry run; mutable workflow
// targets remain fresh for each success/failure request.
let worldPromise;
const world = ctx => worldPromise ||= (async () => {
  const client = await ctx.one('INSERT INTO clients (name_ar, name_en) VALUES ($1, $1) RETURNING id', [`r02-commercial-${ctx.n()}`]);
  const maker = await ctx.actor('owner');
  const cc = await ctx.api('POST', '/api/commercial/contracts', { project_id: ctx.pid, client_id: client.id, original_value: 1000000, retention_percent: 0, advance_percent: 0 });
  const sub = await ctx.api('POST', '/api/subcontractors', { name_en: 'r02 commercial sub', name_ar: 'مقاول الاختبار' });
  const sc = await ctx.api('POST', '/api/subcontractors/contracts', { project_id: ctx.pid, subcontractor_id: sub.id, contract_value: 1000000 });
  return { client, maker, cc, sc, sub };
})();
const applicationBody = async ctx => ({ party_type: 'client', project_id: ctx.pid, client_contract_id: (await world(ctx)).cc.id, claimed_work: 100 });
const newApplication = async (ctx, submitted = false) => {
  const row = await ctx.api('POST', '/api/commercial/payment-applications', await applicationBody(ctx));
  if (submitted) await ctx.api('POST', `/api/commercial/payment-applications/${row.id}/submit`, {});
  return row;
};
const certificateTarget = async (ctx, state = 'draft') => {
  const { maker } = await world(ctx);
  const app = await ctx.as(maker, 'POST', '/api/commercial/payment-applications', await applicationBody(ctx));
  await ctx.as(maker, 'POST', `/api/commercial/payment-applications/${app.id}/submit`, {});
  const { certificate: cert } = await ctx.as(maker, 'POST', `/api/commercial/payment-applications/${app.id}/certify`, { certified_work: 100 });
  if (state !== 'draft') await ctx.as(maker, 'POST', `/api/commercial/payment-certificates/${cert.id}/start`, {});
  if (state === 'certified') {
    for (let i = 0; i < 10 && (await ctx.one('SELECT status FROM payment_certificates WHERE id = $1', [cert.id])).status !== 'certified'; i++) await ctx.api('POST', `/api/commercial/payment-certificates/${cert.id}/decide`, { decision: 'approve' });
    const inv = await ctx.one('SELECT id FROM invoices WHERE payment_certificate_id = $1', [cert.id]);
    if (inv) await ctx.api('POST', `/api/finance-ledger/invoices/${inv.id}/transition`, { status: 'cancelled' });
  }
  return cert;
};
const budgetBody = ctx => ({ project_id: ctx.pid, name: `r02 budget ${ctx.n()}`, lines: [{ amount: 900000000 }] });
const newBudget = async (ctx, submitted = false) => {
  const { maker } = await world(ctx);
  const row = await ctx.as(maker, 'POST', '/api/commercial/budget-versions', budgetBody(ctx));
  if (submitted) await ctx.as(maker, 'POST', `/api/commercial/budget-versions/${row.id}/submit`, {});
  return row;
};
const forecastBody = ctx => ({ project_id: ctx.pid, name: `r02 forecast ${ctx.n()}`, lines: [{ forecast_amount: 900000000 }] });
const keys = (method, path, alias = path) => [`${method} /api/commercial/${path}`, `${method} /api/v1/${alias}`];

module.exports = {
  ...group(keys('POST', 'contracts'), async ctx => ({ body: { project_id: ctx.pid, client_id: (await world(ctx)).client.id, original_value: 1000, lines: [{ description: 'r02 work', quantity: 2, unit_rate: 500 }] }, status: 201 })),
  ...group(keys('POST', 'contracts/:contractId/parties'), async ctx => ({ params: { contractId: (await world(ctx)).cc.id }, body: { party_role: 'employer', name_en: 'r02 employer', name_ar: 'صاحب العمل' }, status: 201 })),
  ...group(keys('POST', 'subcontracts/:contractId/parties'), async ctx => ({ params: { contractId: (await world(ctx)).sc.id }, body: { party_role: 'subcontractor', name_en: 'r02 sub', name_ar: 'مقاول الاختبار' }, status: 201 })),
  ...group(keys('POST', 'guarantees'), async ctx => ({ body: { guarantee_type: 'performance', project_id: ctx.pid, amount: 100, expires_on: '2030-01-01' }, status: 201 })),
  ...group(keys('POST', 'guarantees/:id/close'), async ctx => ({ params: { id: (await guarantee(ctx)).id }, body: { status: 'released', reason: 'r02 close' } })),
  ...group(keys('POST', 'insurances'), async ctx => ({ body: { insurance_type: 'other', project_id: ctx.pid, policy_number: `r02-${ctx.n()}`, coverage_amount: 1000, expiry_date: '2030-01-01' }, status: 201 })),
  ...group(keys('POST', 'insurances/:id/cancel'), async ctx => ({ params: { id: (await insurance(ctx)).id }, body: { reason: 'r02 cancel' } })),
  ...group(keys('POST', 'payment-applications'), async ctx => ({ body: await applicationBody(ctx), status: 201 })),
  ...group(keys('POST', 'payment-applications/:id/submit'), async ctx => ({ params: { id: (await newApplication(ctx)).id } })),
  ...group(keys('POST', 'payment-applications/:id/certify'), async ctx => ({ params: { id: (await newApplication(ctx, true)).id }, body: { certified_work: 100 } })),
  ...group(keys('POST', 'payment-certificates/:id/start'), async ctx => ({ params: { id: (await certificateTarget(ctx)).id } })),
  ...group(keys('POST', 'payment-certificates/:id/decide'), async ctx => ({ params: { id: (await certificateTarget(ctx, 'started')).id }, body: { decision: 'approve' } })),
  ...group(['POST /api/commercial/payment-certificates/:id/void'], async ctx => ({ params: { id: (await certificateTarget(ctx, 'certified')).id }, body: { reason: 'r02 correction' } })),
  ...group(keys('POST', 'budget-versions', 'budgets'), async ctx => ({ body: budgetBody(ctx), status: 201 })),
  ...group(keys('POST', 'budget-versions/:id/submit', 'budgets/:id/submit'), async ctx => ({ params: { id: (await newBudget(ctx)).id } })),
  ...group(keys('POST', 'budget-versions/:id/decide', 'budgets/:id/decide'), async ctx => ({ params: { id: (await newBudget(ctx, true)).id }, body: { decision: 'approve' } })),
  ...group(keys('POST', 'forecast-versions', 'forecasts'), async ctx => ({ body: forecastBody(ctx), status: 201 })),
  ...group(keys('POST', 'forecast-versions/:id/approve', 'forecasts/:id/approve'), async ctx => ({ params: { id: (await ctx.as((await world(ctx)).maker, 'POST', '/api/commercial/forecast-versions', forecastBody(ctx))).id } })),
  ...group(keys('POST', 'commitments/:id/adjust'), async ctx => {
    const sc = await ctx.api('POST', '/api/subcontractors/contracts', { project_id: ctx.pid, subcontractor_id: (await world(ctx)).sub.id, contract_value: 1000 });
    return { params: { id: (await ctx.one("INSERT INTO commitments (commitment_number, project_id, source_type, source_id, original_amount) VALUES ($1, $2, 'sub_contract', $3, 1000) RETURNING id", [`R02-${ctx.n()}`, ctx.pid, sc.id])).id }, body: { cancelled_amount: 10, reason: 'r02 reduction' } };
  }),
  ...group(keys('POST', 'variations'), async ctx => ({ body: { project_id: ctx.pid, title: `r02 variation ${ctx.n()}`, lines: [{ description: 'r02 work', quantity: 1, unit_rate: 10 }] }, status: 201 })),
  ...group(keys('PUT', 'variations/:id'), async ctx => ({ params: { id: (await variation(ctx)).id }, body: { description: 'r02 revised', time_impact_days: 2 } })),
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
