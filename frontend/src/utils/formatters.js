const formatCurrency = (amount, currency = 'EGP') => {
  if (amount === null || amount === undefined || isNaN(amount)) return `0.00 ${currency}`;
  const num = Number(amount);
  const formatted = num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
};

const formatNumber = (num, options = {}) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: options.decimals || 0,
    maximumFractionDigits: options.decimals || 0,
    useGrouping: options.noCommas !== true,
  });
};

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
};

const formatPercent = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '0%';
  return `${Math.round(Number(value))}%`;
};

export { formatCurrency, formatNumber, formatDate, formatPercent };
