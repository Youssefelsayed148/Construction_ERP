import { apiFetch } from '../services/apiClient';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, ClipboardList, DollarSign, Percent, RefreshCw, ShoppingCart } from 'lucide-react';
import { formatCurrency, formatDate, formatNumber, localizedName } from '../utils/formatters';
import { translateStatus } from '../i18n/enums';
import ProcurementWorkspace from '../components/project/ProcurementWorkspace';
import ProjectFinanceWorkbench from '../components/project/ProjectFinanceWorkbench';
import { useLocale } from '../hooks/useLocale';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;
const tokenHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

async function get(path) {
  const response = await apiFetch(`${API_URL}${path}`, { headers: tokenHeaders() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error || `Request failed (${response.status})`);
  return body.data;
}

const TABS = [
  ['materials', Boxes], ['inventory', Boxes], ['procurement', ShoppingCart],
  ['commercial', ClipboardList], ['valuations', ClipboardList], ['retention', Percent], ['finance', DollarSign],
];

const EMPTY = { materials: [], inventory: [], procurement: {}, commercial: null, valuations: [], retention: null, finance: null };

function Status({ value }) {
  const { t } = useLocale();
  return <span className="badge badge-info">{value ? translateStatus(t, value) : '\u2014'}</span>;
}

function Empty() {
  const { t } = useLocale();
  return <div className="card" style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: 28 }}>{t('projects.operations.noRecords')}</div>;
}

function ProjectOperations() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [active, setActive] = useState('materials');
  const [data, setData] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const { t } = useLocale();

  const load = useCallback(async () => {
    setLoading(true);
    const requests = {
      materials: get(`/materials/requirements?project_id=${id}`),
      inventory: get(`/warehouses?project_id=${id}`),
      procurement: get(`/procurement/project/${id}`),
      commercial: get(`/commercial/project/${id}/commercial`),
      valuations: get(`/invoices?project_id=${id}`),
      retention: get(`/finance-ledger/retention?project_id=${id}`),
      finance: get(`/finance/project/${id}`),
    };
    const entries = await Promise.all(Object.entries(requests).map(async ([key, promise]) => {
      try { return [key, await promise, false]; } catch { return [key, null, true]; }
    }));
    const next = { ...EMPTY }; const nextErrors = {};
    for (const [key, value, error] of entries) {
      if (error) nextErrors[key] = true;
      else next[key] = value;
    }
    setData(next); setErrors(nextErrors); setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="page-container project-operations">
      <div className="page-header operations-header">
        <div>
          <button className="btn" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /> {t('projects.operations.project')}</button>
          <h1 style={{ marginTop: 12 }}>{t('projects.operations.title')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('projects.operations.description')}</p>
        </div>
        <button className="btn" onClick={load} disabled={loading}><RefreshCw size={16} /> {t('projects.operations.refresh')}</button>
      </div>

      <div className="operations-tabs" role="tablist" aria-label={t('projects.operations.modules')}>
        {TABS.map(([key, Icon]) => (
          <button key={key} role="tab" aria-selected={active === key}
            className={`btn ${active === key ? 'btn-primary' : ''}`} onClick={() => setActive(key)}>
            <Icon size={16} /> {t(`projects.operations.tabs.${key}`)}
          </button>
        ))}
      </div>

      {errors[active] && <div className="alert alert-danger" role="alert">{t('projects.operations.loadError')}</div>}
      {loading ? <div className="card" style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /><span className="sr-only">{t('common.loading')}</span></div> : (
        <>
          {active === 'materials' && <Materials rows={data.materials || []} />}
          {active === 'inventory' && <Inventory rows={data.inventory || []} navigate={navigate} />}
          {active === 'procurement' && <ProcurementWorkspace projectId={id} />}
          {active === 'commercial' && <Commercial data={data.commercial} />}
          {active === 'valuations' && <Valuations rows={data.valuations || []} />}
          {active === 'retention' && <Retention data={data.retention} />}
          {active === 'finance' && <Finance data={data.finance} projectId={id} invoices={data.valuations || []} />}
        </>
      )}
    </div>
  );
}

