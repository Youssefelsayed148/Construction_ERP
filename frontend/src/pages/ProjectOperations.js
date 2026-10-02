import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Boxes, ClipboardList, DollarSign, Percent, RefreshCw, ShoppingCart } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;
const tokenHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

async function get(path) {
  const response = await fetch(`${API_URL}${path}`, { headers: tokenHeaders() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) throw new Error(body.error || `Request failed (${response.status})`);
  return body.data;
}

const TABS = [
  ['materials', 'Material planning', Boxes],
  ['inventory', 'Inventory', Boxes],
  ['procurement', 'Procurement', ShoppingCart],
  ['commercial', 'Commercial', ClipboardList],
  ['valuations', 'Valuations', ClipboardList],
  ['retention', 'Retention', Percent],
  ['finance', 'Finance', DollarSign],
];

const EMPTY = { materials: [], inventory: [], procurement: {}, commercial: null, valuations: [], retention: null, finance: null };

function Status({ value }) {
  return <span className="badge badge-info">{value || '—'}</span>;
}

function Empty({ children = 'No records for this project yet.' }) {
  return <div className="card" style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: 28 }}>{children}</div>;
}

function ProjectOperations() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [active, setActive] = useState('materials');
  const [data, setData] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);

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
      try { return [key, await promise, null]; } catch (error) { return [key, null, error.message]; }
    }));
    const next = { ...EMPTY }; const nextErrors = {};
    for (const [key, value, error] of entries) {
      if (error) nextErrors[key] = error;
      else next[key] = value;
    }
    setData(next); setErrors(nextErrors); setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const procurementCounts = useMemo(() => Object.entries(data.procurement || {}).map(([key, rows]) => ({
    key, label: key.replaceAll('_', ' '), count: Array.isArray(rows) ? rows.length : 0,
  })), [data.procurement]);

  return (
    <div className="page-container project-operations">
      <div className="page-header operations-header">
        <div>
          <button className="btn" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /> Project</button>
          <h1 style={{ marginTop: 12 }}>Project operations</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>Materials, stock, procurement, commercial control and finance in one project-scoped workspace.</p>
        </div>
        <button className="btn" onClick={load} disabled={loading}><RefreshCw size={16} /> Refresh</button>
      </div>

      <div className="operations-tabs" role="tablist" aria-label="Project operations modules">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} role="tab" aria-selected={active === key}
            className={`btn ${active === key ? 'btn-primary' : ''}`} onClick={() => setActive(key)}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {errors[active] && <div className="alert alert-danger">{errors[active]}</div>}
      {loading ? <div className="card" style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div> : (
        <>
          {active === 'materials' && <Materials rows={data.materials || []} />}
          {active === 'inventory' && <Inventory rows={data.inventory || []} navigate={navigate} />}
          {active === 'procurement' && <Procurement counts={procurementCounts} data={data.procurement || {}} navigate={navigate} />}
          {active === 'commercial' && <Commercial data={data.commercial} />}
          {active === 'valuations' && <Valuations rows={data.valuations || []} />}
          {active === 'retention' && <Retention data={data.retention} />}
          {active === 'finance' && <Finance data={data.finance} />}
        </>
      )}
    </div>
  );
}

function Materials({ rows }) {
  if (!rows.length) return <Empty />;
  return <div className="table-container"><table className="table"><thead><tr><th>Material</th><th>Location</th><th>BOQ item</th><th>Required</th><th>Issued</th><th>Remaining</th><th>Need date</th></tr></thead><tbody>
    {rows.map((row) => <tr key={row.id}><td>{row.material_code} — {row.material_name_en || row.material_name_ar}</td><td>{row.location_name || '—'}</td><td>{row.boq_item_code || row.boq_item_description || '—'}</td><td>{row.required_quantity ?? row.planned_quantity ?? '—'}</td><td>{row.issued_quantity ?? 0}</td><td>{row.remaining_quantity ?? row.net_requirement ?? '—'}</td><td>{formatDate(row.source_activity_date)}</td></tr>)}
  </tbody></table></div>;
}

