// B1 demo-data repair (PREPARE ONLY, guarded + idempotent).
//
// INV-0005, INV-0009 and INV-0010 in the demo database received client receipts while missing
// the matching client_invoice GL posting (AR vs GL deltas of 90,000 and 900), leaving the
// receivable control account out of step with the invoices subledger. This script posts the
// missing client_invoice entries through glPosting.postClientInvoice — never by raw SQL.
//
// Safety contract:
//   * default is a DRY RUN: the posting is attempted inside a transaction that is ROLLED BACK;
//     only what WOULD be posted is printed. `--apply` is required to commit.
//   * refuses to run unless the target database name is exactly `construction_erp_demo`
//     (the pilot database is a different name and can never match).
//   * idempotent: postClientInvoice refuses a second posting for an invoice, so reruns are no-ops.
//
// Usage: node src/scripts/repair-demo-ar-postings.js [--apply]
'use strict';

const REQUIRED_DB_NAME = 'construction_erp_demo';
const TARGET_INVOICES = ['INV-0005', 'INV-0009', 'INV-0010'];
const { Client } = require('pg');
const glPosting = require('../services/glPosting');

function buildConfig() {
  const name = process.env.DB_NAME || 'construction_erp';
  if (name !== REQUIRED_DB_NAME) {
    throw new Error(`Refusing repair: this script only ever runs against the "${REQUIRED_DB_NAME}" demo database (DB_NAME is "${name}").`);
  }
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '5432', 10);
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`Refusing repair: DB_HOST must be local (got "${host}").`);
  }
  return { host, port, database: name, user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || '' };
}

async function inspect(client, invoiceNumber) {
  const invoice = (await client.query(
    `SELECT id, invoice_number, status, amount, net_amount, credited_amount, client_id, project_id, issue_date
       FROM invoices WHERE invoice_number = $1`, [invoiceNumber])).rows[0];
  if (!invoice) return { invoiceNumber, missing: true };
  const receipts = (await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS live
       FROM payments WHERE invoice_id = $1 AND COALESCE(direction, 'ar') = 'ar' AND voided_at IS NULL`,
    [invoice.id])).rows[0];
  const glInvoice = (await client.query(
    "SELECT COUNT(*)::int AS c FROM journal_entries WHERE reference_type = 'client_invoice' AND reference_id = $1",
    [invoice.id])).rows[0].c;
  const glPayments = (await client.query(
    `SELECT COUNT(*)::int AS c FROM journal_entries je
       JOIN payments p ON p.id = je.reference_id
      WHERE je.reference_type = 'client_payment' AND p.invoice_id = $1 AND p.voided_at IS NULL`,
    [invoice.id])).rows[0].c;
  return { invoiceNumber, missing: false, invoice, receipts: Number(receipts.total), liveReceipts: receipts.live, glInvoiceEntries: glInvoice, glPaymentEntries: glPayments };
}

async function run() {
  const apply = process.argv.includes('--apply');
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    console.log('Usage: node src/scripts/repair-demo-ar-postings.js [--apply]  (default: dry run, rolls back)');
    return;
  }
  const config = buildConfig();
  const db = new Client(config);
  await db.connect();
  try {
    for (const invoiceNumber of TARGET_INVOICES) {
      const state = await inspect(db, invoiceNumber);
      if (state.missing) {
        console.log(`[DRY?] ${invoiceNumber}: not found — skipped`);
        continue;
      }
      const { invoice } = state;
      const net = Number(invoice.net_amount) > 0 ? Number(invoice.net_amount) : Number(invoice.amount);
      console.log(`${apply ? 'APPLY' : 'DRY '} ${invoiceNumber} #${invoice.id} status=${invoice.status} amount=${invoice.amount} net=${net} liveReceipts=${state.liveReceipts} receiptsTotal=${state.receiptsTotal} client_invoiceEntries=${state.glInvoiceEntries} client_paymentEntries=${state.glPaymentEntries}`);
      if (state.glInvoiceEntries > 0) {
        console.log(`      already posted (idempotent skip)`);
        continue;
      }
      if (apply) {
        await db.query('BEGIN');
        try {
          const entry = await glPosting.postClientInvoice(db.query.bind(db), invoice, { userId: null });
          const verify = (await db.query(
            "SELECT COUNT(*)::int AS c FROM journal_entries WHERE reference_type = 'client_invoice' AND reference_id = $1",
            [invoice.id])).rows[0].c;
          await db.query('COMMIT');
          console.log(`      posted client_invoice entry ${(entry && entry.entryNumber) || '(already present)'}; entries now ${verify}`);
        } catch (error) {
          await db.query('ROLLBACK');
          throw error;
        }
      } else {
        // Dry run: attempt the real posting path, then roll everything back.
        await db.query('BEGIN');
        try {
          const entry = await glPosting.postClientInvoice(db.query.bind(db), invoice, { userId: null });
          if (entry) {
            const lines = (await db.query(
              `SELECT gam.key AS account, jel.debit, jel.credit
                 FROM journal_entry_lines jel
                 JOIN gl_account_map gam ON gam.account_id = jel.account_id
                WHERE jel.journal_entry_id = $1 ORDER BY jel.line_order`, [entry.entryId])).rows;
            for (const line of lines) {
              console.log(`      would post ${line.account}: debit=${line.debit || 0} credit=${line.credit || 0} (${entry.entryNumber})`);
            }
          } else {
            console.log('      would post: nothing (glPosting declined — already posted)');
          }
        } finally {
          await db.query('ROLLBACK');
        }
        console.log('      DRY RUN — transaction rolled back, nothing written');
      }
    }
    console.log(apply ? 'Done (applied).' : 'Done (dry run only; pass --apply to commit).');
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  run().catch((error) => { console.error('Repair failed (nothing committed unless --apply completed):', error.message); process.exitCode = 1; });
}

module.exports = { buildConfig, inspect, TARGET_INVOICES, REQUIRED_DB_NAME };
