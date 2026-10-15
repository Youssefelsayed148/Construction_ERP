import { apiFetch } from '../services/apiClient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, FolderKanban, ClipboardCheck, Building2, Truck, Send } from 'lucide-react';
import { authService } from '../services/api';
import { openProtectedFile } from '../components/ProtectedMedia';
import DocumentUpload from '../components/DocumentUpload';
import { useLocale } from '../hooks/useLocale';
import LoadMore from '../components/common/LoadMore';
import { translatePriority, translateStatus } from '../i18n/enums';
import { formatCurrency, formatDate, formatNumber, localizedName } from '../utils/formatters';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

const CONFIG = {
  consultant: { endpoint: '/api/consultant/dashboard', extra: '/api/consultant/reviews', extraTitleKey: 'reviews', icon: ClipboardCheck },
  client: { endpoint: '/api/client-portal/dashboard', extra: '/api/client-portal/action-center', extraTitleKey: 'actionCenter', icon: Building2 },
  subcontractor: { endpoint: '/api/portal/subcontractor/dashboard', extra: '/api/portal/subcontractor/submissions', extraTitleKey: 'submissions', icon: FolderKanban },
  supplier: { endpoint: '/api/portal/supplier/dashboard', icon: Truck },
};

async function request(path, options = {}) {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
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

const dashboardLabel = (t, group, value) => {
  const raw = String(value ?? '');
  const key = raw.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_').toLowerCase();
  return t(`portals.dashboard.${group}.${key}`, { defaultValue: raw });
};

function valueText(value, t) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no');
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') return value;
  return null;
}

function Widget({ name, value }) {
  const { t } = useLocale();
  const [visibleCount, setVisibleCount] = useState(6);
  const title = dashboardLabel(t, 'widgets', name);
  if (value == null) return null;
  if (Array.isArray(value)) {
    return (
      <section className="card portal-widget">
        <div className="card-header">{title} <span className="badge badge-info">{value.length}</span></div>
        <div className="card-body">{value.length ? value.slice(0, visibleCount).map((item, i) => <Record key={item?.id ?? i} value={item} />) : <em>{t('portals.dashboard.noRecords')}</em>}</div>
        <LoadMore loadedCount={Math.min(visibleCount, value.length)} totalCount={value.length} t={t} onLoadMore={() => setVisibleCount(count => count + 6)} />
      </section>
    );
  }
  if (typeof value !== 'object') {
    return <section className="card portal-widget"><div className="card-header">{title}</div><div className="card-body portal-metric">{valueText(value, t)}</div></section>;
  }
  const items = Array.isArray(value.items) ? value.items : null;
  if (items) {
    return (
      <section className="card portal-widget">
        <div className="card-header">{title} <span className="badge badge-info">{value.count ?? items.length}</span></div>
        <div className="card-body">
          {items.length ? items.slice(0, visibleCount).map((item, i) => <Record key={item?.id ?? i} value={item} />) : <em>{value.empty_key ? t(value.empty_key, { defaultValue: value.empty_label || t('portals.dashboard.noRecords') }) : value.empty_label || t('portals.dashboard.noRecords')}</em>}
        </div>
        <LoadMore loadedCount={Math.min(visibleCount, items.length)} totalCount={items.length} t={t} onLoadMore={() => setVisibleCount(count => count + 6)} />
      </section>
    );
  }
  const simple = Object.entries(value).filter(([, v]) => valueText(v, t) != null);
  if (!simple.length) return null;
  return (
    <section className="card portal-widget">
      <div className="card-header">{title}</div>
      <div className="card-body">{simple.map(([k, v]) => <div className="portal-row" key={k}><span>{dashboardLabel(t, 'fields', k)}</span><strong>{valueText(v, t)}</strong></div>)}</div>
    </section>
  );
}

