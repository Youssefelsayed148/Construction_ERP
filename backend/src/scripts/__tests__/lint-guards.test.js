const { countNumbering, countCounterIncrements, countUnboundActivityAudits, scan } = require('../lint-guards');

describe('lint-guards count-numbering', () => {
  test('ignores JavaScript Math.max arithmetic while detecting SQL COUNT/MAX numbering', () => {
    expect(countNumbering('const page = Math.max(1, offset) + 1;')).toBe(0);
    expect(countNumbering("SELECT COUNT(*) FROM invoices\nconst next = Number(row.count) + 1;")).toBe(1);
    expect(countNumbering("SELECT MAX(invoice_number) FROM invoices\nconst nextNumber = rows[0].max + 1;")).toBe(1);
  });
});

describe('lint-guards counter-rmw', () => {
  test('flags the read, JS +1, write pattern the document control engine used', () => {
    const oldEngine = [
      "const existing = (await q('SELECT id, seq FROM document_number_sequences WHERE ...')).rows[0];",
      "await q('UPDATE document_number_sequences SET seq = $1 WHERE id = $2', [num(existing.seq) + 1, existing.id]);",
      'parts.push(pad(num(seq.seq) + 1, settings.seq_pad));',
    ].join('\n');
    expect(countCounterIncrements(oldEngine)).toBe(2);
  });

  test('flags a bound counter write on its own and a JS increment on its own', () => {
    expect(countCounterIncrements("UPDATE numbering_sequences SET next_value = $1 WHERE id = $2")).toBe(1);
    expect(countCounterIncrements('const next = Number(row.next_value) + 1;')).toBe(1);
    expect(countCounterIncrements('const n = rec.invoice_seq + 1;')).toBe(1);
  });

  test('allows the atomic increment and unrelated arithmetic', () => {
    expect(countCounterIncrements('UPDATE document_counters SET last_value = last_value + 1 WHERE scope_key = $1 RETURNING last_value')).toBe(0);
    expect(countCounterIncrements('const total = items.length + 1;')).toBe(0);
    expect(countCounterIncrements('UPDATE tasks SET status = $1 WHERE id = $2')).toBe(0);
  });
});

describe('lint-guards transactional audit', () => {
  test('flags activity writes that do not receive the caller transaction query', () => {
    expect(countUnboundActivityAudits("await logActivity({ action: 'create' });")).toBe(1);
    expect(countUnboundActivityAudits("await logActivity({ action: 'create' }, { query: q });")).toBe(0);
  });

  test('every route-family audit is transaction-bound or the explicit completion sweep exception', () => {
    const violations = scan()['post-commit-audit'];
    expect(violations).toEqual({});
  });
});
