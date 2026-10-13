import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, FolderKanban, ClipboardCheck, Building2, Truck, Send } from 'lucide-react';
import { authService } from '../services/api';
import { openProtectedFile } from '../components/ProtectedMedia';
import DocumentUpload from '../components/DocumentUpload';
import { useLocale } from '../hooks/useLocale';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

const CONFIG = {
  consultant: { title: 'Consultant Portal', endpoint: '/api/consultant/dashboard', extra: '/api/consultant/reviews', extraTitle: 'My Reviews', icon: ClipboardCheck },
  client: { title: 'Client Portal', endpoint: '/api/client-portal/dashboard', extra: '/api/client-portal/action-center', extraTitle: 'Action Center', icon: Building2 },
  subcontractor: { title: 'Subcontractor Portal', endpoint: '/api/portal/subcontractor/dashboard', extra: '/api/portal/subcontractor/submissions', extraTitle: 'My submissions', icon: FolderKanban },
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

function ConsultantReviews({ rows = [], onDone }) {
  const { t } = useLocale();
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const submitDecision = async (row, decision) => {
    setSavingId(row.id); setError('');
    try {
      const path = row.type === 'wir'
        ? `/api/consultant/wirs/${row.id}/result`
        : `/api/consultant/${row.type === 'variation' ? 'variations' : row.type === 'instruction' ? 'instructions' : 'payment-certificates'}/${row.id}/recommendation`;
      const body = row.type === 'wir' ? { result: decision } : { decision };
      await request(path, {
        method: 'POST', body: JSON.stringify(body),
      });
      onDone();
    } catch (e) { setError(t('portals.review.submitError')); }
    finally { setSavingId(null); }
  };
  return <section className="card portal-widget">
    <div className="card-header">{t('portals.myReviews')} <span className="badge badge-info">{rows.length}</span></div>
    <div className="card-body">
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      {!rows.length ? <em>{t('portals.review.empty')}</em> : rows.map((row) => (
        <div className="portal-review-item" key={`${row.type}-${row.id}`}>
          <Record value={row} />
          {row.type === 'wir' && <div className="portal-review-actions" aria-label={t('portals.review.wirActions')}>
            <button className="btn btn-secondary btn-sm" disabled={savingId === row.id} onClick={() => submitDecision(row, 'approved')}>{t('portals.review.approve')}</button>
            <button className="btn btn-secondary btn-sm" disabled={savingId === row.id} onClick={() => submitDecision(row, 'approved_with_comments')}>{t('portals.review.approveWithComments')}</button>
            <button className="btn btn-secondary btn-sm" disabled={savingId === row.id} onClick={() => submitDecision(row, 'rejected')}>{t('portals.review.reject')}</button>
            <button className="btn btn-secondary btn-sm" disabled={savingId === row.id} onClick={() => submitDecision(row, 'reinspect')}>{t('portals.review.reinspect')}</button>
          </div>}
          {['variation', 'certificate', 'instruction'].includes(row.type) && <div className="portal-review-actions" aria-label={t('portals.review.recommendationActions')}>
            <button className="btn btn-secondary btn-sm" disabled={savingId === row.id} onClick={() => submitDecision(row, 'approve')}>{t('portals.review.recommendApprove')}</button>
            <button className="btn btn-secondary btn-sm" disabled={savingId === row.id} onClick={() => submitDecision(row, 'reject')}>{t('portals.review.recommendReject')}</button>
          </div>}
        </div>
      ))}
    </div>
  </section>;
}

function ClientActions({ data = {}, onDone, readOnly = false }) {
  const { t } = useLocale();
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const submit = async (kind, row, decision = null) => {
    const key = `${kind}-${row.id}`;
    setSavingKey(key); setError('');
    try {
      const path = kind === 'variation'
        ? `/api/client-portal/variations/${row.id}/response`
        : `/api/client-portal/documents/${row.id}/acknowledgement`;
      await request(path, { method: 'POST', body: JSON.stringify(decision ? { decision } : {}) });
      onDone();
    } catch (e) { setError(t('portals.clientActions.submitError')); }
    finally { setSavingKey(''); }
  };
  const variations = data.variation_responses?.items || [];
  const documents = data.document_acknowledgements?.items || [];
  return <>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    <section className="card portal-widget">
      <div className="card-header">{t('portals.actionCenter')}</div>
      <div className="card-body">
        {!variations.length && !documents.length && <em>{t('portals.clientActions.empty')}</em>}
        {variations.map((row) => <div className="portal-review-item" key={`variation-${row.id}`}>
          <Record value={row} />
          <small>{t('portals.clientActions.project', { id: row.project_id })}</small>
          {!readOnly && <div className="portal-review-actions" aria-label={t('portals.clientActions.variationActions')}>
            <button className="btn btn-secondary btn-sm" disabled={savingKey === `variation-${row.id}`} onClick={() => submit('variation', row, 'approve')}>{t('portals.clientActions.approve')}</button>
            <button className="btn btn-secondary btn-sm" disabled={savingKey === `variation-${row.id}`} onClick={() => submit('variation', row, 'reject')}>{t('portals.clientActions.reject')}</button>
          </div>}
        </div>)}
        {documents.map((row) => <div className="portal-review-item" key={`document-${row.id}`}>
          <Record value={row} />
          <small>{t('portals.clientActions.project', { id: row.project_id })}</small>
          {!readOnly && <div className="portal-review-actions" aria-label={t('portals.clientActions.documentActions')}>
            <button className="btn btn-secondary btn-sm" disabled={savingKey === `document-${row.id}`} onClick={() => submit('document', row)}>{t('portals.clientActions.acknowledge')}</button>
          </div>}
        </div>)}
      </div>
    </section>
    {data.approvals && <Widget name="approvals" value={data.approvals} />}
    {data.overdue_inputs && <Widget name="overdue_inputs" value={data.overdue_inputs} />}
  </>;
}

function SubcontractorSubmissionRegister({ value = {} }) {
  const { t } = useLocale();
  const items = value.items || [];
  return <section className="card portal-widget" aria-label={t('portals.submissions.title')}>
    <div className="card-header">{t('portals.submissions.title')} <span className="badge badge-info">{value.count ?? items.length}</span></div>
    <div className="card-body">
      {!items.length && <em>{t('portals.submissions.empty')}</em>}
      {items.map((item) => <div className="portal-review-item" key={item.id}>
        <div className="portal-record">
          <span>{t(`portals.submissions.types.${item.submission_type}`)}</span>
          <span><small className="badge badge-secondary">{t(`portals.submissions.status.${item.status}`)}</small></span>
        </div>
        <small>{t('portals.submissions.project', { id: item.project_id })}</small>
        <p>{item.payload?.note || item.payload?.response || item.payload?.equipment_name || item.payload?.worker_type || ''}</p>
      </div>)}
    </div>
  </section>;
}

function SubcontractorSubmissionForm({ data = {}, onCancel, onDone }) {
  const { t } = useLocale();
  const [kind, setKind] = useState('wir_request');
  const [packageId, setPackageId] = useState(String(data.packages?.[0]?.id || ''));
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), workerCount: '', workerType: '', equipmentName: '', hours: '', recordId: '', amount: '', scheduleDays: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const pkg = data.packages?.find((item) => String(item.id) === packageId);
  const records = kind === 'ncr_response' ? data.ncrs?.items || []
    : kind === 'observation_response' ? data.observations?.items || []
      : kind === 'variation_quote' ? data.variations?.items || [] : [];
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    const payload = { sub_contract_id: Number(packageId) };
    if (kind === 'wir_request' || kind === 'mir_request') Object.assign(payload, { requested_date: form.date, note: form.note });
    if (kind === 'manpower') Object.assign(payload, { report_date: form.date, worker_count: Number(form.workerCount), worker_type: form.workerType, note: form.note });
    if (kind === 'equipment') Object.assign(payload, { report_date: form.date, equipment_name: form.equipmentName, hours: Number(form.hours), note: form.note });
    if (kind === 'ncr_response' || kind === 'observation_response') Object.assign(payload, { related_entity_id: Number(form.recordId), response: form.note });
    if (kind === 'variation_quote') Object.assign(payload, { related_entity_id: Number(form.recordId), quoted_amount: Number(form.amount), schedule_impact_days: Number(form.scheduleDays || 0), note: form.note });
    try {
      await request(`/api/portal/subcontractor/submissions/${kind}`, { method: 'POST', body: JSON.stringify({ project_id: Number(pkg.project_id), payload }) });
      onDone();
    } catch (e) { setError(t('portals.submissions.submitError')); }
    finally { setSaving(false); }
  };
  const needsRecord = ['ncr_response', 'observation_response', 'variation_quote'].includes(kind);
  return <form className="card portal-observation-form" onSubmit={submit}>
    <h2>{t('portals.submissions.new')}</h2>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    <label>{t('portals.submissions.type')}<select required value={kind} onChange={(event) => { setKind(event.target.value); setField('recordId', ''); }}>
      {['wir_request', 'mir_request', 'manpower', 'equipment', 'ncr_response', 'observation_response', 'variation_quote'].map((option) => <option value={option} key={option}>{t(`portals.submissions.types.${option}`)}</option>)}
    </select></label>
    <label>{t('portals.submissions.package')}<select required value={packageId} onChange={(event) => setPackageId(event.target.value)}>
      {(data.packages || []).map((item) => <option value={item.id} key={item.id}>{item.contract_number || t('portals.submissions.packageOption', { id: item.id })}</option>)}
    </select></label>
    {['wir_request', 'mir_request', 'manpower', 'equipment'].includes(kind) && <label>{t('portals.submissions.date')}<input type="date" required value={form.date} onChange={(event) => setField('date', event.target.value)} /></label>}
    {kind === 'manpower' && <>
      <label>{t('portals.submissions.workerCount')}<input type="number" min="0" step="1" required value={form.workerCount} onChange={(event) => setField('workerCount', event.target.value)} /></label>
      <label>{t('portals.submissions.workerType')}<input maxLength="120" value={form.workerType} onChange={(event) => setField('workerType', event.target.value)} /></label>
    </>}
    {kind === 'equipment' && <>
      <label>{t('portals.submissions.equipmentName')}<input maxLength="255" required value={form.equipmentName} onChange={(event) => setField('equipmentName', event.target.value)} /></label>
      <label>{t('portals.submissions.hours')}<input type="number" min="0" max="24" step="0.25" required value={form.hours} onChange={(event) => setField('hours', event.target.value)} /></label>
    </>}
    {needsRecord && <label>{t('portals.submissions.relatedRecord')}<select required value={form.recordId} onChange={(event) => setField('recordId', event.target.value)}>
      <option value="">{t('portals.submissions.selectRecord')}</option>
      {records.filter((item) => Number(item.sub_contract_id) === Number(packageId)).map((item) => <option value={item.id} key={item.id}>{item.title || item.ncr_number || `${t('portals.submissions.record')} #${item.id}`}</option>)}
    </select></label>}
    {kind === 'variation_quote' && <>
      <label>{t('portals.submissions.amount')}<input type="number" min="0" step="0.01" required value={form.amount} onChange={(event) => setField('amount', event.target.value)} /></label>
      <label>{t('portals.submissions.scheduleDays')}<input type="number" min="0" max="3650" step="1" value={form.scheduleDays} onChange={(event) => setField('scheduleDays', event.target.value)} /></label>
    </>}
    <label>{t(kind === 'ncr_response' || kind === 'observation_response' ? 'portals.submissions.response' : 'portals.submissions.note')}<textarea required maxLength="4000" value={form.note} onChange={(event) => setField('note', event.target.value)} /></label>
    <div className="form-actions"><button type="button" className="btn" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary" disabled={saving || !pkg || (needsRecord && records.filter((item) => Number(item.sub_contract_id) === Number(packageId)).length === 0)}>{saving ? t('portals.submissions.saving') : t('portals.submissions.submit')}</button></div>
  </form>;
}

