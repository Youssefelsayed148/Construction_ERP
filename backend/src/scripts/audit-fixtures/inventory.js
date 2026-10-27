'use strict';

const { group } = require('./util');

// Prerequisites are unique per fixture; stock always enters through the ledger.
const world = async ctx => {
  const material = (await ctx.one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'r02', $1, $1, 'ea') RETURNING id", [`r02-inv-${ctx.n()}`])).id;
  const warehouse = (await ctx.one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`r02-inv-${ctx.n()}`, ctx.pid])).id;
  await ctx.api('POST', `/api/warehouses/${warehouse}/movements`, { material_id: material, movement_type: 'grn', quantity: 100, unit_cost: 10, mir_accepted: true });
  return { material, warehouse };
};
const lotBody = (ctx, w) => ({ warehouse_id: w.warehouse, material_id: w.material, lot_number: `r02-${ctx.n()}` });
const conversionBody = w => ({ material_id: w.material, from_unit: 'box', to_unit: 'ea', factor: 10 });
const docBody = (ctx, w, issueLine = null) => ({ warehouse_id: w.warehouse, project_id: ctx.pid, reason: 'r02 count check', lines: [{ material_id: w.material, quantity: 2, ...(issueLine ? { issue_line_id: issueLine } : {}) }] });
const draft = async (ctx, plural, w) => {
  let issueLine = null;
  if (plural === 'returns') {
    const issue = await ctx.api('POST', '/api/inventory/issues', docBody(ctx, w));
    const posted = await ctx.api('POST', `/api/inventory/issues/${issue.id}/post`, {});
    issueLine = posted.lines[0].id;
  }
  return ctx.api('POST', `/api/inventory/${plural}`, docBody(ctx, w, issueLine));
};
const reservationBody = (ctx, w) => ({ material_id: w.material, warehouse_id: w.warehouse, project_id: ctx.pid, quantity: 2 });
const transferBody = async (ctx, w) => ({ from_warehouse_id: w.warehouse, to_warehouse_id: (await ctx.one("INSERT INTO warehouses (name, name_en, type, project_id) VALUES ($1, $1, 'site', $2) RETURNING id", [`r02-dest-${ctx.n()}`, ctx.pid])).id, items: [{ item_id: w.material, quantity: 2 }] });
const inventoryKeys = suffix => ['/api/inventory', '/api/v1/inventory'].map(prefix => suffix.replace(' ', ` ${prefix}/`));