function Record({ value }) {
  const { t } = useLocale();
  if (value == null || typeof value !== 'object') return <div className="portal-record">{valueText(value, t)}</div>;
  const title = localizedName(value, undefined, ['title', 'name', 'subject']) || value.number || value.order_number || value.contract_number || value.invoice_number || value.rfq_number || value.rfi_number || value.submittal_number || value.wir_number || value.mir_number || value.certificate_number || value.observation_number || value.ncr_number || t('portals.dashboard.recordNumber', { id: value.id });
  const status = value.status ? translateStatus(t, value.status) : translatePriority(t, value.priority);
  const amount = value.amount ?? value.total_amount ?? value.net_certificate;
  const date = value.deadline ?? value.due_date;
  const detail = amount != null ? formatCurrency(amount) : date != null ? formatDate(date) : null;
  return <div className="portal-record"><span>{value.file_url ? <a href="#open-file" onClick={e => { e.preventDefault(); openProtectedFile(value.file_url).catch(error => window.alert(error.message)); }}>{title}</a> : title}</span><span>{detail != null ? detail : ''} {status ? <small className="badge badge-secondary">{status}</small> : null}</span></div>;
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
          {row.type === 'rfi' && (row.location_id || row.work_package_id || row.cost_impact != null || row.schedule_impact_days != null) && <small className="portal-review-context">
            {[row.location_id != null && t('portals.review.rfiLocation', { id: row.location_id }),
              row.work_package_id != null && t('portals.review.rfiWorkPackage', { id: row.work_package_id }),
              row.cost_impact != null && t('portals.review.rfiCostImpact', { amount: row.cost_impact }),
              row.schedule_impact_days != null && t('portals.review.rfiScheduleImpact', { days: row.schedule_impact_days })].filter(Boolean).join(' · ')}
          </small>}
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
  const [formalSubmission, setFormalSubmission] = useState('');
  const [formalSubmissionError, setFormalSubmissionError] = useState('');
  const [savingFormalSubmission, setSavingFormalSubmission] = useState(false);
  const [formalSubmissionValues, setFormalSubmissionValues] = useState({ package_id: data.packages?.[0]?.id || '', title: '', question: '', priority: 'normal', due_date: '', submittal_type: 'material', submitted_to: '' });
  const [showAcknowledgeRfi, setShowAcknowledgeRfi] = useState(false);
  const [showResubmitSubmittal, setShowResubmitSubmittal] = useState(false);
  const [recordActionError, setRecordActionError] = useState('');
  const [recordActionSaving, setRecordActionSaving] = useState(false);
  const [rfiAcknowledgement, setRfiAcknowledgement] = useState({ id: '', response: '' });
  const [submittalResubmission, setSubmittalResubmission] = useState({ id: '', comments: '' });
  const [subcontractorAction, setSubcontractorAction] = useState('');
  const [subcontractorActionValues, setSubcontractorActionValues] = useState({ package_id: '', instruction_id: '', response: '', period_from: '', period_to: '', quantity_claimed: '', work_value: '', retention: '0', materials_deducted: '0', other_deductions: '0', notes: '' });
  const [observation, setObservation] = useState({ project_id: data.project_ids?.[0] || '', title: '', description: '', due_date: '', drawing_reference: '', drawing_document_id: '', severity: 'normal' });
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [observationError, setObservationError] = useState('');
  const [savingObservation, setSavingObservation] = useState(false);
  const [quickAction, setQuickAction] = useState('');
  const [quickActionValues, setQuickActionValues] = useState({ record_id: '', stage: '', action: '', message: '', body: '', comment: '', comments: '', response_code: 'A', supplier_id: '', invoice_number: '', proposed_date: '', lines: {} });
  const [quickActionRecord, setQuickActionRecord] = useState(null);
  const [quickActionFiles, setQuickActionFiles] = useState([]);
  const [quickActionError, setQuickActionError] = useState('');
  const [quickActionSaving, setQuickActionSaving] = useState(false);
  const submit = async (path, body) => {
    await request(path, { method: 'POST', body: JSON.stringify(body) });
    onDone();
  };
  const createFormalSubmission = async (event) => {
    event.preventDefault(); setFormalSubmissionError(''); setSavingFormalSubmission(true);
    try {
      const pkg = data.packages?.find((item) => Number(item.id) === Number(formalSubmissionValues.package_id));
      if (!pkg) throw new Error('package');
      const body = { project_id: Number(pkg.project_id), sub_contract_id: Number(pkg.id) };
      if (formalSubmission === 'rfi') Object.assign(body, {
        subject: formalSubmissionValues.title.trim(), question: formalSubmissionValues.question.trim(),
        priority: formalSubmissionValues.priority, due_date: formalSubmissionValues.due_date || null,
      });
      else Object.assign(body, {
        title: formalSubmissionValues.title.trim(), submittal_type: formalSubmissionValues.submittal_type,
        submitted_to: formalSubmissionValues.submitted_to.trim() || null,
      });
      await submit(`/api/portal/subcontractor/${formalSubmission === 'rfi' ? 'rfis' : 'submittals'}`, body);
      setFormalSubmission('');
      setFormalSubmissionValues({ package_id: data.packages?.[0]?.id || '', title: '', question: '', priority: 'normal', due_date: '', submittal_type: 'material', submitted_to: '' });
    } catch (error) { setFormalSubmissionError(t('portals.formalSubmission.submitError')); }
    finally { setSavingFormalSubmission(false); }
  };
  const today = () => new Date().toISOString().slice(0, 10);
  const uploadFiles = async (files) => {
    if (!files.length) return [];
    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    const response = await apiFetch(`${API_BASE_URL}/api/documents/upload`, {
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
  const quickRecordRows = (action) => ({
    clarify: data.open_rfqs?.items || [], acknowledgePo: data.awarded_pos?.items || [], quoteRfq: data.open_rfqs?.items || [], proposeDelivery: data.awarded_pos?.items || [], submitInvoice: data.awarded_pos?.items || [],
    uploadCertificate: data.deliveries?.items || [], advanceObservation: data.observations_awaiting_verification?.items || [], reviewRfi: data.rfis_awaiting_response?.items || [], reviewSubmittal: data.submittals_awaiting_review?.items || [],
  }[action] || []);
  const openQuickAction = (action) => {
    const first = quickRecordRows(action)[0];
    setQuickAction(action);
    setQuickActionError(''); setQuickActionRecord(null); setQuickActionFiles([]);
    setQuickActionValues({ record_id: first?.id ? String(first.id) : '', stage: action === 'reviewRfi' ? 'coordinator' : action === 'reviewSubmittal' ? 'consultant_coordinator' : '', action: 'accept', message: '', body: '', comment: '', comments: '', response_code: 'A', supplier_id: '', invoice_number: '', proposed_date: today(), lines: {} });
    if (first?.id && ['quoteRfq', 'submitInvoice'].includes(action)) loadQuickRecord(String(first.id), action);
  };
  const loadQuickRecord = async (recordId, action = quickAction) => {
    setQuickActionValues((current) => ({ ...current, record_id: recordId, supplier_id: '', lines: {} }));
    setQuickActionRecord(null); setQuickActionError('');
    if (!recordId || !['quoteRfq', 'submitInvoice'].includes(action)) return;
    try {
      const path = action === 'quoteRfq' ? `/api/portal/supplier/rfqs/${recordId}` : `/api/portal/supplier/purchase-orders/${recordId}`;
      const record = await request(path);
      const lines = Object.fromEntries((record.lines || []).map((line) => [line.id, action === 'quoteRfq'
        ? { quantity: String(line.quantity), unit_price: '' }
        : { quantity: String(line.quantity), unit_price: String(line.unit_rate) }]));
      setQuickActionRecord(record);
      setQuickActionValues((current) => ({ ...current, record_id: recordId, supplier_id: record.supplier_ids?.length === 1 ? String(record.supplier_ids[0]) : '', lines }));
    } catch (error) { setQuickActionError(t('portals.quickActions.loadError')); }
  };
  const updateQuickLine = (lineId, field, value) => setQuickActionValues((current) => ({ ...current, lines: { ...current.lines, [lineId]: { ...current.lines[lineId], [field]: value } } }));
  const submitQuickAction = async (event) => {
    event.preventDefault(); setQuickActionError(''); setQuickActionSaving(true);
    const id = Number(quickActionValues.record_id);
    try {
      if (quickAction === 'clarify') await submit(`/api/portal/supplier/rfqs/${id}/clarifications`, { message: quickActionValues.message.trim() });
      else if (quickAction === 'acknowledgePo') await submit(`/api/portal/supplier/purchase-orders/${id}/acknowledge`, {});
      else if (quickAction === 'advanceObservation') await submit(`/api/consultant/observations/${id}/advance`, { action: quickActionValues.action, comment: quickActionValues.comment.trim() });
      else if (quickAction === 'reviewRfi') await submit(`/api/consultant/rfis/${id}/response`, { stage: quickActionValues.stage, body: quickActionValues.body.trim() });
      else if (quickAction === 'reviewSubmittal') await submit(`/api/consultant/submittals/${id}/response`, { stage: quickActionValues.stage, comments: quickActionValues.comments.trim(), ...(quickActionValues.stage === 'response' ? { response_code: quickActionValues.response_code } : {}) });
      else if (quickAction === 'quoteRfq') {
        const lines = (quickActionRecord?.lines || []).map((line) => ({ rfq_line_id: line.id, quantity: Number(line.quantity), unit_price: Number(quickActionValues.lines[line.id]?.unit_price) }));
        if (!quickActionRecord?.supplier_ids?.map(String).includes(quickActionValues.supplier_id) || !lines.length || lines.some((line) => !Number.isFinite(line.unit_price) || line.unit_price < 0)) throw new Error('validation');
        await submit(`/api/portal/supplier/rfqs/${id}/quotations`, { supplier_id: Number(quickActionValues.supplier_id), lines });
      } else if (quickAction === 'proposeDelivery') await submit(`/api/portal/supplier/purchase-orders/${id}/propose-delivery`, { proposed_date: quickActionValues.proposed_date });
      else if (quickAction === 'uploadCertificate') {
        const files = await uploadFiles(quickActionFiles);
        if (!files.length) throw new Error('validation');
        await submit(`/api/portal/supplier/deliveries/${id}/certificates`, { files });
      } else if (quickAction === 'submitInvoice') {
        const lines = (quickActionRecord?.lines || []).map((line) => ({ purchase_order_line_id: line.id, quantity: Number(quickActionValues.lines[line.id]?.quantity), unit_price: Number(quickActionValues.lines[line.id]?.unit_price) }));
        if (!quickActionValues.invoice_number.trim() || !lines.length || lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unit_price) || line.unit_price < 0)) throw new Error('validation');
        await submit('/api/portal/supplier/invoices', { purchase_order_id: id, invoice_number: quickActionValues.invoice_number.trim(), invoice_date: today(), total_amount: lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0), lines });
      }
      setQuickAction('');
    } catch (error) { setQuickActionError(t(error.message === 'validation' ? 'portals.quickActions.validationError' : 'portals.quickActions.submitError')); }
    finally { setQuickActionSaving(false); }
  };
  const acknowledgeRfi = async (event) => {
    event.preventDefault(); setRecordActionError(''); setRecordActionSaving(true);
    try {
      await submit(`/api/portal/subcontractor/rfis/${Number(rfiAcknowledgement.id)}/acknowledge`, { body: rfiAcknowledgement.response.trim() || 'Acknowledged' });
      setShowAcknowledgeRfi(false); setRfiAcknowledgement({ id: '', response: '' });
    } catch (error) { setRecordActionError(t('portals.recordActions.submitError')); }
    finally { setRecordActionSaving(false); }
  };
  const resubmitSubmittal = async (event) => {
    event.preventDefault(); setRecordActionError(''); setRecordActionSaving(true);
    try {
      await submit(`/api/portal/subcontractor/submittals/${Number(submittalResubmission.id)}/resubmit`, { comments: submittalResubmission.comments.trim() });
      setShowResubmitSubmittal(false); setSubmittalResubmission({ id: '', comments: '' });
    } catch (error) { setRecordActionError(t('portals.recordActions.submitError')); }
    finally { setRecordActionSaving(false); }
  };
  const submitSubcontractorAction = async (event) => {
    event.preventDefault(); setRecordActionError(''); setRecordActionSaving(true);
    try {
      const pkg = data.packages?.find((item) => Number(item.id) === Number(subcontractorActionValues.package_id));
      if (subcontractorAction === 'package' && pkg) await submit(`/api/portal/subcontractor/contracts/${pkg.id}/acknowledge`, {});
      else if (subcontractorAction === 'instruction') {
        const instruction = data.instructions_for_acknowledgement?.items?.find((item) => Number(item.id) === Number(subcontractorActionValues.instruction_id));
        if (!instruction) throw new Error('instruction');
        await submit(`/api/portal/subcontractor/instructions/${instruction.id}/acknowledge`, { project_id: instruction.project_id, response: subcontractorActionValues.response.trim() || null });
      } else if (subcontractorAction === 'quantity' && pkg?.boq_item_id) await submit('/api/portal/subcontractor/quantities', {
        sub_contract_id: Number(pkg.id), boq_item_id: Number(pkg.boq_item_id), period_from: subcontractorActionValues.period_from,
        period_to: subcontractorActionValues.period_to, quantity_claimed: Number(subcontractorActionValues.quantity_claimed), notes: subcontractorActionValues.notes,
      });
      else if (subcontractorAction === 'payment' && pkg) await submit('/api/portal/subcontractor/payment-applications', {
        project_id: Number(pkg.project_id), sub_contract_id: Number(pkg.id), period_from: subcontractorActionValues.period_from,
        period_to: subcontractorActionValues.period_to, work_value: Number(subcontractorActionValues.work_value),
        retention: Number(subcontractorActionValues.retention), materials_deducted: Number(subcontractorActionValues.materials_deducted),
        other_deductions: Number(subcontractorActionValues.other_deductions), notes: subcontractorActionValues.notes,
      });
      else throw new Error('selection');
      setSubcontractorAction('');
      setSubcontractorActionValues({ package_id: '', instruction_id: '', response: '', period_from: '', period_to: '', quantity_claimed: '', work_value: '', retention: '0', materials_deducted: '0', other_deductions: '0', notes: '' });
    } catch (error) { setRecordActionError(t('portals.recordActions.submitError')); }
    finally { setRecordActionSaving(false); }
  };
  const actions = kind === 'consultant'
    ? [[t('portals.observation.raise'), () => setShowObservationForm((open) => !open)], [t('portals.quickActions.advanceObservation'), () => openQuickAction('advanceObservation')], [t('portals.quickActions.reviewRfi'), () => openQuickAction('reviewRfi')], [t('portals.quickActions.reviewSubmittal'), () => openQuickAction('reviewSubmittal')]]
    : kind === 'subcontractor'
      ? [[t('portals.recordActions.acknowledgePackage'), () => { setRecordActionError(''); setSubcontractorAction('package'); }], [t('portals.recordActions.acknowledgeInstruction'), () => { setRecordActionError(''); setSubcontractorAction('instruction'); }],
        [t('portals.formalSubmission.newRfi'), () => { setFormalSubmission('rfi'); setFormalSubmissionError(''); }], [t('portals.recordActions.acknowledgeRfi'), () => { setRecordActionError(''); setShowAcknowledgeRfi((open) => !open); }], [t('portals.formalSubmission.newSubmittal'), () => { setFormalSubmission('submittal'); setFormalSubmissionError(''); }],
        [t('portals.recordActions.resubmitSubmittal'), () => { setRecordActionError(''); setShowResubmitSubmittal((open) => !open); }], [t('portals.recordActions.claimQuantity'), () => { setRecordActionError(''); setSubcontractorAction('quantity'); }], [t('portals.recordActions.paymentApplication'), () => { setRecordActionError(''); setSubcontractorAction('payment'); }],
        [t('portals.submissions.new'), () => setShowSubmissionForm(true)]]
      : kind === 'supplier'
        ? [[t('portals.quickActions.submitQuotation'), () => openQuickAction('quoteRfq')], [t('portals.quickActions.sendClarification'), () => openQuickAction('clarify')], [t('portals.quickActions.acknowledgePo'), () => openQuickAction('acknowledgePo')],
          [t('portals.quickActions.proposeDelivery'), () => openQuickAction('proposeDelivery')], [t('portals.quickActions.uploadCertificate'), () => openQuickAction('uploadCertificate')], [t('portals.quickActions.submitInvoice'), () => openQuickAction('submitInvoice')]]
        : [];
  const actionPackages = (data.packages || []).filter((pkg) => subcontractorAction === 'package'
    ? !pkg.acknowledged_at : subcontractorAction === 'quantity' ? Number(pkg.boq_item_id) > 0 : true);
  if (!actions.length) return null;
  return <div className="portal-actions">{actions.map(([text, fn]) => <button className="btn btn-primary btn-sm" key={text} onClick={() => Promise.resolve(fn()).catch(e => window.alert(e.message))}><Send size={14} /> {text}</button>)}
    {quickAction && <form className="card portal-observation-form" onSubmit={submitQuickAction}>
      <h2>{t(`portals.quickActions.${quickAction}`)}</h2>
      {quickActionError && <p className="alert alert-danger" role="alert">{quickActionError}</p>}
      <label>{t('portals.quickActions.record')}<select required value={quickActionValues.record_id} onChange={(event) => loadQuickRecord(event.target.value)}>
        <option value="">{t('portals.quickActions.selectRecord')}</option>{quickRecordRows(quickAction).map((row) => <option key={row.id} value={row.id}>{row.rfq_number || row.purchase_order_number || row.order_number || row.instruction_number || row.number || `#${row.id}`} — {row.title || row.subject || row.status || ''}</option>)}
      </select></label>
      {quickAction === 'clarify' && <label>{t('portals.quickActions.message')}<textarea required maxLength="4000" value={quickActionValues.message} onChange={(event) => setQuickActionValues({ ...quickActionValues, message: event.target.value })} /></label>}
      {quickAction === 'advanceObservation' && <><label>{t('portals.quickActions.action')}<select value={quickActionValues.action} onChange={(event) => setQuickActionValues({ ...quickActionValues, action: event.target.value })}>{['acknowledge', 'assign', 'start_rectification', 'submit_for_verification', 'accept', 'reject', 'close'].map((value) => <option key={value} value={value}>{t(`portals.quickActions.actions.${value}`)}</option>)}</select></label><label>{t('portals.quickActions.comment')}<textarea maxLength="4000" value={quickActionValues.comment} onChange={(event) => setQuickActionValues({ ...quickActionValues, comment: event.target.value })} /></label></>}
      {quickAction === 'reviewRfi' && <><label>{t('portals.quickActions.stage')}<select value={quickActionValues.stage} onChange={(event) => setQuickActionValues({ ...quickActionValues, stage: event.target.value })}>{['coordinator', 'discipline_review', 'official_response'].map((value) => <option key={value} value={value}>{t(`portals.quickActions.stages.${value}`)}</option>)}</select></label><label>{t('portals.quickActions.body')}<textarea required maxLength="5000" value={quickActionValues.body} onChange={(event) => setQuickActionValues({ ...quickActionValues, body: event.target.value })} /></label></>}
      {quickAction === 'reviewSubmittal' && <><label>{t('portals.quickActions.stage')}<select value={quickActionValues.stage} onChange={(event) => setQuickActionValues({ ...quickActionValues, stage: event.target.value })}>{['internal_technical_review', 'pm', 'consultant_coordinator', 'reviewer', 'response'].map((value) => <option key={value} value={value}>{t(`portals.quickActions.stages.${value}`)}</option>)}</select></label>{quickActionValues.stage === 'response' && <label>{t('portals.quickActions.responseCode')}<select value={quickActionValues.response_code} onChange={(event) => setQuickActionValues({ ...quickActionValues, response_code: event.target.value })}>{['A', 'B', 'C', 'D'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}<label>{t('portals.quickActions.comments')}<textarea required maxLength="5000" value={quickActionValues.comments} onChange={(event) => setQuickActionValues({ ...quickActionValues, comments: event.target.value })} /></label></>}
      {quickAction === 'quoteRfq' && quickActionRecord && <><label>{t('portals.quickActions.supplier')}<select required value={quickActionValues.supplier_id} onChange={(event) => setQuickActionValues({ ...quickActionValues, supplier_id: event.target.value })}><option value="">{t('portals.quickActions.selectSupplier')}</option>{quickActionRecord.supplier_ids?.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>{quickActionRecord.lines?.map((line) => <label key={line.id}>{line.description || line.material_id} — {line.quantity} {line.unit || ''}<input type="number" min="0" step="0.01" required value={quickActionValues.lines[line.id]?.unit_price || ''} onChange={(event) => updateQuickLine(line.id, 'unit_price', event.target.value)} /></label>)}</>}
      {quickAction === 'proposeDelivery' && <label>{t('portals.quickActions.proposedDate')}<input type="date" required value={quickActionValues.proposed_date} onChange={(event) => setQuickActionValues({ ...quickActionValues, proposed_date: event.target.value })} /></label>}
      {quickAction === 'uploadCertificate' && <label>{t('portals.quickActions.files')}<input type="file" multiple required onChange={(event) => setQuickActionFiles(Array.from(event.target.files || []))} /></label>}
      {quickAction === 'submitInvoice' && quickActionRecord && <><label>{t('portals.quickActions.invoiceNumber')}<input required maxLength="100" value={quickActionValues.invoice_number} onChange={(event) => setQuickActionValues({ ...quickActionValues, invoice_number: event.target.value })} /></label>{quickActionRecord.lines?.map((line) => <div key={line.id}><strong>{line.description || line.material_id}</strong><label>{t('portals.quickActions.quantity')}<input type="number" min="0.001" step="0.001" required value={quickActionValues.lines[line.id]?.quantity || ''} onChange={(event) => updateQuickLine(line.id, 'quantity', event.target.value)} /></label><label>{t('portals.quickActions.unitPrice')}<input type="number" min="0" step="0.01" required value={quickActionValues.lines[line.id]?.unit_price || ''} onChange={(event) => updateQuickLine(line.id, 'unit_price', event.target.value)} /></label></div>)}</>}
      <div className="form-actions"><button type="button" className="btn" disabled={quickActionSaving} onClick={() => setQuickAction('')}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary" disabled={quickActionSaving || !quickActionValues.record_id || (['quoteRfq', 'submitInvoice'].includes(quickAction) && !quickActionRecord)}>{quickActionSaving ? t('portals.submissions.saving') : t('portals.submissions.submit')}</button></div>
    </form>}
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
    {formalSubmission && kind === 'subcontractor' && <form className="card portal-observation-form" onSubmit={createFormalSubmission}>
      <h2>{t(formalSubmission === 'rfi' ? 'portals.formalSubmission.rfiTitle' : 'portals.formalSubmission.submittalTitle')}</h2>
      {formalSubmissionError && <p className="alert alert-danger" role="alert">{formalSubmissionError}</p>}
      <label>{t('portals.submissions.package')}<select required value={formalSubmissionValues.package_id} onChange={(event) => setFormalSubmissionValues({ ...formalSubmissionValues, package_id: event.target.value })}>
        {(data.packages || []).map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.contract_number || t('portals.submissions.packageOption', { id: pkg.id })}</option>)}
      </select></label>
      <label>{t(formalSubmission === 'rfi' ? 'portals.formalSubmission.subject' : 'portals.formalSubmission.title')}<input name="title" required maxLength="255" value={formalSubmissionValues.title} onChange={(event) => setFormalSubmissionValues({ ...formalSubmissionValues, title: event.target.value })} /></label>
      {formalSubmission === 'rfi' ? <>
        <label>{t('portals.formalSubmission.question')}<textarea required maxLength="5000" value={formalSubmissionValues.question} onChange={(event) => setFormalSubmissionValues({ ...formalSubmissionValues, question: event.target.value })} /></label>
        <label>{t('portals.formalSubmission.priority')}<select value={formalSubmissionValues.priority} onChange={(event) => setFormalSubmissionValues({ ...formalSubmissionValues, priority: event.target.value })}>
          {['low', 'normal', 'high', 'urgent'].map((value) => <option key={value} value={value}>{t(`portals.formalSubmission.priorities.${value}`)}</option>)}
        </select></label>
        <label>{t('portals.formalSubmission.dueDate')}<input type="date" value={formalSubmissionValues.due_date} onChange={(event) => setFormalSubmissionValues({ ...formalSubmissionValues, due_date: event.target.value })} /></label>
      </> : <>
        <label>{t('portals.formalSubmission.submittalType')}<select value={formalSubmissionValues.submittal_type} onChange={(event) => setFormalSubmissionValues({ ...formalSubmissionValues, submittal_type: event.target.value })}>
          {['material', 'shop_drawing', 'sample', 'method'].map((value) => <option key={value} value={value}>{t(`portals.formalSubmission.types.${value}`)}</option>)}
        </select></label>
        <label>{t('portals.formalSubmission.submittedTo')}<input name="submitted_to" maxLength="255" value={formalSubmissionValues.submitted_to} onChange={(event) => setFormalSubmissionValues({ ...formalSubmissionValues, submitted_to: event.target.value })} /></label>
      </>}
      <div className="form-actions"><button type="button" className="btn" disabled={savingFormalSubmission} onClick={() => setFormalSubmission('')}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary" disabled={savingFormalSubmission || !(data.packages || []).length}>{savingFormalSubmission ? t('portals.submissions.saving') : t('portals.submissions.submit')}</button></div>
    </form>}
    {showAcknowledgeRfi && kind === 'subcontractor' && <form className="card portal-observation-form" onSubmit={acknowledgeRfi}>
      <h2>{t('portals.recordActions.acknowledgeRfi')}</h2>
      {recordActionError && <p className="alert alert-danger" role="alert">{recordActionError}</p>}
      <label>{t('portals.recordActions.rfi')}<select required value={rfiAcknowledgement.id} onChange={(event) => setRfiAcknowledgement({ ...rfiAcknowledgement, id: event.target.value })}>
        <option value="">{t('portals.submissions.selectRecord')}</option>
        {(data.rfis?.items || []).map((item) => <option key={item.id} value={item.id}>{item.rfi_number || `#${item.id}`} — {item.subject}</option>)}
      </select></label>
      <label>{t('portals.recordActions.response')}<textarea maxLength="2000" value={rfiAcknowledgement.response} onChange={(event) => setRfiAcknowledgement({ ...rfiAcknowledgement, response: event.target.value })} /></label>
      <div className="form-actions"><button type="button" className="btn" disabled={recordActionSaving} onClick={() => setShowAcknowledgeRfi(false)}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary" disabled={recordActionSaving || !(data.rfis?.items || []).length}>{recordActionSaving ? t('portals.submissions.saving') : t('portals.submissions.submit')}</button></div>
    </form>}
    {showResubmitSubmittal && kind === 'subcontractor' && <form className="card portal-observation-form" onSubmit={resubmitSubmittal}>
      <h2>{t('portals.recordActions.resubmitSubmittal')}</h2>
      {recordActionError && <p className="alert alert-danger" role="alert">{recordActionError}</p>}
      <label>{t('portals.recordActions.submittal')}<select required value={submittalResubmission.id} onChange={(event) => setSubmittalResubmission({ ...submittalResubmission, id: event.target.value })}>
        <option value="">{t('portals.submissions.selectRecord')}</option>
        {(data.submittals_for_resubmission?.items || []).map((item) => <option key={item.id} value={item.id}>{item.submittal_number || `#${item.id}`} — {item.title}</option>)}
      </select></label>
      <label>{t('portals.recordActions.revisionComments')}<textarea required maxLength="5000" value={submittalResubmission.comments} onChange={(event) => setSubmittalResubmission({ ...submittalResubmission, comments: event.target.value })} /></label>
      <div className="form-actions"><button type="button" className="btn" disabled={recordActionSaving} onClick={() => setShowResubmitSubmittal(false)}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary" disabled={recordActionSaving || !(data.submittals_for_resubmission?.items || []).length}>{recordActionSaving ? t('portals.submissions.saving') : t('portals.submissions.submit')}</button></div>
    </form>}
    {subcontractorAction && kind === 'subcontractor' && <form className="card portal-observation-form" onSubmit={submitSubcontractorAction}>
      <h2>{t(`portals.recordActions.${{ package: 'acknowledgePackage', instruction: 'acknowledgeInstruction', quantity: 'claimQuantity', payment: 'paymentApplication' }[subcontractorAction]}`)}</h2>
      {recordActionError && <p className="alert alert-danger" role="alert">{recordActionError}</p>}
      {subcontractorAction === 'quantity' && !actionPackages.length && <p className="alert alert-info" role="status">{t('portals.recordActions.noBoqPackage')}</p>}
      {subcontractorAction === 'instruction' ? <label>{t('portals.recordActions.instruction')}<select required value={subcontractorActionValues.instruction_id} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, instruction_id: event.target.value })}>
        <option value="">{t('portals.submissions.selectRecord')}</option>{(data.instructions_for_acknowledgement?.items || []).map((item) => <option key={item.id} value={item.id}>{item.instruction_number || `#${item.id}`} — {item.title}</option>)}
      </select></label> : <label>{t('portals.submissions.package')}<select required value={subcontractorActionValues.package_id} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, package_id: event.target.value })}>
        <option value="">{t('portals.submissions.selectRecord')}</option>{actionPackages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.contract_number || t('portals.submissions.packageOption', { id: pkg.id })}</option>)}
      </select></label>}
      {subcontractorAction === 'instruction' && <label>{t('portals.recordActions.response')}<textarea maxLength="2000" value={subcontractorActionValues.response} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, response: event.target.value })} /></label>}
      {['quantity', 'payment'].includes(subcontractorAction) && <>
        <label>{t('portals.recordActions.periodFrom')}<input type="date" required value={subcontractorActionValues.period_from} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, period_from: event.target.value })} /></label>
        <label>{t('portals.recordActions.periodTo')}<input type="date" required value={subcontractorActionValues.period_to} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, period_to: event.target.value })} /></label>
        {subcontractorAction === 'quantity' ? <label>{t('portals.recordActions.quantityClaimed')}<input name="quantity_claimed" type="number" min="0.001" step="0.001" required value={subcontractorActionValues.quantity_claimed} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, quantity_claimed: event.target.value })} /></label> : <>
          <label>{t('portals.recordActions.workValue')}<input name="work_value" type="number" min="0" step="0.01" required value={subcontractorActionValues.work_value} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, work_value: event.target.value })} /></label>
          <label>{t('portals.recordActions.retention')}<input name="retention" type="number" min="0" step="0.01" value={subcontractorActionValues.retention} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, retention: event.target.value })} /></label>
          <label>{t('portals.recordActions.materialsDeducted')}<input name="materials_deducted" type="number" min="0" step="0.01" value={subcontractorActionValues.materials_deducted} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, materials_deducted: event.target.value })} /></label>
          <label>{t('portals.recordActions.otherDeductions')}<input name="other_deductions" type="number" min="0" step="0.01" value={subcontractorActionValues.other_deductions} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, other_deductions: event.target.value })} /></label>
        </>}
        <label>{t('portals.recordActions.notes')}<textarea maxLength="4000" value={subcontractorActionValues.notes} onChange={(event) => setSubcontractorActionValues({ ...subcontractorActionValues, notes: event.target.value })} /></label>
      </>}
      <div className="form-actions"><button type="button" className="btn" disabled={recordActionSaving} onClick={() => setSubcontractorAction('')}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary" disabled={recordActionSaving || (subcontractorAction === 'instruction' ? !(data.instructions_for_acknowledgement?.items || []).length : !actionPackages.length)}>{recordActionSaving ? t('portals.submissions.saving') : t('portals.submissions.submit')}</button></div>
    </form>}
  </div>;
}

