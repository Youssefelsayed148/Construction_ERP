'use strict';

function dateOnlyValue(value) {
  if (value == null) return value;
  if (value instanceof Date) {
    if (!Number.isFinite(value.valueOf())) return null;
    const pad = (part) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return typeof value === 'string' ? value.slice(0, 10) : value;
}

function normalizeDateFields(row, fields) {
  if (!row) return row;
  const normalized = { ...row };
  for (const field of fields) normalized[field] = dateOnlyValue(normalized[field]);
  return normalized;
}

module.exports = { dateOnlyValue, normalizeDateFields };
