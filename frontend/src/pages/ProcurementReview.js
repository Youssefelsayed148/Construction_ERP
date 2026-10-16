import { apiFetch } from '../services/apiClient';
import React, { useState } from 'react';
import { useLocale } from '../hooks/useLocale';
import LoadMore from '../components/common/LoadMore';
import { formatNumber } from '../utils/formatters';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const COLUMNS = [
  'supplier_name', 'compliant', 'lead_time_days', 'unit_price', 'total_price', 'payment_terms',
  'delivery_terms', 'tax_amount', 'warranty_months', 'deviations', 'technical_score', 'commercial_score',
];
const DOCUMENTS = ['rfq', 'technical-evaluation', 'commercial-comparison', 'award-recommendation'];

const NUMBER_COLUMNS = new Set(['lead_time_days', 'unit_price', 'total_price', 'tax_amount', 'warranty_months', 'technical_score', 'commercial_score']);
function cell(value, t, locale, key) {
  if (value == null || value === '') return '—';
  if (NUMBER_COLUMNS.has(key) && Number.isFinite(Number(value))) return formatNumber(value, { locale, decimals: Number.isInteger(Number(value)) ? 0 : 2 });
  if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no');
  if (Array.isArray(value)) return value.join(', ') || '—';
  return String(value);
}

export default function ProcurementReview() {
  const { t, locale, dir } = useLocale();
  const [rfqId, setRfqId] = useState('');
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);

  const load = async (event) => {
    event.preventDefault();
    setLoading(true); setError(''); setComparison(null);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/procurement/rfq/${Number(rfqId)}/comparison?limit=200&offset=0`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setComparison(body.data);
      const rawCount = response.headers?.get?.('X-Total-Count');
      setTotalCount(rawCount == null ? null : Number(rawCount));
    } catch { setError(t('procurement.comparison.loadError')); }
    finally { setLoading(false); }
  };

  const loadMore = async () => {
    if (!comparison) return;
    setLoadingMore(true);
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/procurement/rfq/${Number(rfqId)}/comparison?limit=200&offset=${comparison.rows.length}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      setComparison(current => ({ ...current, rows: [...current.rows, ...(body.data?.rows || [])] }));
      const rawCount = response.headers?.get?.('X-Total-Count');
      setTotalCount(rawCount == null ? null : Number(rawCount));
    } catch { setError(t('procurement.comparison.loadError')); }
    finally { setLoadingMore(false); }
  };

  const documentUrl = (kind) => `${API_BASE_URL}/api/procurement/documents/${kind}/${Number(rfqId)}`;
  const download = async (kind) => {
    try {
      const response = await apiFetch(documentUrl(kind), { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || `Download failed (${response.status})`);
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `${kind}-${rfqId}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch { setError(t('procurement.comparison.downloadError')); }
  };

  return <div className="page-container" dir={dir}>
    <h1>{t('procurement.comparison.title')}</h1>
    <p>{t('procurement.comparison.description')}</p>
    <form onSubmit={load} className="portal-toolbar" style={{ marginBottom: 16 }}>
      <label htmlFor="rfq-id">{t('procurement.comparison.rfqId')}</label>
      <input id="rfq-id" className="form-control" type="number" min="1" required value={rfqId} onChange={(e) => setRfqId(e.target.value)} />
      <button className="btn btn-primary" disabled={loading}>{loading ? t('common.loading') : t('procurement.comparison.compare')}</button>
    </form>
    {error && <div className="alert alert-danger">{error}</div>}
    {comparison && <>
      <h2>{comparison.rfq_number}</h2>
      <div className="portal-actions">
        {DOCUMENTS.map((kind) =>
          <button key={kind} className="btn btn-secondary btn-sm" onClick={() => download(kind)}>{t(`procurement.comparison.documents.${kind.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}`)}</button>)}
      </div>
      {comparison.rows.length ? <div className="table-container"><table className="table"><thead><tr>{COLUMNS.map((key) => <th key={key}>{t(`procurement.fields.${key}`)}</th>)}</tr></thead>
        <tbody>{comparison.rows.map((row) => <tr key={row.quotation_id}>{COLUMNS.map((key) => <td key={key}><bdi>{cell(row[key], t, locale, key)}</bdi></td>)}</tr>)}</tbody></table></div>
        : <p>{t('procurement.comparison.noQuotations')}</p>}
      <LoadMore loadedCount={comparison.rows.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={loadMore} />
      {comparison.recommendation && <div className="alert alert-info">{t('procurement.comparison.recommendation', {
        supplier: `\u2068${comparison.recommendation.supplier_name}\u2069`,
        reason: comparison.recommendation.reason_code
          ? t(`procurement.comparison.reasons.${comparison.recommendation.reason_code}`, { ...comparison.recommendation.reason_params, defaultValue: comparison.recommendation.reason })
          : cell(comparison.recommendation.reason, t),
      })}</div>}
    </>}
  </div>;
}
