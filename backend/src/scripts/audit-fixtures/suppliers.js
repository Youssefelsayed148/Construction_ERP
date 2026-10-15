'use strict';
const { group } = require('./util');
const supplierBody = ctx => ({ code: `r02-supplier-${ctx.n()}`, name_en: 'r02 supplier', name_ar: 'r02 supplier' });
const supplier = ctx => ctx.api('POST', '/api/suppliers', supplierBody(ctx));
const material = async ctx => (await ctx.one("INSERT INTO item_master (code, category, name_en, name_ar, unit) VALUES ($1, 'r02', $1, $1, 'ea') RETURNING id", [`r02-supplier-material-${ctx.n()}`])).id;
const link = async ctx => {
  const s = await supplier(ctx);
  const materialId = await material(ctx);
  const row = await ctx.api('POST', `/api/suppliers/${s.id}/materials`, { material_id: materialId, unit_price: 12 });
  return { supplier: s, materialId, row };
};
module.exports = {
  ...group(['POST /api/suppliers'], async ctx => ({ body: supplierBody(ctx), status: 201 })),
  ...group(['PUT /api/suppliers/:id'], async ctx => ({ params: { id: (await supplier(ctx)).id }, body: { city: 'r02 Cairo' } })),
  ...group(['DELETE /api/suppliers/:id'], async ctx => ({ params: { id: (await supplier(ctx)).id }, body: { reason: 'r02 audit fixture' } })),
  ...group(['POST /api/suppliers/:id/restore'], async ctx => {
    const s = await supplier(ctx);
    await ctx.api('DELETE', `/api/suppliers/${s.id}`, { reason: 'r02 restore fixture' });
    return { params: { id: s.id } };
  }),
  ...group(['POST /api/suppliers/:id/materials'], async ctx => {
    const s = await supplier(ctx);
    return { params: { id: s.id }, body: { material_id: await material(ctx), unit_price: 12 }, status: 201 };
  }),
  ...group(['DELETE /api/suppliers/:id/materials/:material_id'], async ctx => {
    const { supplier: s, materialId } = await link(ctx);
    return { params: { id: s.id, material_id: materialId } };
  }),
};
