'use strict';

// Prerequisite builders. Each call creates its own supplier/material/warehouse so
// fixtures never share mutable state.
const world = async ctx => {
  const k = ctx.n();
  const supplier = (await ctx.one("INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id", [`r02-s-${k}`])).id;
  const material = (await ctx.one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'r02', $1, $1, 'ea') RETURNING id", [`r02-m-${k}`])).id;
  const warehouse = (await ctx.one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`r02-w-${k}`, ctx.pid])).id;
  await ctx.db.query('INSERT INTO supplier_materials (supplier_id, material_id, unit_price) VALUES ($1, $2, 10)', [supplier, material]);
  return { supplier, material, warehouse };
};
const tableOf = { pr: 'purchase_requests', po: 'purchase_orders' };
const decideUntil = async (ctx, kind, id, want) => {
  for (let i = 0; i < 8; i += 1) {
    if ((await ctx.one(`SELECT status FROM ${tableOf[kind]} WHERE id = $1`, [id])).status === want) return;
    await ctx.api('POST', `/api/procurement/${kind}/${id}/decide`, { decision: 'approve' });
  }
  throw new Error(`${kind} ${id} did not reach ${want}`);
};
const prLines = w => [{ material_id: w.material, description: 'r02', quantity: 10, unit: 'ea', estimated_unit_price: 10 }];
const pr = (ctx, w) => ctx.api('POST', '/api/procurement/pr', { title: `r02 ${ctx.n()}`, project_id: ctx.pid, needed_by: '2099-01-01', lines: prLines(w) });
const submittedPr = async (ctx, w) => { const p = await pr(ctx, w); await ctx.api('POST', `/api/procurement/pr/${p.id}/submit`, {}); return p; };
const approvedPr = async (ctx, w) => { const p = await submittedPr(ctx, w); await decideUntil(ctx, 'pr', p.id, 'procurement'); return p; };
const poBody = (ctx, w, extra = {}) => ({ supplier_id: w.supplier, project_id: ctx.pid, lines: [{ material_id: w.material, quantity: 10, unit: 'ea', unit_rate: 10 }], ...extra });
const po = async (ctx, w) => ctx.api('POST', '/api/procurement/po', poBody(ctx, w, { purchase_request_id: (await approvedPr(ctx, w)).id }));
const issuedPo = async (ctx, w) => {
  const p = await po(ctx, w);
  await ctx.api('POST', `/api/procurement/po/${p.id}/issue`);
  await decideUntil(ctx, 'po', p.id, 'issued');
  return p;
};
const poLine = (ctx, p) => ctx.one('SELECT id FROM purchase_order_lines WHERE purchase_order_id = $1', [p.id]);
const rfq = async (ctx, w) => ctx.api('POST', '/api/procurement/rfq', { project_id: ctx.pid, title: `r02 rfq ${ctx.n()}`, lines: [{ material_id: w.material, quantity: 10, unit: 'ea' }] });
const invited = async (ctx, w) => { const r = await rfq(ctx, w); await ctx.api('POST', `/api/procurement/rfq/${r.id}/vendors`, { supplier_ids: [w.supplier] }, [200, 201]); return r; };
const quoted = async (ctx, w) => {
  const r = await invited(ctx, w);
  const line = await ctx.one('SELECT id FROM rfq_lines WHERE rfq_id = $1', [r.id]);
  const q = await ctx.api('POST', `/api/procurement/rfq/${r.id}/quotations`, { supplier_id: w.supplier, lines: [{ rfq_line_id: line.id, material_id: w.material, quantity: 10, unit_price: 10 }], commercial_score: 80, technical_score: 80 });
  return { rfq: r, quotation: q };
};
const recommendation = async (ctx, w) => {
  const { rfq: r, quotation } = await quoted(ctx, w);
  return ctx.api('POST', `/api/procurement/rfq/${r.id}/award-recommendations`, { quotation_id: quotation.id, basis: 'single_source', justification: 'r02 audit fixture' });
};
const delivery = async (ctx, w) => {
  const p = await issuedPo(ctx, w);
  const line = await poLine(ctx, p);
  return ctx.api('POST', '/api/procurement/deliveries', { purchase_order_id: p.id, warehouse_id: w.warehouse, lines: [{ purchase_order_line_id: line.id, quantity: 10 }] });
};
const mir = async (ctx, w) => ctx.api('POST', `/api/procurement/deliveries/${(await delivery(ctx, w)).id}/mir`);
const acceptedMir = async (ctx, w) => { const m = await mir(ctx, w); await ctx.api('POST', `/api/procurement/mir/${m.id}/decide`, { decision: 'accept' }); return m; };
const grn = async (ctx, w) => ctx.api('POST', `/api/procurement/mir/${(await acceptedMir(ctx, w)).id}/grn`);
const invoice = async (ctx, w) => (await ctx.api('POST', '/api/procurement/invoices', {
  supplier_id: w.supplier, invoice_number: `r02-inv-${ctx.n()}`, invoice_date: '2026-10-14', total_amount: 100,
  lines: [{ material_id: w.material, quantity: 10, unit_price: 10 }],
})).invoice;

module.exports = { world, pr, submittedPr, approvedPr, po, issuedPo, poLine, rfq, invited, quoted, recommendation, delivery, mir, acceptedMir, grn, invoice, poBody, decideUntil, prLines };
