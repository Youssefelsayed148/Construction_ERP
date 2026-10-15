'use strict';

const { Pool } = require('pg');
const finance = require('../../services/financeEngine');

const enabled = process.env.TEST_PG === '1';
const describePg = enabled ? describe : describe.skip;
const dayMs = 86400000;
const now = new Date('2026-10-15T00:00:00.000Z');
const dateAt = (days) => new Date(now.getTime() - days * dayMs).toISOString().slice(0, 10);

async function legacyAging(q, table, { now: asOf }) {
  const isAr = table === 'invoices';
  const invoices = (await q(`SELECT * FROM ${table}`)).rows.filter((invoice) => (
    isAr ? !['cancelled', 'void'].includes(invoice.status) : invoice.status !== 'paid'
  ));
  const result = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
  for (const invoice of invoices) {
    const net = isAr
      ? (invoice.net_amount != null && Number(invoice.net_amount) > 0 ? Number(invoice.net_amount) : Number(invoice.amount || 0))
      : Number(invoice.total_amount || 0);
    if (isAr && net <= 0) continue;
    const allocs = (await q(
      `SELECT * FROM payment_allocations WHERE ${isAr ? 'invoice_id' : 'supplier_invoice_id'} = $1 AND target_type = $2 AND voided_at IS NULL`,
      [invoice.id, isAr ? 'client_invoice' : 'supplier_invoice']
    )).rows;
    const allocated = finance.round2(allocs.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0));
    const outstanding = finance.round2(net - Number(invoice.credited_amount || 0) - allocated);
    if (outstanding <= 0) continue;
    const due = isAr ? invoice.due_date : (invoice.invoice_date || invoice.created_at);
    const overdueDays = due ? Math.floor((asOf.getTime() - new Date(due).getTime()) / dayMs) : 0;
    const bucket = overdueDays <= 0 ? 'current'
      : overdueDays <= 30 ? '1_30'
        : overdueDays <= 60 ? '31_60'
          : overdueDays <= 90 ? '61_90' : '90_plus';
    result[bucket] = finance.round2(result[bucket] + outstanding);
  }
  return result;
}

describePg('R3.2 aggregate finance aging equivalence (PostgreSQL)', () => {
  let pool;
  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    });
  });
  afterAll(async () => { await pool?.end(); });

  test('AR and AP buckets equal the prior per-document implementation', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const q = (sql, params) => client.query(sql, params);
      const tag = String(Date.now()).slice(-8);
      const clientId = (await q(
        "INSERT INTO clients (name_en, name_ar) VALUES ($1, $1) RETURNING id", [`r32-client-${tag}`]
      )).rows[0].id;
      const projectId = (await q(
        "INSERT INTO projects (name, name_en, code, client_id, status) VALUES ($1, $1, $2, $3, 'active') RETURNING id",
        [`r32-project-${tag}`, `R32${tag}`, clientId]
      )).rows[0].id;
      const supplierId = (await q(
        "INSERT INTO suppliers (name_en, name_ar, code) VALUES ($1, $1, $2) RETURNING id",
        [`r32-supplier-${tag}`, `R32S${tag}`]
      )).rows[0].id;
      const paymentId = (await q(
        "INSERT INTO payments (project_id, client_id, amount, payment_date, direction) VALUES ($1, $2, 10000, CURRENT_DATE, 'ar') RETURNING id",
        [projectId, clientId]
      )).rows[0].id;

      const arInputs = [
        { key: 'ar30', amount: 100, net: 125, credited: 10, days: 30, status: 'sent' },
        { key: 'ar31', amount: 200, net: 200, credited: 25, days: 31, status: 'issued' },
        { key: 'ar61', amount: 90, net: 90, credited: 0, days: 61, status: 'draft' },
        { key: 'ar91', amount: 60, net: 60, credited: 0, days: 91, status: 'issued' },
        { key: 'arCurrent', amount: 75, net: 0, credited: 0, days: null, status: 'draft' },
        { key: 'arFuture', amount: 40, net: 40, credited: 0, days: -2, status: 'issued' },
        { key: 'arCancelled', amount: 500, net: 500, credited: 0, days: 91, status: 'cancelled' },
        { key: 'arVoid', amount: 500, net: 500, credited: 0, days: 91, status: 'void' },
      ];
      const arIds = {};
      for (const input of arInputs) {
        const dueDate = input.days == null ? null : dateAt(input.days);
        arIds[input.key] = (await q(`
          INSERT INTO invoices (invoice_number, project_id, client_id, amount, net_amount, credited_amount,
                                issue_date, due_date, status)
          VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, $7, $8) RETURNING id`,
        [`R32-${tag}-${input.key}`.slice(0, 20), projectId, clientId, input.amount, input.net, input.credited, dueDate, input.status]
        )).rows[0].id;
      }
      await q(`
        INSERT INTO payment_allocations (payment_id, target_type, invoice_id, amount, voided_at)
        VALUES ($1, 'client_invoice', $2, 10, NULL), ($1, 'client_invoice', $2, 2.50, NULL),
               ($1, 'client_invoice', $3, 25, NULL), ($1, 'client_invoice', $4, 999, NOW())`,
      [paymentId, arIds.ar30, arIds.ar31, arIds.ar91]);

      const apInputs = [
        { key: 'ap30', total: 100, credited: 5, days: 30, status: 'received' },
        { key: 'ap31', total: 200, credited: 25, days: 31, status: 'received' },
        { key: 'ap61', total: 90, credited: 0, days: 61, status: 'received' },
        { key: 'ap91', total: 60, credited: 0, days: 91, status: 'approved' },
        { key: 'apCreated', total: 75, credited: 0, days: null, status: 'received', createdDays: 15 },
        { key: 'apPaid', total: 500, credited: 0, days: 91, status: 'paid' },
      ];
      const apIds = {};
      for (const input of apInputs) {
        const invoiceDate = input.days == null ? null : dateAt(input.days);
        const createdAt = new Date(now.getTime() - (input.createdDays || 0) * dayMs);
        apIds[input.key] = (await q(`
          INSERT INTO supplier_invoices (invoice_number, supplier_id, invoice_date, total_amount,
                                         credited_amount, status, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [`R32-${tag}-${input.key}`.slice(0, 30), supplierId, invoiceDate, input.total, input.credited, input.status, createdAt]
        )).rows[0].id;
      }
      await q(`
        INSERT INTO payment_allocations (payment_id, target_type, supplier_invoice_id, amount, voided_at)
        VALUES ($1, 'supplier_invoice', $2, 10, NULL), ($1, 'supplier_invoice', $2, 2.50, NULL),
               ($1, 'supplier_invoice', $3, 25, NULL), ($1, 'supplier_invoice', $4, 999, NOW())`,
      [paymentId, apIds.ap30, apIds.ap31, apIds.ap91]);

      expect(await finance.arAging(q, { now })).toEqual(await legacyAging(q, 'invoices', { now }));
      expect(await finance.apAging(q, { now })).toEqual(await legacyAging(q, 'supplier_invoices', { now }));
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });
});
