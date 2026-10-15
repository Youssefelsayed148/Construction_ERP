'use strict';
const { group } = require('./util');
let sharedPromise;
const shared = ctx => sharedPromise ||= (async () => {
  const category = await ctx.api('POST', '/api/docs/categories', { name: `r02 handover ${ctx.n()}` });
  const document = await ctx.api('POST', '/api/docs/documents', { project_id: ctx.pid, category_id: category.id, title: 'r02 handover drawing', file_url: '/uploads/r02-handover.pdf' });
  return { document };
})();
const assetBody = ctx => ({ project_id: ctx.pid, asset_code: `R02-${ctx.n()}`, name: 'r02 pump' });
const asset = ctx => ctx.api('POST', '/api/handover/assets', assetBody(ctx));
const warrantyBody = ctx => ({ project_id: ctx.pid, title: `r02 warranty ${ctx.n()}`, issuer: 'r02 issuer', start_date: '2026-01-01', end_date: '2030-01-01' });
const claimBody = ctx => ({ project_id: ctx.pid, title: `r02 claim ${ctx.n()}`, description: 'r02 defect' });
const processTarget = async ctx => {
  const project = await ctx.api('POST', '/api/projects', { name_ar: `r02 ${ctx.n()}`, name_en: 'r02 handover project' });
  return { projectId: project.id };
};
module.exports = {
  ...group(['POST /api/handover/assets'], async ctx => ({ body: assetBody(ctx), status: 201 })),
  ...group(['POST /api/handover/assets/:id/documents'], async ctx => ({ params: { id: (await asset(ctx)).id }, body: { project_document_id: (await shared(ctx)).document.id }, status: 201 })),
  ...group(['POST /api/handover/warranties'], async ctx => ({ body: warrantyBody(ctx), status: 201 })),
  ...group(['PUT /api/handover/warranties/:id/status'], async ctx => ({ params: { id: (await ctx.api('POST', '/api/handover/warranties', warrantyBody(ctx))).id }, body: { status: 'void' } })),
  ...group(['POST /api/handover/claims'], async ctx => ({ body: claimBody(ctx), status: 201 })),
  ...group(['POST /api/handover/claims/:id/status'], async ctx => ({ params: { id: (await ctx.api('POST', '/api/handover/claims', claimBody(ctx))).id }, body: { status: 'assigned', assigned_user_id: ctx.owner.id } })),
  ...group(['PUT /api/handover/package/items/:id'], async ctx => ({ params: { id: (await ctx.api('POST', `/api/handover/package/${ctx.pid}/items`, { item_type: 'as_built_drawings', title: `r02 item ${ctx.n()}` })).id }, body: { notes: 'r02 revised' } })),
  ...group(['POST /api/handover/process/:projectId/start'], async ctx => ({ params: await processTarget(ctx), status: 201 })),
  ...group(['POST /api/handover/process/:id/transition'], async ctx => {
    const { projectId } = await processTarget(ctx);
    const { process } = await ctx.api('POST', `/api/handover/process/${projectId}/start`, {});
    return { params: { id: process.id }, body: { status: require('../../services/handoverEngine').HANDOVER_STATES[1] } };
  }),
};