function Inventory({ rows, navigate }) {
  if (!rows.length) return <Empty />;
  return <div className="operations-grid">{rows.map((row) => <div className="card" key={row.id}><h3>{row.name}</h3><p>{row.type || row.warehouse_type || 'Warehouse'}</p><p style={{ color: 'var(--color-text-secondary)' }}>{row.project_name || 'Project warehouse'}</p><button className="btn" onClick={() => navigate('/inventory')}>Open inventory</button></div>)}</div>;
}

function Procurement({ counts, data, navigate }) {
  const recent = Object.entries(data).flatMap(([type, rows]) => (rows || []).slice(0, 5).map((row) => ({ ...row, _type: type })));
  return <>
    <div className="stats-grid">{counts.map((item) => <div className="stat-card" key={item.key}><div className="stat-label">{item.label}</div><div className="stat-value">{item.count}</div></div>)}</div>
    <div style={{ margin: '12px 0' }}><button className="btn" onClick={() => navigate('/procurement/comparison')}>Open quotation comparison</button></div>
    {!recent.length ? <Empty /> : <div className="table-container"><table className="table"><thead><tr><th>Stage</th><th>Reference</th><th>Title / supplier</th><th>Status</th><th>Created</th></tr></thead><tbody>{recent.map((row, index) => <tr key={`${row._type}-${row.id}-${index}`}><td>{row._type.replaceAll('_', ' ')}</td><td>{row.request_number || row.rfq_number || row.po_number || row.delivery_number || row.mir_number || row.grn_number || `#${row.id}`}</td><td>{row.title || row.supplier_name || row.notes || '—'}</td><td><Status value={row.status} /></td><td>{formatDate(row.created_at)}</td></tr>)}</tbody></table></div>}
  </>;
}

function Commercial({ data }) {
  if (!data) return <Empty />;
  const metrics = [
    ['Original contract', data.original_contract_value], ['Approved variations', data.approved_variations],
    ['Revised contract', data.revised_contract_value], ['Current budget', data.current_budget],
    ['Committed cost', data.committed_cost], ['Actual cost', data.actual_cost],
    ['EAC', data.eac], ['Forecast profit', data.forecast_profit],
  ];
  return <div className="stats-grid">{metrics.map(([label, value]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{formatCurrency(value || 0)}</div></div>)}</div>;
}

function Valuations({ rows }) {
  if (!rows.length) return <Empty />;
  return <div className="table-container"><table className="table"><thead><tr><th>Certificate</th><th>Period work</th><th>Certified</th><th>Retention</th><th>Net amount</th><th>Status</th><th>Issued</th></tr></thead><tbody>
    {rows.map((row) => <tr key={row.id}><td>{row.invoice_number || `#${row.id}`}</td><td>{formatCurrency(row.gross_current_work || 0)}</td><td>{formatCurrency(row.certified_gross ?? row.amount ?? 0)}</td><td>{formatCurrency(row.retention_amount || 0)}</td><td>{formatCurrency(row.net_amount ?? row.amount ?? 0)}</td><td><Status value={row.status} /></td><td>{formatDate(row.issue_date)}</td></tr>)}
  </tbody></table></div>;
}

function Retention({ data }) {
  if (!data) return <Empty />;
  const metrics = [['Held', data.held], ['Released', data.released], ['Balance', data.balance]];
  return <div className="stats-grid">{metrics.map(([label, value]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{formatCurrency(value || 0)}</div></div>)}</div>;
}

function Finance({ data }) {
  if (!data) return <Empty />;
  const metrics = [
    ['Contract value', data.contract_value], ['Invoiced', data.total_invoiced], ['Cash collected', data.total_paid],
    ['Outstanding', data.outstanding_balance], ['Cash expenses', data.total_expenses], ['Forecast revenue', data.forecast_revenue],
    ['EAC', data.eac], ['Forecast profit', data.profit],
  ];
  return <div className="stats-grid">{metrics.map(([label, value]) => <div className="stat-card" key={label}><div className="stat-label">{label}</div><div className="stat-value">{formatCurrency(value || 0)}</div></div>)}</div>;
}

export default ProjectOperations;
