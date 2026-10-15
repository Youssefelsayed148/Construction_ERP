'use strict';
const { group } = require('./util');
const webhookService = require('../../services/webhookService');
const body = ctx => ({ url: 'https://webhook-test.invalid/r02-stub', events: ['rfi.created'], project_ids: [ctx.pid], description: `r02 webhook ${ctx.n()}` });
const stubAdapters = () => {
  const originalCreate = webhookService.createWebhook;
  const originalAttempt = webhookService.attemptDelivery;
  webhookService.createWebhook = options => originalCreate({ ...options, lookup: async () => [{ address: '93.184.216.34', family: 4 }] });
  webhookService.attemptDelivery = async deliveryId => ({ retrying: true, attempt: 1, stubbed: true, deliveryId });
  return () => {
    webhookService.createWebhook = originalCreate;
    webhookService.attemptDelivery = originalAttempt;
  };
};
const hook = async ctx => {
  const restore = stubAdapters();
  try { return await ctx.api('POST', '/api/v1/webhooks', body(ctx), [201]); }
  finally { restore(); }
};
const delivery = async ctx => {
  const w = await hook(ctx);
  return ctx.one("INSERT INTO webhook_deliveries (webhook_id, event_type, entity_type, entity_id, payload, status, max_attempts) VALUES ($1,'rfi.created','project', $2, $3, 'dead_letter', 6) RETURNING id", [w.id, ctx.pid, JSON.stringify({ project_id: ctx.pid })]);
};
module.exports = {
  ...group(['POST /api/v1/webhooks'], async ctx => ({ body: body(ctx), status: 201, adapterStub: stubAdapters })),
  ...group(['PUT /api/v1/webhooks/:id'], async ctx => ({ params: { id: (await hook(ctx)).id }, body: { description: 'r02 updated webhook' }, adapterStub: stubAdapters })),
  ...group(['DELETE /api/v1/webhooks/:id'], async ctx => ({ params: { id: (await hook(ctx)).id }, adapterStub: stubAdapters })),
  ...group(['POST /api/v1/webhooks/:id/rotate-secret'], async ctx => ({ params: { id: (await hook(ctx)).id }, adapterStub: stubAdapters })),
  ...group(['POST /api/v1/webhooks/deliveries/:deliveryId/redrive'], async ctx => ({ params: { deliveryId: (await delivery(ctx)).id }, adapterStub: stubAdapters })),
};
