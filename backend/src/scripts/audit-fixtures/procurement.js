'use strict';

const { group } = require('./util');
const { world, pr, submittedPr, approvedPr, po, issuedPo, poLine, rfq, invited, quoted, recommendation, delivery, mir, acceptedMir, grn, invoice, poBody, prLines } = require('./proc-flow');


module.exports = {
  ...group(['POST /api/procurement/pr/:id/submit', 'POST /api/v1/purchase-requisitions/:id/submit'], async ctx => ({ params: { id: (await pr(ctx, await world(ctx))).id }, body: {} })),
  ...group(['POST /api/procurement/pr', 'POST /api/v1/purchase-requisitions'], async ctx => ({ body: { title: `r02 ${ctx.n()}`, project_id: ctx.pid, lines: prLines(await world(ctx)) }, status: 201 })),
  ...group(['POST /api/procurement/pr/:id/decide', 'POST /api/v1/purchase-requisitions/:id/decide'], async ctx => ({ params: { id: (await submittedPr(ctx, await world(ctx))).id }, body: { decision: 'approve' } })),
  ...group(['PUT /api/procurement/pr/:id', 'PUT /api/v1/purchase-requisitions/:id'], async ctx => ({ params: { id: (await pr(ctx, await world(ctx))).id }, body: { title: `r02 edited ${ctx.n()}` } })),
  ...group(['POST /api/procurement/pr/:id/cancel', 'POST /api/v1/purchase-requisitions/:id/cancel'], async ctx => ({ params: { id: (await pr(ctx, await world(ctx))).id }, body: { reason: 'r02' } })),
  ...group(['POST /api/procurement/rfq', 'POST /api/v1/rfqs'], async ctx => ({ body: { project_id: ctx.pid, title: `r02 rfq ${ctx.n()}`, lines: [{ material_id: (await world(ctx)).material, quantity: 10, unit: 'ea' }] }, status: 201 })),
  ...group(['POST /api/procurement/rfq/:id/vendors', 'POST /api/v1/rfqs/:id/vendors'], async ctx => {
    const w = await world(ctx);
    return { params: { id: (await rfq(ctx, w)).id }, body: { supplier_ids: [w.supplier] }, status: 201 };
  }),
  ...group(['POST /api/procurement/rfq/:id/quotations', 'POST /api/v1/rfqs/:id/quotations'], async ctx => {
    const w = await world(ctx);
    const r = await invited(ctx, w);
    const line = await ctx.one('SELECT id FROM rfq_lines WHERE rfq_id = $1', [r.id]);
    return { params: { id: r.id }, body: { supplier_id: w.supplier, lines: [{ rfq_line_id: line.id, material_id: w.material, quantity: 10, unit_price: 10 }] }, status: 201 };
  }),
  ...group(['POST /api/procurement/rfq/:id/award', 'POST /api/v1/rfqs/:id/award'], async ctx => {
    const { rfq: r, quotation } = await quoted(ctx, await world(ctx));
    return { params: { id: r.id }, body: { quotation_id: quotation.id, justification: 'r02 direct award' } };
  }),
  ...group(['POST /api/procurement/rfq/:id/award-recommendations', 'POST /api/v1/rfqs/:id/award-recommendations'], async ctx => {
    const { rfq: r, quotation } = await quoted(ctx, await world(ctx));
    return { params: { id: r.id }, body: { quotation_id: quotation.id, basis: 'single_source', justification: 'r02 audit fixture justification' }, status: 201 };
  }),
  ...group(['POST /api/procurement/award-recommendations/:id/submit', 'POST /api/v1/rfqs/award-recommendations/:id/submit'], async ctx => ({ params: { id: (await recommendation(ctx, await world(ctx))).id }, body: {} })),
  ...group(['POST /api/procurement/award-recommendations/:id/decide', 'POST /api/v1/rfqs/award-recommendations/:id/decide'], async ctx => {
    const rec = await recommendation(ctx, await world(ctx));
    await ctx.api('POST', `/api/procurement/award-recommendations/${rec.id}/submit`, {});
    return { params: { id: rec.id }, body: { decision: 'approve' } };
  }),
  ...group(['POST /api/procurement/award-recommendations/:id/withdraw', 'POST /api/v1/rfqs/award-recommendations/:id/withdraw'], async ctx => ({ params: { id: (await recommendation(ctx, await world(ctx))).id }, body: { reason: 'r02' } })),
  ...group(['POST /api/procurement/po', 'POST /api/v1/purchase-orders'], async ctx => ({ body: poBody(ctx, await world(ctx)), status: 201 })),
  ...group(['PUT /api/procurement/po/:id', 'PUT /api/v1/purchase-orders/:id'], async ctx => ({ params: { id: (await po(ctx, await world(ctx))).id }, body: { freight: 5 } })),
  ...group(['POST /api/procurement/po/:id/cancel', 'POST /api/v1/purchase-orders/:id/cancel'], async ctx => ({ params: { id: (await po(ctx, await world(ctx))).id }, body: { reason: 'r02' } })),
  ...group(['POST /api/procurement/po/:id/issue', 'POST /api/v1/purchase-orders/:id/issue'], async ctx => ({ params: { id: (await po(ctx, await world(ctx))).id }, body: {} })),
  ...group(['POST /api/procurement/po/:id/decide', 'POST /api/v1/purchase-orders/:id/decide'], async ctx => {
    const p = await po(ctx, await world(ctx));
    await ctx.api('POST', `/api/procurement/po/${p.id}/issue`);
    return { params: { id: p.id }, body: { decision: 'approve' } };
  }),
  ...group(['POST /api/procurement/deliveries', 'POST /api/v1/deliveries'], async ctx => {
    const w = await world(ctx);
    const p = await issuedPo(ctx, w);
    return { body: { purchase_order_id: p.id, warehouse_id: w.warehouse, lines: [{ purchase_order_line_id: (await poLine(ctx, p)).id, quantity: 10 }] }, status: 201 };
  }),
  ...group(['POST /api/procurement/deliveries/:id/mir', 'POST /api/v1/deliveries/:id/mir'], async ctx => ({ params: { id: (await delivery(ctx, await world(ctx))).id }, body: {}, status: 201 })),
  ...group(['POST /api/procurement/mir/:id/supplier-collection'], async ctx => {
    const m = await mir(ctx, await world(ctx));
    await ctx.api('POST', `/api/procurement/mir/${m.id}/decide`, { decision: 'reject' });
    return { params: { id: m.id }, body: { note: 'collected by supplier truck' } };
  }),
  ...group(['POST /api/procurement/mir/:id/decide', 'POST /api/v1/deliveries/mir/:id/decide'], async ctx => ({ params: { id: (await mir(ctx, await world(ctx))).id }, body: { decision: 'accept' } })),
  ...group(['POST /api/procurement/mir/:id/grn', 'POST /api/v1/grns/from-mir/:id'], async ctx => ({ params: { id: (await acceptedMir(ctx, await world(ctx))).id }, body: {}, status: 201 })),
  ...group(['POST /api/procurement/grn/:id/returns', 'POST /api/v1/grns/:id/returns'], async ctx => {
    const w = await world(ctx);
    const g = await grn(ctx, w);
    const line = await ctx.one('SELECT id, material_id FROM grn_lines WHERE grn_id = $1', [g.id]);
    return { params: { id: g.id }, body: { reason: 'r02', lines: [{ material_id: line.material_id, grn_line_id: line.id, quantity: 1 }] }, status: 201 };
  }),
  ...group(['POST /api/procurement/invoices', 'POST /api/v1/supplier-invoices'], async ctx => {
    const w = await world(ctx);
    return { body: { supplier_id: w.supplier, invoice_number: `r02-inv-${ctx.n()}`, invoice_date: '2026-10-14', total_amount: 100, lines: [{ material_id: w.material, quantity: 10, unit_price: 10 }] }, status: 201 };
  }),
  ...group(['POST /api/procurement/invoices/:id/approve', 'POST /api/v1/supplier-invoices/:id/approve'], async ctx => ({ params: { id: (await invoice(ctx, await world(ctx))).id }, body: {} })),
  ...group(['POST /api/procurement/invoices/:id/workflow/start', 'POST /api/v1/supplier-invoices/:id/workflow/start'], async ctx => ({ params: { id: (await invoice(ctx, await world(ctx))).id }, body: {} })),
  ...group(['POST /api/procurement/invoices/:id/workflow/decide', 'POST /api/v1/supplier-invoices/:id/workflow/decide'], async ctx => {
    const inv = await invoice(ctx, await world(ctx));
    await ctx.api('POST', `/api/procurement/invoices/${inv.id}/workflow/start`, {});
    return { params: { id: inv.id }, body: { decision: 'approve' } };
  }),
};
