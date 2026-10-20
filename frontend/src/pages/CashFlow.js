import React, { useCallback, useEffect, useState } from 'react';
import { apiJson, apiUrl } from '../services/apiClient';
import { useLocale } from '../hooks/useLocale';
import { formatCurrency } from '../utils/formatters';
import { errorMessage } from '../utils/errorMessage';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Wallet } from 'lucide-react';

// GET /api/finance-ledger/cash-flow (routes/financeLedger.js) — company-wide
// AR/AP aging buckets plus retention balances. Read-only; the backend policy
// (module finance-ledger, action view) is the enforcement point.
const BUCKETS = ['current', '1_30', '31_60', '61_90', '90_plus'];

function CashFlow() {
  const { t } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // apiJson throws the typed ApiError (stable error_code -> translation
      // key); a raw server English string is never rendered (utils/errorMessage).
      const body = await apiJson(apiUrl('/finance-ledger/cash-flow'), { headers: { 'Content-Type': 'application/json' } });
      setData(body?.data?.data || {});
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const agingValue = (aging, bucket) => Number((aging || {})[bucket] || 0);
  const isEmpty = data && BUCKETS.every((b) => agingValue(data.ar_aging, b) === 0)
    && BUCKETS.every((b) => agingValue(data.ap_aging, b) === 0)
    && Number(data.retention_receivable || 0) === 0 && Number(data.retention_payable || 0) === 0;

  const AgingTable = ({ titleKey, aging }) => (
    <div className="table-container">
      <h3>{t(titleKey)}</h3>
      <table className="table">
        <thead><tr><th>{t('finance.cashFlow.bucket')}</th><th>{t('finance.cashFlow.outstanding')}</th></tr></thead>
        <tbody>
          {BUCKETS.map((bucket) => (
            <tr key={bucket}>
              <td>{t(`finance.cashFlow.buckets.${bucket}`)}</td>
              <td>{formatCurrency(agingValue(aging, bucket))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('finance.cashFlow.title')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('finance.cashFlow.description')}</p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {t('finance.cashFlow.refresh')}
        </button>
      </div>

      {loading && <div className="card" style={{ padding: 40, textAlign: 'center' }} role="status" aria-busy="true"><span className="spinner" /><span className="sr-only">{t('common.loading')}</span></div>}

      {!loading && error && (
        <div className="alert alert-danger" role="alert">
          {errorMessage(error, t)}
          <button className="btn" style={{ marginInlineStart: '12px' }} onClick={load}>{t('finance.cashFlow.refresh')}</button>
        </div>
      )}

      {!loading && !error && data && isEmpty && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }} data-testid="cashflow-empty">
          <Wallet size={32} style={{ marginBottom: 8 }} />
          <p>{t('finance.cashFlow.empty')}</p>
        </div>
      )}

      {!loading && !error && data && !isEmpty && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ArrowDownRight size={14} style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                <div className="stat-label">{t('finance.cashFlow.retentionReceivable')}</div>
              </div>
              <div className="stat-value">{formatCurrency(Number(data.retention_receivable || 0))}</div>
            </div>
            <div className="stat-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ArrowUpRight size={14} style={{ color: 'var(--color-danger)' }} aria-hidden="true" />
                <div className="stat-label">{t('finance.cashFlow.retentionPayable')}</div>
              </div>
              <div className="stat-value">{formatCurrency(Number(data.retention_payable || 0))}</div>
            </div>
          </div>
          <div className="finance-record-grid">
            <AgingTable titleKey="finance.cashFlow.arAging" aging={data.ar_aging} />
            <AgingTable titleKey="finance.cashFlow.apAging" aging={data.ap_aging} />
          </div>
        </>
      )}
    </div>
  );
}

export default CashFlow;
