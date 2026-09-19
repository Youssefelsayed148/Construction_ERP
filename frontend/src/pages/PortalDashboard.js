import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, FolderKanban, ClipboardCheck, Building2, Truck, Send } from 'lucide-react';
import { authService } from '../services/api';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const CONFIG = {
  consultant: { title: 'Consultant Portal', endpoint: '/api/consultant/dashboard', extra: '/api/consultant/reviews', extraTitle: 'My Reviews', icon: ClipboardCheck },
  client: { title: 'Client Portal', endpoint: '/api/client-portal/dashboard', extra: '/api/client-portal/action-center', extraTitle: 'Action Center', icon: Building2 },
  subcontractor: { title: 'Subcontractor Portal', endpoint: '/api/portal/subcontractor/dashboard', icon: FolderKanban },
  supplier: { title: 'Supplier Portal', endpoint: '/api/portal/supplier/dashboard', icon: Truck },
};

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${path.startsWith('/api/client-portal/') && path !== '/api/client-portal/preview'
        ? (sessionStorage.getItem('clientPreviewToken') || localStorage.getItem('token'))
        : localStorage.getItem('token')}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body.data;
}

const label = (value) => String(value).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

function valueText(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  return null;
}

function Widget({ name, value }) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return (
      <section className="card portal-widget">
        <div className="card-header">{label(name)} <span className="badge badge-info">{value.length}</span></div>
        <div className="card-body">{value.length ? value.slice(0, 6).map((item, i) => <Record key={item?.id ?? i} value={item} />) : <em>No records</em>}</div>
      </section>
    );
  }
  if (typeof value !== 'object') {
    return <section className="card portal-widget"><div className="card-header">{label(name)}</div><div className="card-body portal-metric">{valueText(value)}</div></section>;
  }
  const items = Array.isArray(value.items) ? value.items : null;
  if (items) {
    return (
      <section className="card portal-widget">
        <div className="card-header">{label(name)} <span className="badge badge-info">{value.count ?? items.length}</span></div>
        <div className="card-body">
          {items.length ? items.slice(0, 6).map((item, i) => <Record key={item?.id ?? i} value={item} />) : <em>{value.empty_label || 'No records'}</em>}
        </div>
      </section>
    );
  }
  const simple = Object.entries(value).filter(([, v]) => valueText(v) != null);
  if (!simple.length) return null;
  return (
    <section className="card portal-widget">
      <div className="card-header">{label(name)}</div>
      <div className="card-body">{simple.map(([k, v]) => <div className="portal-row" key={k}><span>{label(k)}</span><strong>{valueText(v)}</strong></div>)}</div>
    </section>
  );
}

function Record({ value }) {
  if (value == null || typeof value !== 'object') return <div className="portal-record">{valueText(value)}</div>;
  const title = value.title || value.name || value.subject || value.number || value.order_number || value.contract_number || value.invoice_number || value.rfq_number || `Record #${value.id}`;
  const status = value.status || value.priority;
  const detail = value.amount ?? value.total_amount ?? value.net_certificate ?? value.deadline ?? value.due_date;
  return <div className="portal-record"><span>{title}</span><span>{detail != null ? valueText(detail) : ''} {status ? <small className="badge badge-secondary">{label(status)}</small> : null}</span></div>;
}

function QuickActions({ kind, data, onDone }) {
  const submit = async (path, body) => {
    await request(path, { method: 'POST', body: JSON.stringify(body) });
    onDone();
  };
  const createObservation = async () => {
    const project_id = Number(window.prompt('Project ID', data.project_ids?.[0] || ''));
    const title = window.prompt('Observation title');
    if (project_id && title) await submit('/api/consultant/observations', { project_id, title });
  };
  const createRfi = async () => {
    const sub_contract_id = Number(window.prompt('Package ID', data.packages?.[0]?.id || ''));
    const project_id = Number(data.packages?.find(p => p.id === sub_contract_id)?.project_id);
    const subject = window.prompt('RFI subject');
    const question = window.prompt('Question');
    if (project_id && sub_contract_id && subject && question != null) await submit('/api/portal/subcontractor/rfis', { project_id, sub_contract_id, subject, question });
  };
  const createSubmittal = async () => {
    const sub_contract_id = Number(window.prompt('Package ID', data.packages?.[0]?.id || ''));
    const project_id = Number(data.packages?.find(p => p.id === sub_contract_id)?.project_id);
    const title = window.prompt('Submittal title');
    if (project_id && sub_contract_id && title) await submit('/api/portal/subcontractor/submittals', { project_id, sub_contract_id, title });
  };
  const clarify = async () => {
    const id = Number(window.prompt('RFQ ID', data.open_rfqs?.items?.[0]?.id || ''));
    const message = window.prompt('Clarification question');
    if (id && message) await submit(`/api/portal/supplier/rfqs/${id}/clarifications`, { message });
  };
  const acknowledgePo = async () => {
    const id = Number(window.prompt('Purchase order ID', data.awarded_pos?.items?.[0]?.id || ''));
    if (id) await submit(`/api/portal/supplier/purchase-orders/${id}/acknowledge`, {});
  };
  const actions = kind === 'consultant'
    ? [['Raise observation', createObservation]]
    : kind === 'subcontractor'
      ? [['Submit RFI', createRfi], ['Submit submittal', createSubmittal]]
      : kind === 'supplier'
        ? [['Send clarification', clarify], ['Acknowledge PO', acknowledgePo]]
        : [];
  if (!actions.length) return null;
  return <div className="portal-actions">{actions.map(([text, fn]) => <button className="btn btn-primary btn-sm" key={text} onClick={() => fn().catch(e => window.alert(e.message))}><Send size={14} /> {text}</button>)}</div>;
}

