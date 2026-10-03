// General-ledger posting (Phase 2.7).
//
// postJournalEntry runs on the caller's query function: pass the transaction client and the entry commits or
// rolls back with the document that caused it. It THROWS on any problem (unknown account key, unbalanced or
// malformed lines); nothing is caught or logged-and-forgotten here, so a posting failure fails the caller's
// transaction. Account ids are not in code: lines name a configured account key (table gl_account_map, seeded from
// the chart of accounts by code in migration 0015) or, for tests and one-off entries, an explicit accountId.
// Amounts are decimal strings or numbers and are added exactly (utils/money), never as floats.
const numbering = require('../services/numbering');
const money = require('./money');

class JournalError extends Error {}

async function resolveAccounts(q, lines) {
  const keys = [...new Set(lines.filter((l) => l.account != null).map((l) => l.account))];
  const found = new Map();
  if (keys.length) {
    const r = await q('SELECT key, account_id FROM gl_account_map WHERE key = ANY($1::text[])', [keys]);
    for (const row of r.rows) found.set(row.key, row.account_id);
  }
  return lines.map((l, i) => {
    if (l.accountId != null) return l.accountId;
    if (l.account == null) throw new JournalError(`Journal line ${i + 1} names no account`);
    if (!found.has(l.account)) throw new JournalError(`Ledger account "${l.account}" is not configured (gl_account_map)`);
    return found.get(l.account);
  });
}

function checkLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) throw new JournalError('A journal entry needs at least two lines');
  let debit = 0n; let credit = 0n;
  const amounts = lines.map((l, i) => {
    const d = money.toMinor(l.debit == null ? 0 : l.debit);
    const c = money.toMinor(l.credit == null ? 0 : l.credit);
    if (d < 0n || c < 0n) throw new JournalError(`Journal line ${i + 1} has a negative amount; amounts are positive and the side says which way`);
    if ((d > 0n) === (c > 0n)) throw new JournalError(`Journal line ${i + 1} must carry an amount on exactly one side (debit or credit)`);
    debit += d; credit += c;
    return { d, c };
  });
  if (debit !== credit) throw new JournalError(`Journal entry does not balance: debit ${money.format(debit)} against credit ${money.format(credit)}`);
  return { amounts, total: debit };
}

async function postJournalEntry(q, { date, description, reference_type = null, reference_id = null, created_by = null, lines }) {
  if (!date) throw new JournalError('A journal entry needs a date');
  const { amounts, total } = checkLines(lines);
  const accountIds = await resolveAccounts(q, lines);
  const entryNumber = await numbering.nextNumber(q, { table: 'journal_entries', column: 'entry_number', prefix: 'JE', pad: 5 });
  const entry = await q(
    `INSERT INTO journal_entries (entry_number, date, description, reference_id, reference_type, total_amount, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [entryNumber, date, description || null, reference_id, reference_type, money.format(total), created_by]
  );
  const entryId = entry.rows[0].id;
  for (let i = 0; i < lines.length; i += 1) {
    await q(
      `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description, line_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [entryId, accountIds[i], money.format(amounts[i].d), money.format(amounts[i].c), lines[i].description || null, i + 1]
    );
  }
  return { entryId, entryNumber };
}

const findEntries = async (q, referenceType, referenceId) =>
  (await q('SELECT * FROM journal_entries WHERE reference_type = $1 AND reference_id = $2 ORDER BY id', [referenceType, referenceId])).rows;

// Expense: debit the account for its category, credit cash. Posted by the route inside the expense transaction.
const journalExpenseCreated = async (q, expense, createdBy) => {
  const category = String(expense.category || '').toLowerCase();
  const debitAccount = ['salaries', 'payroll', 'salary'].includes(category) ? 'salary_expense'
    : ['cogs', 'cost'].includes(category) ? 'material_cost'
    : 'other_expense';
  return postJournalEntry(q, {
    date: expense.date || new Date().toISOString().split('T')[0],
    description: `Expense: ${expense.category} - ${expense.description || ''}`,
    reference_id: expense.id, reference_type: 'expense', created_by: createdBy,
    lines: [
      { account: debitAccount, debit: expense.amount, description: `Expense - ${expense.category}` },
      { account: 'cash', credit: expense.amount, description: 'Cash paid' },
    ],
  });
};

const journalPayrollPosted = async (q, payroll, createdBy) => {
  const amount = payroll.total_net_salary || payroll.total_amount || 0;
  return postJournalEntry(q, {
    date: new Date().toISOString().split('T')[0],
    description: `Payroll - ${payroll.period_name || 'Monthly Payroll'}`,
    reference_id: payroll.id, reference_type: 'payroll', created_by: createdBy,
    lines: [
      { account: 'salary_expense', debit: amount, description: 'Salary expenses' },
      { account: 'cash', credit: amount, description: 'Cash paid for salaries' },
    ],
  });
};

module.exports = { JournalError, postJournalEntry, findEntries, journalExpenseCreated, journalPayrollPosted };
