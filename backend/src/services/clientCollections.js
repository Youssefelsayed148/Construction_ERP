'use strict';

const money = require('../utils/money');

// Direction is authoritative; NULL is the legacy AR value. Supplier payments
// must never become receipts, even if an old row retained the default direction.
const CLIENT_RECEIPT = "COALESCE(direction, 'ar') = 'ar' AND supplier_id IS NULL AND voided_at IS NULL";

async function summary(query) {
  return query(`SELECT
    COALESCE((SELECT SUM(amount) FROM payments WHERE ${CLIENT_RECEIPT}), 0) AS collected,
    COALESCE((SELECT SUM(amount) FROM invoices WHERE status NOT IN ('void', 'cancelled', 'credited')), 0) AS invoiced,
    COALESCE((SELECT SUM(amount) FROM expenses), 0) AS expenses,
    (SELECT COUNT(*) FROM invoices WHERE status = 'overdue'
      OR (due_date IS NOT NULL AND due_date < CURRENT_DATE AND status NOT IN ('paid', 'void', 'cancelled', 'credited', 'draft', 'approved')))::int AS overdue`);
}

function figures(row) {
  const collected = money.toMinor(row.collected || '0');
  const invoiced = money.toMinor(row.invoiced || '0');
  const expenses = money.toMinor(row.expenses || '0');
  const number = value => Number(money.format(value));
  return { collected: number(collected), invoiced: number(invoiced), expenses: number(expenses),
    outstanding: number(invoiced - collected), netProfit: number(collected - expenses) };
}

module.exports = { CLIENT_RECEIPT, summary, figures };
