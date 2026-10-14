'use strict';

const { randomUUID } = require('crypto');
const { group } = require('./util');
const { world, po } = require('./proc-flow');

const valuationBody = async ctx => ({
  project_id: ctx.pid,
  client_id: (await ctx.one('INSERT INTO clients (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`r02-fin-${ctx.n()}`])).id,
  gross_current_work: 1000, retention: 100,
});
const invoice = async (ctx, issued = false) => {
  const row = await ctx.api('POST', '/api/finance-ledger/valuations', await valuationBody(ctx));
  if (issued) {
    await ctx.api('POST', `/api/finance-ledger/invoices/${row.id}/transition`, { status: 'approved' });
    await ctx.api('POST', `/api/finance-ledger/invoices/${row.id}/transition`, { status: 'issued' });
  }
  return row;
};
const supplierInvoice = async (ctx, withPo = false) => {
  if (withPo) {
    const w = await world(ctx);
    return ctx.one("INSERT INTO supplier_invoices (supplier_id, purchase_order_id, invoice_number, status, total_amount) VALUES ($1, $2, $3, 'approved', 1000) RETURNING *", [w.supplier, (await po(ctx, w)).id, `R02-FIN-${ctx.n()}`]);
  }
  const supplier = await ctx.one('INSERT INTO suppliers (code, name_en, name_ar) VALUES ($1, $1, $1) RETURNING id', [`r02-fin-${ctx.n()}`]);
  return ctx.one("INSERT INTO supplier_invoices (supplier_id, invoice_number, status, total_amount) VALUES ($1, $2, 'approved', 1000) RETURNING *", [supplier.id, `R02-FIN-${ctx.n()}`]);
};
const creditBody = async ctx => ({ party_type: 'client', invoice_id: (await invoice(ctx, true)).id, amount: 50, reason: 'r02 correction' });
const credit = async ctx => {
  const maker = await ctx.actor('owner');
  return ctx.as(maker, 'POST', '/api/finance-ledger/credit-notes', await creditBody(ctx));
};
const batchBody = async ctx => ({ items: [{ supplier_invoice_id: (await supplierInvoice(ctx)).id, project_id: ctx.pid, amount: 100 }] });
const batch = async (ctx, status = 'draft') => {
  const maker = await ctx.actor('owner');
  const row = await ctx.as(maker, 'POST', '/api/finance-ledger/payment-batches', await batchBody(ctx));
  if (status !== 'draft') await ctx.api('POST', `/api/finance-ledger/payment-batches/${row.id}/submit`, {});
  if (status === 'approved') await ctx.api('POST', `/api/finance-ledger/payment-batches/${row.id}/approve`, {});
  return row;
};
const releaseBody = async ctx => {
  await invoice(ctx, true); // A posted certificate establishes real held retention.
  return { project_id: ctx.pid, party_type: 'client', amount: 10, idempotency_key: randomUUID() };
};

module.exports = {
  ...group(['POST /api/finance-ledger/valuations', 'POST /api/v1/payment-certificates/valuations'], async ctx => ({ body: await valuationBody(ctx), status: 201 })),
  ...group(['POST /api/finance-ledger/invoices/:id/transition', 'POST /api/v1/invoices/:id/transition'], async ctx => ({ params: { id: (await invoice(ctx)).id }, body: { status: 'approved' } })),
  ...group(['POST /api/finance-ledger/payments/:id/allocate', 'POST /api/v1/invoices/payments/:id/allocate', 'POST /api/v1/payments/:id/allocate'], async ctx => {
    const inv = await invoice(ctx, true);
    const payment = await ctx.one("INSERT INTO payments (project_id, client_id, amount, payment_date, direction) VALUES ($1, $2, 100, CURRENT_DATE, 'ar') RETURNING id", [ctx.pid, inv.client_id]);
    return { params: { id: payment.id }, body: { allocations: [{ target_type: 'client_invoice', invoice_id: inv.id, amount: 100 }] }, status: 201 };
  }),
  ...group(['POST /api/finance-ledger/retention', 'POST /api/v1/invoices/retention'], async ctx => ({ body: { project_id: ctx.pid, party_type: 'client', direction: 'held', amount: 10 }, status: 201 })),
  ...group(['POST /api/finance-ledger/retention/releases'], async ctx => ({ body: await releaseBody(ctx), status: 201 })),
  ...group(['POST /api/finance-ledger/retention/releases/:id/void'], async ctx => ({ params: { id: (await ctx.api('POST', '/api/finance-ledger/retention/releases', await releaseBody(ctx))).id }, body: { reason: 'r02 correction' } })),
  ...group(['POST /api/finance-ledger/ap-review/:id/resolve'], async ctx => ({ params: { id: (await ctx.one("INSERT INTO ap_review_queue (supplier_invoice_id, exception_type, detail) VALUES ($1, 'missing_grn', 'r02 review') RETURNING id", [(await supplierInvoice(ctx, true)).id])).id } })),
  ...group(['PUT /api/finance-ledger/account-mappings/:key'], async ctx => {
    const map = await ctx.one("SELECT key, account_id FROM gl_account_map WHERE key = 'other_expense'");
    return { params: { key: map.key }, body: { account_id: map.account_id } };
  }),
  ...group(['POST /api/finance-ledger/account-mappings/:key/confirm'], async ctx => {
    await ctx.db.query("UPDATE gl_account_map SET is_provisional = TRUE, confirmed_by = NULL, confirmed_at = NULL WHERE key = 'other_expense'");
    return { params: { key: 'other_expense' } };
  }),
  ...group(['POST /api/finance-ledger/credit-notes', 'POST /api/v1/credit-notes'], async ctx => ({ body: await creditBody(ctx), status: 201 })),
  ...group(['POST /api/finance-ledger/credit-notes/:id/issue', 'POST /api/v1/credit-notes/:id/issue'], async ctx => ({ params: { id: (await credit(ctx)).id } })),
  ...group(['POST /api/finance-ledger/credit-notes/:id/void', 'POST /api/v1/credit-notes/:id/void'], async ctx => {
    const row = await credit(ctx);
    await ctx.api('POST', `/api/finance-ledger/credit-notes/${row.id}/issue`, {});
    return { params: { id: row.id }, body: { reason: 'r02 correction' } };
  }),
  ...group(['POST /api/finance-ledger/payment-batches', 'POST /api/v1/payment-batches'], async ctx => ({ body: await batchBody(ctx), status: 201 })),
  ...group(['POST /api/finance-ledger/payment-batches/:id/submit', 'POST /api/v1/payment-batches/:id/submit'], async ctx => ({ params: { id: (await batch(ctx)).id } })),
  ...group(['POST /api/finance-ledger/payment-batches/:id/approve', 'POST /api/v1/payment-batches/:id/approve'], async ctx => ({ params: { id: (await batch(ctx, 'submitted')).id } })),
  ...group(['POST /api/finance-ledger/payment-batches/:id/release', 'POST /api/v1/payment-batches/:id/release'], async ctx => ({ params: { id: (await batch(ctx, 'approved')).id } })),
  ...group(['POST /api/finance-ledger/payment-batches/:id/cancel', 'POST /api/v1/payment-batches/:id/cancel'], async ctx => ({ params: { id: (await batch(ctx)).id }, body: { reason: 'r02 correction' } })),
};