export default function PortalDashboard({ kind }) {
  const config = CONFIG[kind];
  const Icon = config.icon;
  const [data, setData] = useState(null);
  const [extra, setExtra] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [previewToken, setPreviewToken] = useState(() => sessionStorage.getItem('clientPreviewToken'));
  const canPreview = kind === 'client' && ['owner', 'admin', 'project_manager'].includes(authService.getCurrentUser()?.role);

  const startPreview = async () => {
    const id = Number(window.prompt('Project ID to preview'));
    if (!Number.isInteger(id) || id <= 0) return;
    const result = await request('/api/client-portal/preview', { method: 'POST', body: JSON.stringify({ project_id: id }) });
    sessionStorage.setItem('clientPreviewToken', result.token);
    setProjectId(String(id));
    setPreviewToken(result.token);
  };
  const stopPreview = () => {
    sessionStorage.removeItem('clientPreviewToken');
    setPreviewToken(null);
    setProjectId('');
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const suffix = projectId ? `?project_id=${projectId}` : '';
      const [main, secondary, portfolio] = await Promise.all([
        request(`${config.endpoint}${suffix}`),
        config.extra ? request(`${config.extra}${suffix}`) : Promise.resolve(null),
        kind === 'client' ? request('/api/client-portal/portfolio') : Promise.resolve(null),
      ]);
      setData(main || {}); setExtra({ secondary, portfolio });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [config.endpoint, config.extra, kind, projectId]);

  useEffect(() => { load(); }, [load, previewToken]);
  const projectIds = useMemo(() => data?.project_ids || data?.projects?.map(p => p.id) || [], [data]);

  return (
    <div className="page-container portal-page">
      <header className="portal-header">
        <div><h1><Icon size={25} /> {config.title}</h1><p>Live project records scoped to your organization and assignments.</p></div>
        <div className="portal-toolbar">
          {projectIds.length > 1 && <select className="form-control" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">All projects</option>{projectIds.map(id => <option key={id} value={id}>Project {id}</option>)}</select>}
          {canPreview && (previewToken
            ? <button className="btn btn-secondary btn-sm" onClick={stopPreview}>Exit client preview</button>
            : <button className="btn btn-secondary btn-sm" onClick={() => startPreview().catch(e => setError(e.message))}>Preview as client</button>)}
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </header>
      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="card"><div className="card-body">Loading portal…</div></div>}
      {!loading && data && <>
        {data.note && <div className="alert alert-info">{data.note}</div>}
        {data.setup_actions?.map(action => <div className="alert alert-info" key={action}>{action}</div>)}
        {extra?.portfolio?.is_portfolio && <><h2 className="portal-section-title">Portfolio</h2><div className="portal-grid"><Widget name="Projects" value={extra.portfolio.items} /></div></>}
        <QuickActions kind={kind} data={data} onDone={load} />
        <div className="portal-grid">{Object.entries(data).filter(([key]) => !['note', 'setup_actions', 'project_ids', 'supplier_ids', 'visibility', 'preview'].includes(key)).map(([key, value]) => <Widget key={key} name={key} value={value} />)}</div>
        {extra?.secondary != null && <><h2 className="portal-section-title">{config.extraTitle}</h2><div className="portal-grid"><Widget name={config.extraTitle} value={extra.secondary} /></div></>}
      </>}
    </div>
  );
}