function SupplierComplianceAlerts({ value = {} }) {
  const { t } = useLocale();
  const items = value.items || [];
  return <section className="card portal-widget" aria-label={t('portals.compliance.title')}>
    <div className="card-header">{t('portals.compliance.title')} <span className="badge badge-info">{value.count ?? items.length}</span></div>
    <div className="card-body">
      {!items.length && <em>{t('portals.compliance.empty')}</em>}
      {items.map((item) => <div className="portal-review-item" key={item.id}>
        <div className="portal-record"><span>{item.document_type || t('portals.compliance.document')}</span>
          <span className={`badge ${item.alert_state === 'expired' ? 'badge-danger' : item.alert_state === 'expires_soon' ? 'badge-warning' : 'badge-info'}`}>{t(`portals.compliance.status.${item.alert_state}`)}</span></div>
        <small>{t('portals.compliance.expiry', { date: item.expiry_date })}</small>
      </div>)}
    </div>
  </section>;
}

function FormalInspectionRegister({ value = {}, kind }) {
  const { t } = useLocale();
  const items = value.items || [];
  const type = kind === 'wir' ? 'wirs' : 'mirs';
  return <section className="card portal-widget" aria-label={t(`portals.inspections.${type}.title`)}>
    <div className="card-header">{t(`portals.inspections.${type}.title`)} <span className="badge badge-info">{value.count ?? items.length}</span></div>
    <div className="card-body">
      {!items.length && <em>{t(`portals.inspections.${type}.empty`)}</em>}
      {items.map((item) => <div className="portal-review-item" key={item.id}>
        <div className="portal-record"><span>{item.wir_number || item.mir_number || `#${item.id}`}</span>
          <span><small className="badge badge-secondary">{t(`portals.inspections.status.${item.status}`)}</small></span></div>
        {(item.inspection_date || item.decided_at) && <small>{t(item.inspection_date ? 'portals.inspections.inspectionDate' : 'portals.inspections.decidedDate', { date: item.inspection_date || String(item.decided_at).slice(0, 10) })}</small>}
        {item.result && <p>{t('portals.inspections.result', { result: t(`portals.inspections.status.${item.result}`) })}</p>}
      </div>)}
    </div>
  </section>;
}

