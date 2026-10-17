const activeLocale = (locale) => {
  const selected = locale || (typeof document !== 'undefined' ? document.documentElement.lang : null);
  if (selected && String(selected).toLowerCase().startsWith('ar')) return selected === 'ar' ? 'ar-EG' : selected;
  if (selected && String(selected).toLowerCase().startsWith('en')) return selected;
  return 'en-US';
};

const formatCurrency = (amount, currency = 'EGP', locale) => {
  const language = activeLocale(locale);
  const num = amount === null || amount === undefined || isNaN(amount) ? 0 : Number(amount);
  const formatted = new Intl.NumberFormat(language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  const suffix = currency === 'EGP' && language.startsWith('ar') ? 'ج.م.' : currency;
  return `${formatted} ${suffix}`;
};

const formatNumber = (num, options = {}) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const locale = activeLocale(options.locale);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: options.decimals || 0,
    maximumFractionDigits: options.decimals || 0,
    useGrouping: options.noCommas !== true,
    ...(options.numberingSystem ? { numberingSystem: options.numberingSystem } : {}),
  }).format(Number(num));
};

const formatDate = (dateStr, locale) => {
  if (!dateStr) return '-';
  if (typeof dateStr === 'object' && !(dateStr instanceof Date)) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const language = activeLocale(locale);
    return new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-EG' : 'en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
    }).format(d);
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateValue, locale) => {
  if (!dateValue) return '-';
  if (typeof dateValue === 'object' && !(dateValue instanceof Date)) return '-';
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return dateValue;
    const language = activeLocale(locale);
    return new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-EG' : 'en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
  } catch {
    return dateValue;
  }
};

const formatPercent = (value, locale) => {
  const amount = value === null || value === undefined || isNaN(value) ? 0 : Math.round(Number(value));
  return new Intl.NumberFormat(activeLocale(locale), { style: 'percent', maximumFractionDigits: 0 }).format(amount / 100);
};

function localizedName(record, locale, fields = ['name']) {
  if (!record) return '';
  const language = activeLocale(locale);
  const bases = (Array.isArray(fields) ? fields : [fields]).filter(Boolean);
  const candidates = bases.flatMap((field) => language.startsWith('ar')
    ? [`${field}_ar`, field, `${field}_en`]
    : [`${field}_en`, field, `${field}_ar`]);
  for (const key of candidates) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
}

export { formatCurrency, formatNumber, formatDate, formatDateTime, formatPercent, localizedName };
