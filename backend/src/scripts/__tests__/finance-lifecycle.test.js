// B1 (C-FIN-AR-001) — the ONE invoice lifecycle derivation, gated to the issued family.
// Draft and approved invoices never derive paid / partially_paid / overdue, no matter
// how past their due date is; only issued-family statuses (issued, sent,
// partially_paid, overdue) can move through the money lifecycle.

const finance = require('../../services/financeEngine');

const NOW = new Date('2026-10-19T10:00:00Z');
const PAST_DUE = '2026-09-01';

describe('computeLifecycleStatus — issued-family gating (B1)', () => {
  test('a past-due draft stays draft (never overdue)', () => {
    expect(finance.computeLifecycleStatus({ status: 'draft', amount: 1000, due_date: PAST_DUE }, 0, NOW)).toBe('draft');
  });

  test('a past-due approved invoice stays approved', () => {
    expect(finance.computeLifecycleStatus({ status: 'approved', amount: 1000, due_date: PAST_DUE }, 0, NOW)).toBe('approved');
  });

  test('a past-due draft stays draft even with recorded payments', () => {
    expect(finance.computeLifecycleStatus({ status: 'draft', amount: 1000, due_date: PAST_DUE }, 500, NOW)).toBe('draft');
  });

  test('a past-due sent invoice derives overdue', () => {
    expect(finance.computeLifecycleStatus({ status: 'sent', amount: 1000, due_date: PAST_DUE }, 0, NOW)).toBe('overdue');
  });

  test('a past-due issued invoice derives overdue', () => {
    expect(finance.computeLifecycleStatus({ status: 'issued', amount: 1000, due_date: PAST_DUE }, 0, NOW)).toBe('overdue');
  });

  test('a past-due partially_paid invoice derives overdue', () => {
    expect(finance.computeLifecycleStatus({ status: 'partially_paid', amount: 1000, due_date: PAST_DUE }, 100, NOW)).toBe('overdue');
  });

  test('an issued-family invoice fully covered by payments derives paid', () => {
    expect(finance.computeLifecycleStatus({ status: 'issued', amount: 1000, due_date: PAST_DUE }, 1000, NOW)).toBe('paid');
  });

  test('net_amount minus credited_amount is the payable base', () => {
    expect(finance.computeLifecycleStatus(
      { status: 'issued', amount: 100000, net_amount: 90000, credited_amount: 9000, due_date: PAST_DUE }, 90000, NOW
    )).toBe('paid');
    expect(finance.computeLifecycleStatus(
      { status: 'issued', amount: 100000, net_amount: 90000, credited_amount: 9000, due_date: PAST_DUE }, 0, NOW
    )).toBe('overdue');
  });

  test('terminal statuses pass through untouched', () => {
    expect(finance.computeLifecycleStatus({ status: 'credited', amount: 1000, due_date: PAST_DUE }, 0, NOW)).toBe('credited');
    expect(finance.computeLifecycleStatus({ status: 'void', amount: 1000, due_date: PAST_DUE }, 0, NOW)).toBe('void');
    expect(finance.computeLifecycleStatus({ status: 'cancelled', amount: 1000, due_date: PAST_DUE }, 0, NOW)).toBe('cancelled');
  });

  test('an issued invoice with no due date and no payments keeps its status', () => {
    expect(finance.computeLifecycleStatus({ status: 'sent', amount: 1000, due_date: null }, 0, NOW)).toBe('sent');
    expect(finance.computeLifecycleStatus({ status: 'issued', amount: 1000, due_date: null }, 0, NOW)).toBe('issued');
  });
});