export default function PortalDashboard({ kind }) {
  const { t } = useLocale();
  const config = CONFIG[kind];
  const Icon = config.icon;
  const [data, setData] = useState(null);
  const [extra, setExtra] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState('');
  const [previewProjectId, setPreviewProjectId] = useState('');
  const [previewToken, setPreviewToken] = useState(() => sessionStorage.getItem('clientPreviewToken'));
  const canPreview = kind === 'client' && ['owner', 'admin', 'project_manager'].includes(authService.getCurrentUser()?.role);

  const startPreview = async () => {
    const id = Number(previewProjectId);
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
        <div><h1><Icon size={25} /> {t(`portals.dashboard.titles.${kind}`)}</h1><p>{t('portals.dashboard.scopeDescription')}</p></div>
        <div className="portal-toolbar">
          {projectIds.length > 1 && <select className="form-control" value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">{t('portals.dashboard.allProjects')}</option>{projectIds.map(id => <option key={id} value={id}>{t('portals.dashboard.projectOption', { id })}</option>)}</select>}
          {canPreview && (previewToken
            ? <button className="btn btn-secondary btn-sm" onClick={stopPreview}>{t('portals.dashboard.exitPreview')}</button>
            : <><select className="form-control" aria-label={t('portals.previewProject')} value={previewProjectId} onChange={(event) => setPreviewProjectId(event.target.value)}><option value="">{t('portals.selectPreviewProject')}</option>{(extra?.portfolio?.items || []).map((item) => <option key={item.id} value={item.id}>{item.name || item.project_name || t('portals.clientActions.project', { id: item.id })}</option>)}</select><button className="btn btn-secondary btn-sm" disabled={!previewProjectId} onClick={() => startPreview().catch(e => setError(e.message))}>{t('portals.previewAsClient')}</button></>)}
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={14} /> {t('portals.dashboard.refresh')}</button>
        </div>
      </header>
      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="card"><div className="card-body">{t('common.loading')}</div></div>}
      {!loading && data && <>
        {data.note && <div className="alert alert-info">{data.note_key ? t(data.note_key, { defaultValue: data.note }) : data.note}</div>}
        {data.setup_actions?.map((action, index) => <div className="alert alert-info" key={action}>{data.setup_action_keys?.[index] ? t(data.setup_action_keys[index], { defaultValue: action }) : action}</div>)}
        {extra?.portfolio?.is_portfolio && <><h2 className="portal-section-title">{t('portals.dashboard.portfolio')}</h2><div className="portal-grid"><Widget name="Projects" value={extra.portfolio.items} /></div></>}
        <QuickActions kind={kind} data={data} onDone={load} />
        <div className="portal-grid">{Object.entries(data).filter(([key]) => !['note', 'setup_actions', 'project_ids', 'supplier_ids', 'visibility', 'preview'].includes(key)).map(([key, value]) => kind === 'supplier' && key === 'expiring_documents'
          ? <SupplierComplianceAlerts key={key} value={value} />
          : kind === 'subcontractor' && key === 'wirs'
            ? <FormalInspectionRegister key={key} value={value} kind="wir" />
            : kind === 'supplier' && key === 'inspections'
              ? <FormalInspectionRegister key={key} value={value} kind="mir" />
              : <Widget key={key} name={key} value={value} />)}</div>
        {extra?.secondary != null && <><h2 className="portal-section-title">{t(`portals.dashboard.extraTitles.${config.extraTitleKey}`)}</h2><div className="portal-grid">{kind === 'consultant'
          ? <ConsultantReviews rows={extra.secondary} onDone={load} />
          : kind === 'client'
            ? <ClientActions data={extra.secondary} onDone={load} readOnly={Boolean(data.preview?.read_only)} />
            : kind === 'subcontractor'
              ? <SubcontractorSubmissionRegister value={extra.secondary} />
            : <Widget name={config.extraTitleKey} value={extra.secondary} />}</div></>}
      </>}
    </div>
  );
}
