import { formatCurrency, formatDate, formatNumber, formatPercent } from './formatters';

describe('shared formatters', () => {
  test('formats financial and progress values consistently', () => {
    expect(formatCurrency(1234.5)).toBe('1,234.50 EGP');
    expect(formatNumber(1234.56, { decimals: 1 })).toBe('1,234.6');
    expect(formatPercent(42.4)).toBe('42%');
  });

  test('handles empty and invalid dates without throwing', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
