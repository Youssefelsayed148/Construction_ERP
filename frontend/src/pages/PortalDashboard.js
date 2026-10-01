import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, FolderKanban, ClipboardCheck, Building2, Truck, Send } from 'lucide-react';
import { authService } from '../services/api';
import { openProtectedFile } from '../components/ProtectedMedia';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

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
  return <div className="portal-record"><span>{value.file_url ? <a href="#open-file" onClick={e => { e.preventDefault(); openProtectedFile(value.file_url).catch(error => window.alert(error.message)); }}>{title}</a> : title}</span><span>{detail != null ? valueText(detail) : ''} {status ? <small className="badge badge-secondary">{label(status)}</small> : null}</span></div>;
}

function QuickActions({ kind, data, onDone }) {
  const submit = async (path, body) => {
    await request(path, { method: 'POST', body: JSON.stringify(body) });
    onDone();
  };
  const pickPackage = () => {
    const id = Number(window.prompt('Awarded package ID', data.packages?.[0]?.id || ''));
    return data.packages?.find((p) => Number(p.id) === id) || null;
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const uploadFiles = async () => {
    const files = await new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.multiple = true;
      input.onchange = () => resolve(Array.from(input.files || []));
      input.click();
    });
    if (!files.length) return [];
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, body: form,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Upload failed');
    return body.data.map((file) => ({ file_name: file.original_name, file_url: file.file_url }));
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
  const advanceObservation = async () => {
    const id = Number(window.prompt('Observation ID', data.observations_awaiting_verification?.items?.[0]?.id || ''));
    const action = window.prompt('Action: acknowledge, assign, start_rectification, submit_for_verification, accept, reject, close', 'accept');
    const comment = window.prompt('Comment', '') || '';
    if (id && action) await submit(`/api/consultant/observations/${id}/advance`, { action, comment });
  };
  const reviewRfi = async () => {
    const id = Number(window.prompt('RFI ID', data.rfis_awaiting_response?.items?.[0]?.id || ''));
    const stage = window.prompt('Stage: coordinator, discipline_review, official_response', 'coordinator');
    const body = window.prompt('Review or official response');
    if (id && stage && body) await submit(`/api/consultant/rfis/${id}/response`, { stage, body });
  };
  const reviewSubmittal = async () => {
    const id = Number(window.prompt('Submittal ID', data.submittals_awaiting_review?.items?.[0]?.id || ''));
    const stage = window.prompt('Stage: internal_technical_review, pm, consultant_coordinator, reviewer, response', 'consultant_coordinator');
    const comments = window.prompt('Review comments', '') || '';
    const response_code = stage === 'response' ? window.prompt('Response code: A, B, C or D', 'A') : null;
    if (id && stage && (stage !== 'response' || response_code)) await submit(`/api/consultant/submittals/${id}/response`, { stage, comments, ...(response_code ? { response_code } : {}) });
  };
  const acknowledgeContract = async () => {
    const pkg = pickPackage();
    if (pkg) await submit(`/api/portal/subcontractor/contracts/${pkg.id}/acknowledge`, {});
  };
  const acknowledgeInstruction = async () => {
    const pkg = pickPackage();
    const id = Number(window.prompt('Engineer instruction ID'));
    if (pkg && id) await submit(`/api/portal/subcontractor/instructions/${id}/acknowledge`, { project_id: pkg.project_id });
  };
  const submitQuantity = async () => {
    const pkg = pickPackage();
    const boq_item_id = Number(window.prompt('BOQ item ID'));
    const quantity_claimed = Number(window.prompt('Quantity claimed'));
    if (pkg && boq_item_id && quantity_claimed > 0) await submit('/api/portal/subcontractor/quantities', {
      sub_contract_id: pkg.id, boq_item_id, period_from: today(), period_to: today(), quantity_claimed,
    });
  };
  const submitPaymentApplication = async () => {
    const pkg = pickPackage();
    const work_value = Number(window.prompt('Work value this period'));
    if (pkg && work_value > 0) await submit('/api/portal/subcontractor/payment-applications', {
      project_id: pkg.project_id, sub_contract_id: pkg.id, period_from: today(), period_to: today(), work_value,
    });
  };
  const sendSubSubmission = (submissionKind) => async () => {
    const pkg = pickPackage();
    const related_entity_id = Number(window.prompt('Related record ID (optional)', '')) || null;
    const note = window.prompt('Submission details');
    if (pkg && note) await submit(`/api/portal/subcontractor/submissions/${submissionKind}`, {
      project_id: pkg.project_id, related_entity_type: submissionKind, related_entity_id,
      payload: { sub_contract_id: pkg.id, note },
    });
  };
  const acknowledgeRfi = async () => {
    const id = Number(window.prompt('Answered RFI ID', data.rfis?.items?.[0]?.id || ''));
    if (id) await submit(`/api/portal/subcontractor/rfis/${id}/acknowledge`, { body: 'Acknowledged' });
  };
  const resubmitSubmittal = async () => {
    const id = Number(window.prompt('Submittal ID requiring resubmission'));
    const comments = window.prompt('What changed in this revision?');
    if (id && comments) await submit(`/api/portal/subcontractor/submittals/${id}/resubmit`, { comments });
  };
  const quoteRfq = async () => {
    const id = Number(window.prompt('RFQ ID', data.open_rfqs?.items?.[0]?.id || ''));
    if (!id) return;
    const rfq = await request(`/api/portal/supplier/rfqs/${id}`);
    const supplier_id = rfq.supplier_ids.length === 1 ? rfq.supplier_ids[0]
      : Number(window.prompt('Supplier organization ID', rfq.supplier_ids[0]));
    if (!rfq.supplier_ids.includes(supplier_id)) return;
    const lines = [];
    for (const line of rfq.lines) {
      const entered = window.prompt(`Unit price for ${line.description || line.material_id} (${line.quantity} ${line.unit || ''})`);
      if (entered == null || entered === '' || Number(entered) < 0) return;
      lines.push({ rfq_line_id: line.id, quantity: Number(line.quantity), unit_price: Number(entered) });
    }
    await submit(`/api/portal/supplier/rfqs/${id}/quotations`, { supplier_id, lines });
  };
  const proposeDelivery = async () => {
    const id = Number(window.prompt('Purchase order ID', data.awarded_pos?.items?.[0]?.id || ''));
    const proposed_date = window.prompt('Proposed delivery date (YYYY-MM-DD)', today());
    if (id && proposed_date) await submit(`/api/portal/supplier/purchase-orders/${id}/propose-delivery`, { proposed_date });
  };
  const uploadCertificate = async () => {
    const id = Number(window.prompt('Delivery ID', data.deliveries?.items?.[0]?.id || ''));
    if (!id) return;
    const files = await uploadFiles();
    if (files.length) await submit(`/api/portal/supplier/deliveries/${id}/certificates`, { files });
  };
  const submitInvoice = async () => {
    const id = Number(window.prompt('Purchase order ID', data.awarded_pos?.items?.[0]?.id || ''));
    if (!id) return;
    const po = await request(`/api/portal/supplier/purchase-orders/${id}`);
    const invoice_number = window.prompt('Invoice number');
    if (!invoice_number) return;
    const lines = [];
    for (const line of po.lines) {
      const quantity = window.prompt(`Invoice quantity for ${line.description || line.material_id}`, line.quantity);
      const unit_price = window.prompt('Unit price', line.unit_rate);
      if (quantity == null || unit_price == null || Number(quantity) <= 0 || Number(unit_price) < 0) return;
      lines.push({ purchase_order_line_id: line.id, quantity: Number(quantity), unit_price: Number(unit_price) });
    }
    await submit('/api/portal/supplier/invoices', {
      purchase_order_id: id, invoice_number, invoice_date: today(),
      total_amount: lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0), lines,
    });
  };
  const actions = kind === 'consultant'
    ? [['Raise observation', createObservation], ['Advance observation', advanceObservation], ['Review RFI', reviewRfi], ['Review submittal', reviewSubmittal]]
    : kind === 'subcontractor'
      ? [['Acknowledge package', acknowledgeContract], ['Acknowledge instruction', acknowledgeInstruction],
        ['Submit RFI', createRfi], ['Acknowledge RFI', acknowledgeRfi], ['Submit submittal', createSubmittal],
        ['Resubmit submittal', resubmitSubmittal], ['Claim quantity', submitQuantity], ['Payment application', submitPaymentApplication],
        ['Request WIR', sendSubSubmission('wir_request')], ['Request MIR', sendSubSubmission('mir_request')],
        ['Report manpower', sendSubSubmission('manpower')], ['Report equipment', sendSubSubmission('equipment')],
        ['Respond to NCR', sendSubSubmission('ncr_response')], ['Respond to observation', sendSubSubmission('observation_response')],
        ['Quote variation', sendSubSubmission('variation_quote')]]
      : kind === 'supplier'
        ? [['Submit quotation', quoteRfq], ['Send clarification', clarify], ['Acknowledge PO', acknowledgePo],
          ['Propose delivery', proposeDelivery], ['Upload delivery certificate', uploadCertificate], ['Submit invoice', submitInvoice]]
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
