const { query } = require('../config/database');
const numbering = require('../services/numbering');

const generateJournalEntry = async ({ date, description, referenceId, referenceType, totalAmount, lines, createdBy = 1 }) => {
  try {
    const entryNumber = await numbering.nextNumber(query, { table: 'journal_entries', column: 'entry_number', prefix: 'JE', pad: 5 });

    const entryResult = await query(
      `INSERT INTO journal_entries (entry_number, date, description, reference_id, reference_type, total_amount, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [entryNumber, date, description, referenceId, referenceType, totalAmount, createdBy]
    );
    const entryId = entryResult.rows[0].id;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      await query(
        `INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description, line_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [entryId, line.accountId, line.debit || 0, line.credit || 0, line.description, i + 1]
      );
    }

    console.log(`[JOURNAL] Created ${entryNumber} for ${referenceType} #${referenceId}: ${description}`);
    return { entryId, entryNumber };
  } catch (error) {
    console.error('[JOURNAL] Failed to create entry:', error.message);
    return null;
  }
};

const journalExpenseCreated = async (expense) => {
  if (!expense.category || !expense.amount) return null;
  const categoryEn = expense.category?.toLowerCase?.() || expense.category;
  const expenseAccountId = ['salaries', 'payroll', 'salary'].includes(categoryEn) ? 8
    : ['cogs', 'cost'].includes(categoryEn) ? 9
    : 10;
  return generateJournalEntry({
    date: expense.date || new Date().toISOString().split('T')[0],
    description: `Expense: ${expense.category} - ${expense.description || ''}`,
    referenceId: expense.id,
    referenceType: 'expense',
    totalAmount: expense.amount,
    lines: [
      { accountId: expenseAccountId, debit: expense.amount, credit: 0, description: `Expense - ${expense.category}` },
      { accountId: 1, debit: 0, credit: expense.amount, description: 'Cash paid' }
    ]
  });
};

const journalPayrollPosted = async (payroll) => {
  const amount = payroll.total_net_salary || payroll.total_amount || 0;
  return generateJournalEntry({
    date: new Date().toISOString().split('T')[0],
    description: `Payroll - ${payroll.period_name || 'Monthly Payroll'}`,
    referenceId: payroll.id,
    referenceType: 'payroll',
    totalAmount: amount,
    lines: [
      { accountId: 8, debit: amount, credit: 0, description: 'Salary expenses' },
      { accountId: 1, debit: 0, credit: amount, description: 'Cash paid for salaries' }
    ]
  });
};

module.exports = {
  generateJournalEntry,
  journalExpenseCreated,
  journalPayrollPosted
};
