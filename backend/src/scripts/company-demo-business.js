'use strict';

const { assertDemoTarget } = require('./company-demo-common');

async function seedApiRecords({ target, records, request }) {
  assertDemoTarget(target);
  if (!Array.isArray(records) || typeof request !== 'function') throw new Error('Refusing demo: invalid seed plan');
  let created = 0;
  const results = [];
  for (const record of records) {
    if (!record || typeof record.key !== 'string' || !record.key || typeof record.keyField !== 'string'
        || typeof record.listPath !== 'string' || typeof record.createPath !== 'string'
        || typeof record.account !== 'string' || !record.body || record.body[record.keyField] !== record.key) {
      throw new Error('Refusing demo: invalid stable-key record');
    }
    const listed = await request(record.account, record.listPath);
    if (listed.status !== 200 || !Array.isArray(listed.body?.data)) {
      throw new Error(`Demo list ${record.listPath}: HTTP ${listed.status}`);
    }
    const matching = listed.body.data.filter(row => row?.[record.keyField] === record.key);
    if (matching.length > 1) throw new Error(`Refusing demo: ambiguous stable key for ${record.keyField}`);
    if (matching.length === 1) {
      results.push({ key: record.key, id: matching[0].id, created: false });
      continue;
    }
    const response = await request(record.account, record.createPath, { method: 'POST', body: record.body });
    if (response.status !== 201 || !response.body?.data || response.body.data[record.keyField] !== record.key) {
      throw new Error(`Demo create ${record.createPath}: HTTP ${response.status}`);
    }
    created += 1;
    results.push({ key: record.key, id: response.body.data.id, created: true });
  }
  return { created, records: results };
}

module.exports = { seedApiRecords };