function QuickActions({ kind, data, onDone }) {
  const { t } = useLocale();
  const [showObservationForm, setShowObservationForm] = useState(false);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [observation, setObservation] = useState({ project_id: data.project_ids?.[0] || '', title: '', description: '', due_date: '', drawing_reference: '', drawing_document_id: '', severity: 'normal' });
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [observationError, setObservationError] = useState('');
  const [savingObservation, setSavingObservation] = useState(false);
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
  const createObservation = async (event) => {
    event.preventDefault(); setObservationError(''); setSavingObservation(true);
    try {
      const evidence = (files) => files.map((file) => ({
        file_name: file.file_url.split('/').pop(), file_url: file.file_url, caption: file.original_name,
      }));
      await submit('/api/consultant/observations', {
        ...observation, project_id: Number(observation.project_id), due_date: observation.due_date || null,
        drawing_document_id: observation.drawing_document_id ? Number(observation.drawing_document_id) : null,
        before_photos: evidence(beforePhotos), after_photos: evidence(afterPhotos),
      });
      setShowObservationForm(false);
      setObservation({ project_id: data.project_ids?.[0] || '', title: '', description: '', due_date: '', drawing_reference: '', drawing_document_id: '', severity: 'normal' });
      setBeforePhotos([]); setAfterPhotos([]);
    } catch (error) { setObservationError(t('portals.observation.submitError')); }
    finally { setSavingObservation(false); }
  };
  const drawings = (data.latest_drawings?.items || []).filter((drawing) => Number(drawing.project_id) === Number(observation.project_id));
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
    ? [[t('portals.observation.raise'), () => setShowObservationForm((open) => !open)], ['Advance observation', advanceObservation], ['Review RFI', reviewRfi], ['Review submittal', reviewSubmittal]]
    : kind === 'subcontractor'
      ? [['Acknowledge package', acknowledgeContract], ['Acknowledge instruction', acknowledgeInstruction],
        ['Submit RFI', createRfi], ['Acknowledge RFI', acknowledgeRfi], ['Submit submittal', createSubmittal],
        ['Resubmit submittal', resubmitSubmittal], ['Claim quantity', submitQuantity], ['Payment application', submitPaymentApplication],
        [t('portals.submissions.new'), () => setShowSubmissionForm(true)]]
      : kind === 'supplier'
        ? [['Submit quotation', quoteRfq], ['Send clarification', clarify], ['Acknowledge PO', acknowledgePo],
          ['Propose delivery', proposeDelivery], ['Upload delivery certificate', uploadCertificate], ['Submit invoice', submitInvoice]]
        : [];
  if (!actions.length) return null;
  return <div className="portal-actions">{actions.map(([text, fn]) => <button className="btn btn-primary btn-sm" key={text} onClick={() => Promise.resolve(fn()).catch(e => window.alert(e.message))}><Send size={14} /> {text}</button>)}
    {showObservationForm && kind === 'consultant' && <form className="card portal-observation-form" onSubmit={createObservation}>
      <h2>{t('portals.observation.title')}</h2>
      {observationError && <p className="alert alert-danger" role="alert">{observationError}</p>}
      <label>{t('portals.observation.project')}<select required value={observation.project_id} onChange={(event) => setObservation({ ...observation, project_id: event.target.value, drawing_document_id: '' })}>
        {(data.project_ids || []).map((projectId) => <option key={projectId} value={projectId}>{t('portals.observation.projectOption', { id: projectId })}</option>)}
      </select></label>
      <label>{t('portals.observation.titleField')}<input required maxLength="255" value={observation.title} onChange={(event) => setObservation({ ...observation, title: event.target.value })} /></label>
      <label>{t('portals.observation.description')}<textarea maxLength="5000" value={observation.description} onChange={(event) => setObservation({ ...observation, description: event.target.value })} /></label>
      <label>{t('portals.observation.dueDate')}<input type="date" value={observation.due_date} onChange={(event) => setObservation({ ...observation, due_date: event.target.value })} /></label>
      <label>{t('portals.observation.drawing')}<select value={observation.drawing_document_id} onChange={(event) => {
        const drawing = drawings.find((item) => String(item.id) === event.target.value);
        setObservation({ ...observation, drawing_document_id: event.target.value, drawing_reference: drawing?.title || observation.drawing_reference });
      }}><option value="">{t('portals.observation.noDrawing')}</option>{drawings.map((drawing) => <option key={drawing.id} value={drawing.id}>{drawing.title}</option>)}</select></label>
      <label>{t('portals.observation.drawingReference')}<input maxLength="255" value={observation.drawing_reference} onChange={(event) => setObservation({ ...observation, drawing_reference: event.target.value })} /></label>
      <label>{t('portals.observation.severity')}<select value={observation.severity} onChange={(event) => setObservation({ ...observation, severity: event.target.value })}>
        {['low', 'normal', 'high', 'urgent'].map((value) => <option value={value} key={value}>{t(`portals.observation.severityOptions.${value}`)}</option>)}
      </select></label>
      <DocumentUpload label={t('portals.observation.beforePhotos')} onUploaded={setBeforePhotos} maxFiles={5} accept="image/*" />
      <DocumentUpload label={t('portals.observation.afterPhotos')} onUploaded={setAfterPhotos} maxFiles={5} accept="image/*" />
      <div className="form-actions"><button type="button" className="btn" onClick={() => setShowObservationForm(false)} disabled={savingObservation}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary" disabled={savingObservation}>{t('portals.observation.submit')}</button></div>
    </form>}
    {showSubmissionForm && kind === 'subcontractor' && <SubcontractorSubmissionForm data={data} onCancel={() => setShowSubmissionForm(false)} onDone={() => { setShowSubmissionForm(false); onDone(); }} />}
  </div>;
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
        <div className="portal-grid">{Object.entries(data).filter(([key]) => !['note', 'setup_actions', 'project_ids', 'supplier_ids', 'visibility', 'preview'].includes(key)).map(([key, value]) => kind === 'supplier' && key === 'expiring_documents'
          ? <SupplierComplianceAlerts key={key} value={value} />
          : kind === 'subcontractor' && key === 'wirs'
            ? <FormalInspectionRegister key={key} value={value} kind="wir" />
            : kind === 'supplier' && key === 'inspections'
              ? <FormalInspectionRegister key={key} value={value} kind="mir" />
              : <Widget key={key} name={key} value={value} />)}</div>
        {extra?.secondary != null && <><h2 className="portal-section-title">{config.extraTitle}</h2><div className="portal-grid">{kind === 'consultant'
          ? <ConsultantReviews rows={extra.secondary} onDone={load} />
          : kind === 'client'
            ? <ClientActions data={extra.secondary} onDone={load} readOnly={Boolean(data.preview?.read_only)} />
            : kind === 'subcontractor'
              ? <SubcontractorSubmissionRegister value={extra.secondary} />
            : <Widget name={config.extraTitle} value={extra.secondary} />}</div></>}
      </>}
    </div>
  );
}
