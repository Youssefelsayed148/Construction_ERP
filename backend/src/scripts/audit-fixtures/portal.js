'use strict';

// Portal routes are called as a portal user (subcontractor / supplier) linked to an organization and a project
// participant row, exactly like the production scope resolution requires.
const { group } = require('./util');
const { world, issuedPo, poLine, invited, delivery } = require('./proc-flow');

const subWorld = async ctx => {
  const sub = await ctx.api('POST', '/api/subcontractors', { name_ar: `مقاول ${ctx.n()}`, name_en: 'r02 sub' });
  const contract = await ctx.api('POST', '/api/subcontractors/contracts', { project_id: ctx.pid, subcontractor_id: sub.id, contract_value: 1000, scope: 'r02' });
  const org = await ctx.org('subcontractor');
  await ctx.participant(org.id, 'subcontractor', { subcontractor: sub.id });
  const actor = await ctx.actor('subcontractor', org.id);
  return { actor, sub, contract };
};
const supplierWorld = async ctx => {
  const w = await world(ctx);
  const org = await ctx.org('supplier');
  await ctx.participant(org.id, 'supplier', { supplier: w.supplier });
  const actor = await ctx.actor('supplier', org.id);
  return { actor, w };
};
const boqItem = async ctx => {
  const s = await ctx.api('POST', '/api/boq/sections', { project_id: ctx.pid, name_ar: `قسم ${ctx.n()}` });
  return ctx.api('POST', '/api/boq/items', { project_id: ctx.pid, section_id: s.id, description_ar: `بند ${ctx.n()}`, quantity: 10, unit_rate: 5 });
};
const rfi = (ctx, s) => ctx.as(s.actor, 'POST', '/api/portal/subcontractor/rfis', { project_id: ctx.pid, sub_contract_id: s.contract.id, subject: `r02 rfi ${ctx.n()}`, question: 'r02?' });
const submittal = (ctx, s) => ctx.as(s.actor, 'POST', '/api/portal/subcontractor/submittals', { project_id: ctx.pid, sub_contract_id: s.contract.id, title: `r02 submittal ${ctx.n()}` });

module.exports = {
  ...group(['POST /api/portal/subcontractor/contracts/:id/acknowledge'], async ctx => {
    const s = await subWorld(ctx);
    return { params: { id: s.contract.id }, body: {}, actor: s.actor };
  }),
  ...group(['POST /api/portal/subcontractor/instructions/:id/acknowledge'], async ctx => {
    const s = await subWorld(ctx);
    const instruction = await ctx.api('POST', `/api/projects/${ctx.pid}/instructions`, { title: `R02 portal instruction ${ctx.n()}` }, [201]);
    await ctx.db.query('UPDATE engineer_instructions SET sub_contract_id = $1 WHERE id = $2', [s.contract.id, instruction.id]);
    return { params: { id: instruction.id }, body: { project_id: ctx.pid, response: 'Received' }, actor: s.actor };
  }),
  ...group(['POST /api/portal/subcontractor/payment-applications'], async ctx => {
    const s = await subWorld(ctx);
    return { body: { project_id: ctx.pid, sub_contract_id: s.contract.id, period_from: '2026-10-01', period_to: '2026-10-14', work_value: 250 }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/subcontractor/submissions/:kind'], async ctx => {
    const s = await subWorld(ctx);
    return { params: { kind: 'manpower' }, body: { project_id: ctx.pid, payload: { sub_contract_id: s.contract.id, report_date: '2026-10-14', worker_count: 4, worker_type: 'crew', note: 'R02 fixture' } }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/subcontractor/quantities'], async ctx => {
    const s = await subWorld(ctx);
    return {
      body: { sub_contract_id: s.contract.id, boq_item_id: (await boqItem(ctx)).id, period_from: '2026-10-01', period_to: '2026-10-14', quantity_claimed: 2 },
      status: 201, actor: s.actor,
    };
  }),
  ...group(['POST /api/portal/subcontractor/rfis'], async ctx => {
    const s = await subWorld(ctx);
    return { body: { project_id: ctx.pid, sub_contract_id: s.contract.id, subject: `r02 rfi ${ctx.n()}`, question: 'r02?' }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/subcontractor/submittals'], async ctx => {
    const s = await subWorld(ctx);
    return { body: { project_id: ctx.pid, sub_contract_id: s.contract.id, title: `r02 submittal ${ctx.n()}` }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/subcontractor/rfis/:id/acknowledge'], async ctx => {
    const s = await subWorld(ctx);
    const row = await rfi(ctx, s);
    const engine = require('../../services/consultantEngine');
    const reviewer = { id: ctx.owner.id, name: 'r02-audit-owner', role: 'owner' };
    for (const stage of ['coordinator', 'discipline_review', 'official_response']) {
      await ctx.db.transaction((c) => engine.recordRfiResponse(c.query.bind(c), { rfi_id: row.id, stage, revision: 1, user: reviewer, body: 'r02 prerequisite' }));
    }
    return { params: { id: row.id }, body: {}, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/subcontractor/submittals/:id/resubmit'], async ctx => {
    const s = await subWorld(ctx);
    const row = await submittal(ctx, s);
    await ctx.db.query("UPDATE project_submittals SET status = 'resubmit_required' WHERE id = $1", [row.id]);
    return { params: { id: row.id }, body: { comments: 'r02' }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/supplier/rfqs/:id/quotations'], async ctx => {
    const s = await supplierWorld(ctx);
    const r = await invited(ctx, s.w);
    const line = await ctx.one('SELECT id FROM rfq_lines WHERE rfq_id = $1', [r.id]);
    return { params: { id: r.id }, body: { lines: [{ rfq_line_id: line.id, material_id: s.w.material, quantity: 10, unit_price: 10 }] }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/supplier/rfqs/:id/clarifications'], async ctx => {
    const s = await supplierWorld(ctx);
    return { params: { id: (await invited(ctx, s.w)).id }, body: { message: 'r02 clarification' }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/supplier/purchase-orders/:id/acknowledge'], async ctx => {
    const s = await supplierWorld(ctx);
    return { params: { id: (await issuedPo(ctx, s.w)).id }, body: {}, actor: s.actor };
  }),
  ...group(['POST /api/portal/supplier/purchase-orders/:id/propose-delivery'], async ctx => {
    const s = await supplierWorld(ctx);
    return { params: { id: (await issuedPo(ctx, s.w)).id }, body: { proposed_date: '2026-12-01' }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/supplier/deliveries/:id/certificates'], async ctx => {
    const s = await supplierWorld(ctx);
    return { params: { id: (await delivery(ctx, s.w)).id }, body: { files: [{ file_name: 'cert.pdf', file_url: '/uploads/cert.pdf' }] }, status: 201, actor: s.actor };
  }),
  ...group(['POST /api/portal/supplier/invoices'], async ctx => {
    const s = await supplierWorld(ctx);
    const p = await issuedPo(ctx, s.w);
    const line = await poLine(ctx, p);
    return {
      body: { purchase_order_id: p.id, invoice_number: `r02-pinv-${ctx.n()}`, total_amount: 100, lines: [{ purchase_order_line_id: line.id, material_id: s.w.material, quantity: 10, unit_price: 10 }] },
      status: 201, actor: s.actor,
    };
  }),
};
