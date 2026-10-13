const mappings = require('../../services/glAccountMappings');

describe('provisional GL account mappings', () => {
  test('lists purpose labels and confirmation state with the linked chart account', async () => {
    const q = jest.fn(async () => ({ rows: [{
      key: 'client_retention_receivable', account_id: 11, account_code: '1100', account_name_en: 'Receivable',
      account_name_ar: 'مدين', account_type: 'asset', is_provisional: true, confirmed_by: null, confirmed_at: null,
    }] }));
    await expect(mappings.listMappings(q)).resolves.toMatchObject([{
      key: 'client_retention_receivable', purpose_en: 'Client retention receivable', is_provisional: true, account_code: '1100',
    }]);
  });

  test('editing a mapping clears its owner confirmation and returns it to provisional', async () => {
    const q = jest.fn(async (sql) => sql.startsWith('SELECT id FROM accounts')
      ? { rows: [{ id: 23 }] }
      : { rows: [{ key: 'client_retention_receivable', account_id: 23, is_provisional: true, confirmed_by: null, confirmed_at: null }] });
    const saved = await mappings.updateMapping(q, 'client_retention_receivable', 23, 7);
    expect(saved).toMatchObject({ account_id: 23, is_provisional: true, confirmed_by: null, confirmed_at: null });
    expect(q.mock.calls[1][0]).toContain('confirmed_by = NULL');
  });

  test('only a catalog key can be updated', async () => {
    await expect(mappings.updateMapping(jest.fn(), 'untrusted_sql', 23, 7)).rejects.toMatchObject({ error_code: 'gl_account_mapping_not_found' });
  });

  test('confirmation is explicitly attributed to the owner actor', async () => {
    const q = jest.fn(async () => ({ rows: [{ key: 'cash', account_id: 1, is_provisional: false, confirmed_by: 9, confirmed_at: 'now' }] }));
    await expect(mappings.confirmMapping(q, 'cash', 9)).resolves.toMatchObject({ is_provisional: false, confirmed_by: 9 });
  });
});
