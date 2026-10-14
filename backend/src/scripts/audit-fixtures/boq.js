'use strict';

const { group } = require('./util');

const section = (ctx, extra = {}) => ctx.api('POST', '/api/boq/sections', { project_id: ctx.pid, name_ar: `قسم ${ctx.n()}`, name_en: `Section ${ctx.n()}`, ...extra });
const item = async (ctx) => {
  const s = await section(ctx);
  return ctx.api('POST', '/api/boq/items', { project_id: ctx.pid, section_id: s.id, description_ar: `بند ${ctx.n()}`, description_en: 'Item', unit: 'm2', quantity: 3, unit_rate: 10 });
};

module.exports = {
  ...group(['POST /api/boq/sections', 'POST /api/v1/boq/sections'], async ctx => ({ body: { project_id: ctx.pid, name_ar: `قسم ${ctx.n()}`, name_en: 'S' }, status: 201 })),
  ...group(['PUT /api/boq/sections/:id', 'PUT /api/v1/boq/sections/:id'], async ctx => ({ params: { id: (await section(ctx)).id }, body: { name_en: 'Renamed' } })),
  ...group(['DELETE /api/boq/sections/:id', 'DELETE /api/v1/boq/sections/:id'], async ctx => ({ params: { id: (await section(ctx)).id } })),
  ...group(['POST /api/boq/items', 'POST /api/v1/work-packages/work-packages'], async ctx => {
    const s = await section(ctx);
    return { body: { project_id: ctx.pid, section_id: s.id, description_ar: `بند ${ctx.n()}`, quantity: 2, unit_rate: 5 }, status: 201 };
  }),
  ...group(['PUT /api/boq/items/:id', 'PUT /api/v1/work-packages/work-packages/:id'], async ctx => ({ params: { id: (await item(ctx)).id }, body: { quantity: 4 } })),
  ...group(['DELETE /api/boq/items/:id', 'DELETE /api/v1/work-packages/work-packages/:id'], async ctx => ({ params: { id: (await item(ctx)).id } })),
};
