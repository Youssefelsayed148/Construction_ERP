const journal = require('../../utils/journal');
const glPosting = require('../../services/glPosting');
const financeEngine = require('../../services/financeEngine');

describe('certificate GL posting rules', () => {
  let entry;
  beforeEach(() => {
    entry = null;
    jest.spyOn(journal, 'findEntries').mockResolvedValue([]);
    jest.spyOn(journal, 'postJournalEntry').mockImplementation(async (_q, data) => { entry = data; return { id: 91 }; });
  });
  afterEach(() => jest.restoreAllMocks());

  test('client invoice certificate posting separates retention, advance recovery, deductions, and tax', async () => {
    const result = await glPosting.postClientInvoice(jest.fn(), {
      id: 1, invoice_number: 'INV-1', amount: 90, tax_amount: 8, certified_gross: 100,
      retention_amount: 10, advance_recovery: 5, other_deductions: 3,
    });
    expect(result).toEqual({ id: 91 });
    expect(entry.lines.map((line) => [line.account, line.debit || line.credit])).toEqual([
      ['receivable', '90.00'],
      ['client_retention_receivable', '10.00'],
      ['client_advance_liability', '5.00'],
      ['client_other_deductions', '3.00'],
      ['revenue', '100.00'],
      ['vat_output', '8.00'],
    ]);
  });

  test('subcontractor certificate posting balances AP with retention, advance recovery, deductions and input tax', async () => {
    const result = await glPosting.postSubcontractorCertificate(jest.fn(), {
      id: 2, certificate_number: 'PC-2', gross_certified: 100, net_certificate: 90,
      retention_held: 10, advance_recovery: 5, other_deductions: 3, tax_amount: 8,
    });
    expect(result).toEqual({ id: 91 });
    expect(entry.lines.map((line) => [line.account, line.debit || line.credit])).toEqual([
      ['subcontractor_certificate_cost', '100.00'],
      ['vat_input', '8.00'],
      ['payable', '90.00'],
      ['subcontractor_retention_payable', '10.00'],
      ['subcontractor_advance_receivable', '5.00'],
      ['subcontractor_other_deductions', '3.00'],
    ]);
  });

  test('rejects certificate math that cannot balance', async () => {
    await expect(glPosting.postSubcontractorCertificate(jest.fn(), {
      id: 3, certificate_number: 'PC-3', gross_certified: 100, net_certificate: 90,
      retention_held: 10, advance_recovery: 4, other_deductions: 3, tax_amount: 8,
    })).rejects.toThrow('certificate lines do not balance');
    expect(journal.postJournalEntry).not.toHaveBeenCalled();
  });
});

describe('invoice line persistence', () => {
  test('writes bilingual, typed lines whose total matches the invoice amount', async () => {
    const q = jest.fn().mockResolvedValue({ rows: [] });
    const lines = await financeEngine.writeInvoiceLines(q, 22, [
      { line_type: 'work', description_en: 'Certified work', description_ar: 'أعمال معتمدة', amount: 100 },
      { line_type: 'retention', description_en: 'Retention withheld', description_ar: 'استقطاع ضمان', amount: -10 },
    ], 90);
    expect(lines).toHaveLength(2);
    expect(q).toHaveBeenCalledTimes(2);
    expect(q.mock.calls[0][1]).toEqual([22, 1, 'work', 'Certified work', 'Certified work', 'أعمال معتمدة', null, null, 1, null, 100, 100]);
    expect(q.mock.calls[1][1][11]).toBe(-10);
  });

  test('rejects line totals that do not match the invoice amount', async () => {
    const q = jest.fn();
    await expect(financeEngine.writeInvoiceLines(q, 22, [{ description: 'Work', amount: 100 }], 99))
      .rejects.toMatchObject({ error_code: 'invoice_lines_total_mismatch' });
    expect(q).not.toHaveBeenCalled();
  });
});
