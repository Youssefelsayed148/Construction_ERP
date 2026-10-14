import { formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent, localizedName } from './formatters';

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

  test('uses Arabic-Egypt locale digits and currency when requested', () => {
    expect(formatCurrency(1234.5, 'EGP', 'ar-EG')).toContain('ج.م.');
    expect(formatNumber(1234, { locale: 'ar-EG' })).toMatch(/[٠-٩]/);
    expect(formatPercent(42, 'ar-EG')).toMatch(/[٠-٩]/);
    expect(formatDate('2026-10-14', 'ar-EG')).toMatch(/[٠-٩]/);
    expect(formatDateTime('2026-10-14T10:30:00Z', 'ar-EG')).toMatch(/[٠-٩]/);
  });

  test('follows the document language when an explicit locale is omitted', () => {
    const prior = document.documentElement.lang;
    document.documentElement.lang = 'ar';
    try {
      expect(formatCurrency(12)).toContain('ج.م.');
      expect(formatNumber(12)).toMatch(/[٠-٩]/);
    } finally {
      document.documentElement.lang = prior;
    }
  });

  test('localized names prefer the active language and fall back to neutral then the other language', () => {
    const record = { name_ar: 'مشروع', name_en: 'Project' };
    expect(localizedName(record, 'ar')).toBe('مشروع');
    expect(localizedName(record, 'en')).toBe('Project');
    expect(localizedName({ name: 'Neutral', name_en: 'English' }, 'ar')).toBe('Neutral');
    expect(localizedName({ name_en: 'English' }, 'ar')).toBe('English');
  });
});
