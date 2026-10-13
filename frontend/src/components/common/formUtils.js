// Convert API validation errors into field errors without exposing raw server messages.
export function mapServerErrors(error, fieldNames = []) {
  const body = error?.response?.data || error?.data || error;
  const result = {};
  const allowed = new Set(fieldNames);
  const fields = body?.details?.fields || body?.errors || body?.fields;
  if (Array.isArray(fields)) {
    fields.forEach((item) => {
      const name = item?.field || item?.path;
      if (name && (!allowed.size || allowed.has(name))) result[name] = item.code || item.message || body.code || 'validation';
    });
  } else if (fields && typeof fields === 'object') {
    Object.entries(fields).forEach(([name, value]) => {
      if (!allowed.size || allowed.has(name)) result[name] = typeof value === 'string' ? value : value?.code || 'validation';
    });
  }
  return result;
}

export function validateValues(values, rules = {}) {
  const errors = {};
  Object.entries(rules).forEach(([name, rule]) => {
    const value = values[name];
    const text = value == null ? '' : String(value).trim();
    if (rule.required && !text) errors[name] = 'required';
    else if (text && rule.maxLength && text.length > rule.maxLength) errors[name] = 'maxLength';
    else if (text && rule.pattern && !rule.pattern.test(text)) errors[name] = 'format';
    else if (text && rule.min != null && Number(value) < rule.min) errors[name] = 'min';
    else if (text && rule.max != null && Number(value) > rule.max) errors[name] = 'max';
  });
  return errors;
}
