'use strict';
const { group } = require('./util');
const keys = (method, path) => [`${method} /api/docs/${path}`, `${method} /api/v1/${path}`];
let sharedPromise; let referencePromise; let clientPromise;
const shared = ctx => sharedPromise ||= ctx.api('POST', '/api/docs/categories', { name: `r02-docs-${ctx.n()}` });
const body = async ctx => ({ project_id: ctx.pid, category_id: (await shared(ctx)).id, title: `r02 document ${ctx.n()}`, file_url: '/uploads/r02-metadata-only.pdf' });
const document = async (ctx, extra = {}) => ctx.api('POST', '/api/docs/documents', { ...await body(ctx), ...extra });
const reference = ctx => referencePromise ||= document(ctx);
const rfi = ctx => ctx.api('POST', '/api/docs/rfis', { project_id: ctx.pid, subject: `r02 question ${ctx.n()}`, question: 'r02 clarification' });
const submittal = ctx => ctx.api('POST', '/api/docs/submittals', { project_id: ctx.pid, title: `r02 material ${ctx.n()}` });
const transmittalBody = async ctx => ({ project_id: ctx.pid, purpose: 'r02 review', items: [{ document_id: (await reference(ctx)).id, item_description: 'r02 drawing' }] });
const transmittal = async ctx => ctx.api('POST', '/api/docs/transmittals', await transmittalBody(ctx));
const correspondenceBody = ctx => ({ project_id: ctx.pid, subject: `r02 letter ${ctx.n()}`, body: 'r02 original' });
const correspondence = ctx => ctx.api('POST', '/api/docs/correspondence', correspondenceBody(ctx));
const client = ctx => clientPromise ||= (async () => {
  const org = await ctx.org('client'); const actor = await ctx.actor('client', org.id);
  const participant = await ctx.participant(org.id, 'client');
  await ctx.db.query('INSERT INTO project_participant_users (project_participant_id, user_id) VALUES ($1,$2)', [participant.id, actor.userId]);
  return { org, actor };
})();

module.exports = {
  ...group(keys('POST', 'documents'), async ctx => ({ body: await body(ctx), status: 201 })),
  ...group(keys('PUT', 'documents/:id'), async ctx => ({ params: { id: (await document(ctx)).id }, body: { description: 'r02 revised', tags: ['r02'] } })),
  ...group(keys('DELETE', 'documents/:id'), async ctx => ({ params: { id: (await document(ctx)).id } })),
  ...group(keys('POST', 'documents/:id/versions'), async ctx => ({ params: { id: (await document(ctx)).id }, body: { file_url: '/uploads/r02-version-only.pdf', change_description: 'r02 revised' }, status: 201 })),
  ...group(keys('POST', 'documents/:id/submit'), async ctx => ({ params: { id: (await document(ctx)).id } })),
  ...group(keys('POST', 'documents/:id/:action(approve|reject)'), async ctx => { const doc = await document(ctx); await ctx.api('POST', `/api/docs/documents/${doc.id}/submit`, {}); return { params: { id: doc.id, action: 'approve' } }; }),
  ...group(['POST /api/docs/documents/:id/register'], async ctx => ({ params: { id: (await document(ctx)).id }, body: { revision_code: 'R0' } })),
  ...group(['POST /api/docs/documents/:id/supersede'], async ctx => ({ params: { id: (await document(ctx)).id }, body: { replacement_document_id: (await document(ctx)).id } })),
  ...group(keys('POST', 'rfis'), async ctx => ({ body: { project_id: ctx.pid, subject: `r02 question ${ctx.n()}` }, status: 201 })),
  ...group(keys('POST', 'rfis/:id/close'), async ctx => { const row = await rfi(ctx); await ctx.db.query("UPDATE project_rfis SET status = 'answered' WHERE id = $1", [row.id]); return { params: { id: row.id } }; }),
  ...group(keys('POST', 'submittals'), async ctx => ({ body: { project_id: ctx.pid, title: `r02 material ${ctx.n()}` }, status: 201 })),
  ...group(['POST /api/consultant/rfis/:id/response', 'POST /api/v1/rfis/:id/responses'], async ctx => ({ params: { id: (await rfi(ctx)).id }, body: { stage: 'coordinator', body: 'r02 review' }, status: 201 })),
  ...group(['POST /api/consultant/submittals/:id/response', 'POST /api/v1/submittals/:id/revisions'], async ctx => ({ params: { id: (await submittal(ctx)).id }, body: { stage: 'internal_technical_review', comments: 'r02 review' }, status: 201 })),
  ...group(keys('POST', 'transmittals'), async ctx => ({ body: await transmittalBody(ctx), status: 201 })),
  ...group(keys('POST', 'transmittals/:id/items'), async ctx => ({ params: { id: (await transmittal(ctx)).id }, body: { document_id: (await reference(ctx)).id, item_description: 'r02 extra drawing' }, status: 201 })),
  ...group(keys('POST', 'transmittals/:id/status'), async ctx => ({ params: { id: (await transmittal(ctx)).id }, body: { status: 'sent' } })),
  ...group(['POST /api/docs/correspondence'], async ctx => ({ body: correspondenceBody(ctx), status: 201 })),
  ...group(['POST /api/docs/correspondence/:id/status'], async ctx => ({ params: { id: (await correspondence(ctx)).id }, body: { status: 'sent' } })),
  ...group(['POST /api/docs/correspondence/:id/amend'], async ctx => { const row = await correspondence(ctx); await ctx.api('POST', `/api/docs/correspondence/${row.id}/status`, { status: 'sent' }); return { params: { id: row.id }, body: { body: 'r02 corrected', note: 'r02 amendment' } }; }),
  ...group(['POST /api/client-portal/documents/:id/acknowledgement'], async ctx => {
    const c = await client(ctx); const doc = await document(ctx, { portal_visibility: 'client', confidentiality: 'public', doc_status: 'approved', recipient_organization_id: c.org.id });
    await ctx.db.query("UPDATE project_documents SET status = 'awaiting_acknowledgement' WHERE id = $1", [doc.id]);
    return { params: { id: doc.id }, body: { comment: 'r02 received' }, actor: c.actor };
  }),
};
