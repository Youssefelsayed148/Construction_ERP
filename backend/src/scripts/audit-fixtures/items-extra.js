'use strict';
const { group } = require('./util');
const body = ctx => ({ code: `R02-${ctx.n()}`, category: 'raw_material', sub_category: 'cement', unit: 'bag', name_en: 'R02 test item', name_ar: 'R02 test item' });
const item = ctx => ctx.api('POST', '/api/items', body(ctx), [201]);
module.exports = {
  ...group(['POST /api/items', 'POST /api/v1/materials'], async ctx => ({ body: body(ctx), status: 201 })),
  ...group(['PUT /api/items/:id', 'PUT /api/v1/materials/:id'], async ctx => ({ params: { id: (await item(ctx)).id }, body: { description: 'R02 updated item' } })),
  ...group(['DELETE /api/items/:id'], async ctx => ({ params: { id: (await item(ctx)).id } })),
  ...group(['POST /api/items/:id/restore'], async ctx => {
    const row = await item(ctx);
    await ctx.api('DELETE', `/api/items/${row.id}`, { reason: 'R02 restore fixture' });
    return { params: { id: row.id } };
  }),
};