module.exports = {
  ...group(inventoryKeys('POST lots'), async ctx => ({ body: lotBody(ctx, await world(ctx)), status: 201 })),
  ...group(inventoryKeys('PUT lots/:id/status'), async ctx => {
    const w = await world(ctx);
    return { params: { id: (await ctx.api('POST', '/api/inventory/lots', lotBody(ctx, w))).id }, body: { status: 'blocked' } };
  }),
  ...group(inventoryKeys('POST conversions'), async ctx => ({ body: conversionBody(await world(ctx)), status: 201 })),
  ...group(inventoryKeys('PUT conversions/:id'), async ctx => ({ params: { id: (await ctx.api('POST', '/api/inventory/conversions', conversionBody(await world(ctx)))).id }, body: { factor: 20 } })),
  ...group(inventoryKeys('DELETE conversions/:id'), async ctx => ({ params: { id: (await ctx.api('POST', '/api/inventory/conversions', conversionBody(await world(ctx)))).id } })),
  ...Object.assign({}, ...['issues', 'returns', 'adjustments'].map(plural => ({
    ...group(inventoryKeys(`POST ${plural}`), async ctx => {
      const w = await world(ctx);
      // A return can be drafted without a prior issue; post fixtures below use
      // a real issue line to exercise stock and cost reversal as well.
      return { body: docBody(ctx, w), status: 201 };
    }),
    ...group(inventoryKeys(`PUT ${plural}/:id`), async ctx => {
      const w = await world(ctx);
      const doc = await draft(ctx, plural, w);
      // Replacing lines exercises the child DELETE/INSERT rollback path.
      return { params: { id: doc.id }, body: { notes: 'r02 revised', lines: doc.lines.map(line => ({ material_id: line.material_id, quantity: 1, ...(line.issue_line_id ? { issue_line_id: line.issue_line_id } : {}) })) } };
    }),
    ...group(inventoryKeys(`POST ${plural}/:id/post`), async ctx => ({ params: { id: (await draft(ctx, plural, await world(ctx))).id } })),
    ...group(inventoryKeys(`POST ${plural}/:id/void`), async ctx => {
      const doc = await draft(ctx, plural, await world(ctx));
      // Posted returns are deliberately immutable; their valid void path is a
      // draft. Issues/adjustments exercise reversal of posted stock.
      if (plural !== 'returns') await ctx.api('POST', `/api/inventory/${plural}/${doc.id}/post`, {});
      return { params: { id: doc.id }, body: { reason: 'r02 correction' } };
    }),
  }))),
  ...group(['POST /api/warehouses/:id/movements', 'POST /api/v1/inventory/warehouses/:id/movements'], async ctx => {
    const w = await world(ctx);
    return { params: { id: w.warehouse }, body: { material_id: w.material, movement_type: 'grn', quantity: 5, unit_cost: 10, mir_accepted: true, lot: { lot_number: `r02-receipt-${ctx.n()}` } }, status: 201 };
  }),
  ...group(['POST /api/warehouses/movements/:id/reverse', 'POST /api/v1/inventory/movements/:id/reverse'], async ctx => {
    const w = await world(ctx);
    const out = await ctx.api('POST', `/api/warehouses/${w.warehouse}/movements`, { material_id: w.material, movement_type: 'issue', quantity: 2 });
    return { params: { id: out.movement.id }, body: { reason: 'r02 correction' }, status: 201 };
  }),
  ...group(['POST /api/warehouses/movements/:id/mir'], async ctx => {
    const w = await world(ctx);
    const out = await ctx.api('POST', `/api/warehouses/${w.warehouse}/movements`, { material_id: w.material, movement_type: 'quarantine', quantity: 2, unit_cost: 10 });
    return { params: { id: out.movement.id }, body: { result: 'accepted' }, status: 201 };
  }),
  ...group(['POST /api/warehouses/transfers', 'POST /api/v1/inventory/transfers'], async ctx => ({ body: await transferBody(ctx, await world(ctx)), status: 201 })),
  ...group(['PUT /api/warehouses/transfers/:id/complete', 'PUT /api/v1/inventory/transfers/:id/complete'], async ctx => ({ params: { id: (await ctx.api('POST', '/api/warehouses/transfers', await transferBody(ctx, await world(ctx)))).id } })),
  ...group(['POST /api/warehouses/reservations', 'POST /api/v1/inventory/reservations'], async ctx => ({ body: reservationBody(ctx, await world(ctx)), status: 201 })),
  ...group(['POST /api/warehouses/reservations/:id/release', 'POST /api/v1/inventory/reservations/:id/release'], async ctx => ({ params: { id: (await ctx.api('POST', '/api/warehouses/reservations', reservationBody(ctx, await world(ctx)))).id } })),
  ...group(['POST /api/warehouses'], async ctx => ({ body: { name: `r02-wh-${ctx.n()}`, warehouse_type: 'project', project_id: ctx.pid }, status: 201 })),
  ...group(['PUT /api/warehouses/:id'], async ctx => ({
    params: { id: (await ctx.api('POST', '/api/warehouses', { name: `r02-wh-u-${ctx.n()}`, warehouse_type: 'project', project_id: ctx.pid })).id },
    body: { storage_capacity: 500 },
  })),
  ...group(['PUT /api/warehouses/:id/stock/:itemId/reorder-level'], async ctx => {
    const w = await world(ctx);
    return { params: { id: w.warehouse, itemId: w.material }, body: { reorder_level: 5 } };
  }),
};
