import React, { useCallback, useEffect, useState } from 'react';
import { accountMappingsApi, authService } from '../services/api';
import { useLocale } from '../hooks/useLocale';
import { ErrorState, LoadingState } from '../components/common/States';

export default function Settings() {
  const { t, locale } = useLocale();
  const user = authService.getCurrentUser();
  const [data, setData] = useState({ mappings: [], accounts: [] });
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = ['owner', 'admin'].includes(user?.role);
  const canConfirm = user?.role === 'owner';

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await accountMappingsApi.getAll(locale);
      const next = response.data || { mappings: [], accounts: [] };
      setData(next);
      setDrafts(Object.fromEntries((next.mappings || []).map((row) => [row.key, row.account_id])));
    } catch (loadError) { setError(loadError.message || t('finance.accountMappings.loadError')); }
    finally { setLoading(false); }
  }, [locale, t]);

  useEffect(() => { if (canManage) load(); else setLoading(false); }, [canManage, load]);

  const save = async (row) => {
    setBusyKey(row.key); setError(''); setNotice('');
    try {
      await accountMappingsApi.update(row.key, Number(drafts[row.key]));
      setNotice(t('finance.accountMappings.saved'));
      await load();
    } catch (saveError) { setError(saveError.message || t('finance.accountMappings.saveError')); }
    finally { setBusyKey(null); }
  };

  const recordConfirmation = async (row) => {
    setBusyKey(row.key); setError(''); setNotice('');
    try {
      await accountMappingsApi.confirmMapping(row.key);
      setNotice(t('finance.accountMappings.confirmed'));
      await load();
    } catch (confirmError) { setError(confirmError.message || t('finance.accountMappings.confirmError')); }
    finally { setBusyKey(null); }
  };

  return (
    <div className="page-container">
      <h1>{t('finance.accountMappings.title')}</h1>
      {!canManage && <div className="alert alert-danger" role="alert">{t('finance.accountMappings.denied')}</div>}
      {canManage && <>
        <p className="alert alert-warning" role="note">{t('finance.accountMappings.provisionalNotice')}</p>
        {notice && <p className="alert alert-success" role="status">{notice}</p>}
        {error && <ErrorState message={error} onRetry={load} />}
        {loading ? <LoadingState message={t('finance.accountMappings.loading')} /> : !error && (
          <div className="table-container">
            <table>
              <thead><tr>
                <th>{t('finance.accountMappings.purpose')}</th>
                <th>{t('finance.accountMappings.key')}</th>
                <th>{t('finance.accountMappings.account')}</th>
                <th>{t('finance.accountMappings.status')}</th>
                <th>{t('common.actions')}</th>
              </tr></thead>
              <tbody>{data.mappings.map((row) => (
                <tr key={row.key}>
                  <td>{t(`finance.accountMappingPurposes.${row.key}`)}</td>
                  <td><code>{row.key}</code></td>
                  <td>
                    <select aria-label={t('finance.accountMappings.selectAccount', { key: row.key })}
                      value={drafts[row.key] ?? row.account_id}
                      onChange={(event) => setDrafts((current) => ({ ...current, [row.key]: event.target.value }))}>
                      {data.accounts.map((account) => <option key={account.id} value={account.id}>
                        {account.code} · {account.display_name}
                      </option>)}
                    </select>
                  </td>
                  <td><span className={row.is_provisional ? 'badge badge-warning' : 'badge badge-success'}>
                    {row.is_provisional ? t('finance.accountMappings.unconfirmed') : t('finance.accountMappings.confirmedStatus')}
                  </span></td>
                  <td className="procurement-action-row">
                    <button type="button" className="btn btn-sm" disabled={busyKey === row.key || Number(drafts[row.key]) === Number(row.account_id)} onClick={() => save(row)}>
                      {t('common.save')}
                    </button>
                    {canConfirm && row.is_provisional && <button type="button" className="btn btn-sm btn-primary" disabled={busyKey === row.key} onClick={() => recordConfirmation(row)}>
                      {t('finance.accountMappings.confirmAction')}
                    </button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </>}
    </div>
  );
}