function Materials({ rows }) {
  const { t } = useLocale();
  if (!rows.length) return <Empty />;
  return <div className="table-container"><table className="table"><thead><tr>{['material', 'location', 'boqItem', 'required', 'issued', 'remaining', 'needDate'].map((key) => <th key={key}>{t(`projects.operations.fields.${key}`)}</th>)}</tr></thead><tbody>
    {rows.map((row) => <tr key={row.id}><td>{row.material_code} — {localizedName(row, undefined, 'material_name')}</td><td>{row.location_name || '\u2014'}</td><td>{row.boq_item_code || row.boq_item_description || '\u2014'}</td><td>{formatNumber(row.required_quantity ?? row.planned_quantity ?? 0)}</td><td>{formatNumber(row.issued_quantity ?? 0)}</td><td>{formatNumber(row.remaining_quantity ?? row.net_requirement ?? 0)}</td><td>{formatDate(row.source_activity_date)}</td></tr>)}
  </tbody></table></div>;
}

function Inventory({ rows, navigate }) {
  const { t } = useLocale();
  if (!rows.length) return <Empty />;
  return <div className="operations-grid">{rows.map((row) => <div className="card" key={row.id}><h3>{localizedName(row, undefined, 'name')}</h3><p>{row.type || row.warehouse_type || t('projects.operations.warehouse')}</p><p style={{ color: 'var(--color-text-secondary)' }}>{localizedName(row, undefined, 'project_name') || t('projects.operations.projectWarehouse')}</p><button className="btn" onClick={() => navigate('/inventory')}>{t('projects.operations.openInventory')}</button></div>)}</div>;
}

function Commercial({ data }) {
  const { t } = useLocale();
  if (!data) return <Empty />;
  const metrics = [
    ['original_contract', data.original_contract_value], ['approved_variations', data.approved_variations],
    ['revised_contract', data.revised_contract_value], ['current_budget', data.current_budget],
    ['committed_cost', data.committed_cost], ['actual_cost', data.actual_cost],
    ['eac', data.eac], ['forecast_profit', data.forecast_profit],
    ['cash_contribution', data.cash_contribution],
  ];
  return <div className="stats-grid">{metrics.map(([key, value]) => <div className="stat-card" key={key}><div className="stat-label">{t(`commercial.fields.${key}`)}</div><div className="stat-value">{formatCurrency(value || 0)}</div></div>)}</div>;
}

function Valuations({ rows }) {
  const { t } = useLocale();
  if (!rows.length) return <Empty />;
  return <div className="table-container"><table className="table"><thead><tr>{['certificate', 'periodWork', 'certified', 'retention', 'netAmount', 'status', 'issueDate'].map((key) => <th key={key}>{t(`projects.operations.fields.${key}`)}</th>)}</tr></thead><tbody>
    {rows.map((row) => <tr key={row.id}><td>{row.invoice_number || `#${row.id}`}</td><td>{formatCurrency(row.gross_current_work || 0)}</td><td>{formatCurrency(row.certified_gross ?? row.amount ?? 0)}</td><td>{formatCurrency(row.retention_amount || 0)}</td><td>{formatCurrency(row.net_amount ?? row.amount ?? 0)}</td><td><Status value={row.status} /></td><td>{formatDate(row.issue_date)}</td></tr>)}
  </tbody></table></div>;
}

function Retention({ data }) {
  const { t } = useLocale();
  if (!data) return <Empty />;
  const metrics = [['held', data.held], ['released', data.released], ['balance', data.balance]];
  return <div className="stats-grid">{metrics.map(([key, value]) => <div className="stat-card" key={key}><div className="stat-label">{t(`projects.operations.metrics.${key}`)}</div><div className="stat-value">{formatCurrency(value || 0)}</div></div>)}</div>;
}

function Finance({ data, projectId, invoices }) {
  const { t } = useLocale();
  if (!data) return <Empty />;
  const metrics = [
    ['contractValue', data.contract_value], ['invoiced', data.total_invoiced], ['cashCollected', data.total_paid],
    ['outstanding', data.outstanding_balance], ['cashExpenses', data.total_expenses], ['forecastRevenue', data.forecast_revenue],
    ['eac', data.eac], ['forecastProfit', data.profit],
  ];
  return <>
    <div className="stats-grid">{metrics.map(([key, value]) => <div className="stat-card" key={key}><div className="stat-label">{t(`projects.operations.metrics.${key}`)}</div><div className="stat-value">{formatCurrency(value || 0)}</div></div>)}</div>
    <ProjectFinanceWorkbench projectId={projectId} invoices={invoices} />
  </>;
}

export default ProjectOperations;
