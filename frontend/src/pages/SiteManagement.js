import { formatDate as sharedDate } from '../utils/formatters';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import TextEntryDialog from '../components/common/TextEntryDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import DocumentUpload from '../components/DocumentUpload';
import LoadMore from '../components/common/LoadMore';
import { ArrowLeft, Plus, CalendarDays, ClipboardList, Users, Sun, CheckCircle, X, Trash2, RefreshCw, WifiOff } from 'lucide-react';
import { openProtectedFile, ProtectedImage } from '../components/ProtectedMedia';
import { currentQueueOwnerId, notifySiteReportQueueChanged, siteReportQueueStore, syncQueuedSiteReports } from '../services/siteReportQueue';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => {
    const error = new Error(e.error || 'Request failed');
    error.status = r.status;
    error.code = e.error_code || e.code;
    throw error;
  });
  return apiResponseJson(r);
});

const newId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

async function uploadReportPhotos(files) {
  if (!files.length) return [];
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file, file.name));
  const token = localStorage.getItem('token');
  const response = await apiFetch(`${API_URL}/documents/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success) {
    const error = new Error(body.error || 'Photo upload failed');
    error.status = response.status;
    error.code = body.error_code || body.code;
    throw error;
  }
  return body.data || [];
}

const PRIORITY_LABELS = {
  en: { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' },
  ar: { low: 'منخفضة', normal: 'عادية', high: 'عالية', urgent: 'عاجلة' }
};
const PRIORITY_BADGE = { low: 'badge-info', normal: 'badge-info', high: 'badge-warning', urgent: 'badge-danger' };

const INSTRUCTION_STATUS_LABELS = {
  en: { issued: 'Issued', acknowledged: 'Acknowledged', implemented: 'Implemented', closed: 'Closed' },
  ar: { issued: 'صادرة', acknowledged: 'مستلمة', implemented: 'منفذة', closed: 'مغلقة' }
};
const INSTRUCTION_STATUS_BADGE = { issued: 'badge-warning', acknowledged: 'badge-info', implemented: 'badge-success', closed: 'badge-info' };
const NEXT_ACTION = { issued: 'acknowledge', acknowledged: 'implement', implemented: 'close' };
const NEXT_ACTION_LABELS = {
  en: { acknowledge: 'Acknowledge', implement: 'Mark Implemented', close: 'Close' },
  ar: { acknowledge: 'استلام', implement: 'تم التنفيذ', close: 'إغلاق' }
};

const formatDate = sharedDate;

function SiteManagement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState('reports');

  const TABS = [
    { key: 'reports', icon: CalendarDays, label: t('site.system.dailyReports') },
    { key: 'instructions', icon: ClipboardList, label: t('site.system.engineerInstructions') },
    { key: 'visits', icon: Users, label: t('site.system.siteVisits') },
  ];

  return (
    <div className="page-container site-management">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1>{t('site.system.siteManagement')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('site.system.dailyReportsInstructionsVisits')}
          </p>
        </div>
      </div>

      <div className="level-line" />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb.key} className={`btn ${tab === tb.key ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px' }} onClick={() => setTab(tb.key)}>
            <tb.icon size={14} />
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'reports' && <DailyReportsTab projectId={id} locale={locale} t={t} />}
      {tab === 'instructions' && <InstructionsTab projectId={id} locale={locale} t={t} />}
      {tab === 'visits' && <VisitsTab projectId={id} locale={locale} t={t} />}
    </div>
  );
}

// ============ DAILY REPORTS ============

function DailyReportsTab({ projectId, locale, t }) {
  const [reports, setReports] = useState([]);
  const reportsLength = useRef(0); reportsLength.current = reports.length;
  const [totalCount, setTotalCount] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [queuedReports, setQueuedReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [discarding, setDiscarding] = useState(null);
  const ownerId = currentQueueOwnerId();

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/projects/${projectId}/site-reports?limit=200&offset=${append ? reportsLength.current : 0}`);
      if (res.success) { setReports(current => append ? [...current, ...(res.data || [])] : (res.data || [])); setTotalCount(res.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  const refreshQueue = useCallback(async () => {
    if (!ownerId) { setQueuedReports([]); return; }
    try { setQueuedReports(await siteReportQueueStore.list(ownerId, String(projectId))); }
    catch (error) { console.error('Could not read the site report queue:', error); }
  }, [ownerId, projectId]);

  const syncQueue = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!ownerId || !token || !navigator.onLine) return;
    const result = await syncQueuedSiteReports({ ownerId, projectId: String(projectId), token });
    await refreshQueue();
    if (result.synced > 0) load();
  }, [load, ownerId, projectId, refreshQueue]);

  useEffect(() => {
    load();
    refreshQueue();
    if (navigator.onLine) syncQueue();
    const onOnline = () => syncQueue();
    const onQueueChanged = () => refreshQueue();
    window.addEventListener('online', onOnline);
    window.addEventListener('site-report-queue-updated', onQueueChanged);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('site-report-queue-updated', onQueueChanged);
    };
  }, [load, refreshQueue, syncQueue]);

  useEffect(() => {
    if (!navigator.onLine) return undefined;
    const retryAt = queuedReports
      .filter((item) => item.status === 'queued' && item.nextAttemptAt > Date.now())
      .reduce((earliest, item) => Math.min(earliest, item.nextAttemptAt), Infinity);
    if (!Number.isFinite(retryAt)) return undefined;
    const timer = window.setTimeout(syncQueue, Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [queuedReports, syncQueue]);

  const retryQueuedReport = async (item) => {
    await siteReportQueueStore.update(item.id, { status: 'queued', errorCode: null, nextAttemptAt: null });
    await refreshQueue();
    await syncQueue();
  };

  const discardQueuedReport = async () => {
    if (!discarding) return;
    await siteReportQueueStore.remove(discarding.id);
    setDiscarding(null);
    await refreshQueue();
    notifySiteReportQueueChanged();
  };

  return (
    <div>
      {queuedReports.length > 0 && <section className="card site-report-queue" aria-live="polite">
        <h3><WifiOff size={16} aria-hidden="true" /> {t('site.offline.title')} ({queuedReports.length})</h3>
        <div className="site-report-queue-list">
          {queuedReports.map((item) => <article key={item.id} className="site-report-queue-item">
            <div>
              <strong>{item.payload.report_date}</strong>
              <p>{item.payload.work_summary}</p>
              <span className={`badge ${item.status === 'conflict' || item.status === 'failed' ? 'badge-danger' : 'badge-info'}`}>
                {t(`site.offline.status.${item.status}`)}
              </span>
              {item.errorCode && <span className="site-report-queue-error">{t('site.offline.syncError')}</span>}
            </div>
            <div className="site-report-queue-actions">
              {item.status !== 'syncing' && <button type="button" className="btn btn-sm" onClick={() => retryQueuedReport(item)}>
                <RefreshCw size={14} aria-hidden="true" /> {t('site.offline.retry')}
              </button>}
              <button type="button" className="btn btn-sm btn-danger" onClick={() => setDiscarding(item)}>
                <Trash2 size={14} aria-hidden="true" /> {t('site.offline.remove')}
              </button>
            </div>
          </article>)}
        </div>
      </section>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t('site.system.fileTodaySReport')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : reports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <CalendarDays size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('site.system.noDailyReportsFiledYet')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reports.map(r => (
            <div className="card" key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--color-accent)' }}>{formatDate(r.report_date)}</span>
                  {r.weather && <span className="badge badge-info"><Sun size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{r.weather}{r.temperature ? ` ${r.temperature}` : ''}</span>}
                  <span className="badge badge-info"><Users size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{r.workers_count} {t('site.system.workers')}</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{r.created_by_name || ''}</span>
              </div>
              {r.work_summary && <p style={{ marginTop: '12px', fontSize: '14px' }}>{r.work_summary}</p>}
              <div className="site-report-summary-grid">
                {r.material_received && <div><strong>{t('site.system.materialsReceived')}</strong>{r.material_received}</div>}
                {r.equipment_on_site && <div><strong>{t('site.system.equipmentOnSite')}</strong>{r.equipment_on_site}</div>}
                {r.issues_notes && <div style={{ color: 'var(--color-danger, #e5534b)' }}><strong>{t('site.system.issues')}</strong>{r.issues_notes}</div>}
              </div>
              {Array.isArray(r.photos) && r.photos.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {r.photos.map((p, i) => (
                    <a key={i} href="#open-file" onClick={e => { e.preventDefault(); openProtectedFile(p.file_url).catch(error => window.alert(error.message)); }}>
                      <ProtectedImage fileUrl={p.file_url} alt={p.original_name || 'site'} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
                        onError={e => { e.target.style.display = 'none'; e.target.parentNode.innerHTML = '📎 ' + (p.original_name || 'file'); }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <LoadMore loadedCount={reports.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
      {showModal && <ReportModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={() => { load(); refreshQueue(); }} />}
      <ConfirmDialog open={!!discarding} title={t('site.offline.removeTitle')} message={t('site.offline.removeMessage')}
        confirmLabel={t('site.offline.remove')} destructive onConfirm={discardQueuedReport} onCancel={() => setDiscarding(null)} />
    </div>
  );
}

function ReportModal({ projectId, locale, t, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const idempotencyKey = useRef(newId());
  const photoInput = useRef(null);
  const [form, setForm] = useState({
    report_date: today, weather: '', temperature: '', workers_count: 0,
    work_summary: '', material_received: '', equipment_on_site: '', issues_notes: '',
  });
  const [measurements, setMeasurements] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [catalog, setCatalog] = useState({ locations: [], items: [], loading: true, error: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchApi(`${API_URL}/locations/project/${projectId}`),
      fetchApi(`${API_URL}/boq/items/${projectId}`),
    ]).then(([locationsRes, itemsRes]) => {
      if (active) setCatalog({ locations: locationsRes.data || [], items: itemsRes.data || [], loading: false, error: false });
    }).catch(() => {
      if (active) setCatalog((current) => ({ ...current, loading: false, error: true }));
    });
    return () => { active = false; };
  }, [projectId]);

  const addMeasurement = () => setMeasurements((rows) => [...rows, { rowId: newId(), project_location_id: '', boq_item_id: '', quantity: '' }]);
  const changeMeasurement = (rowId, field, value) => setMeasurements((rows) => rows.map((row) => row.rowId === rowId ? { ...row, [field]: value } : row));
  const removeMeasurement = (rowId) => setMeasurements((rows) => rows.filter((row) => row.rowId !== rowId));

  const handlePhotos = (fileList) => {
    const picked = Array.from(fileList || []);
    if (photos.length + picked.length > 5) { setError(t('common.upload.tooMany', { count: 5 })); return; }
    if (picked.some((file) => file.size > 10 * 1024 * 1024)) { setError(t('common.upload.tooLarge', { size: 10 })); return; }
    setError('');
    setPhotos((current) => [...current, ...picked]);
    if (photoInput.current) photoInput.current.value = '';
  };

  const saveForSync = async (payload, uploadedPhotos = [], remainingFiles = photos) => {
    const ownerId = currentQueueOwnerId();
    if (!ownerId) throw new Error(t('site.offline.userUnavailable'));
    await siteReportQueueStore.add({
      id: newId(), ownerId, projectId: String(projectId), status: 'queued', idempotencyKey: idempotencyKey.current,
      payload, photos: uploadedPhotos, files: remainingFiles, attempts: 0, errorCode: null, nextAttemptAt: null,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    notifySiteReportQueueChanged();
    onSave();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    let uploadedPhotos = [];
    let filesToSync = photos;
    try {
      const measurementRows = measurements.filter((row) => row.project_location_id || row.boq_item_id || row.quantity !== '');
      if (measurementRows.some((row) => !row.project_location_id || !row.boq_item_id || row.quantity === '' || !Number.isFinite(Number(row.quantity)) || Number(row.quantity) < 0)) {
        setError(t('site.offline.invalidMeasurement'));
        return;
      }
      const payload = {
        ...form,
        workers_count: Number(form.workers_count) || 0,
        measurements: measurementRows.map((row) => {
          const item = catalog.items.find((candidate) => Number(candidate.id) === Number(row.boq_item_id));
          return {
            project_location_id: Number(row.project_location_id), boq_item_id: Number(row.boq_item_id),
            quantity: Number(row.quantity), unit: item?.unit || null,
          };
        }),
      };
      if (!navigator.onLine) {
        await saveForSync(payload);
        return;
      }
      if (photos.length) {
        uploadedPhotos = await uploadReportPhotos(photos);
        filesToSync = [];
      }
      const res = await fetchApi(`${API_URL}/projects/${projectId}/site-reports`, {
        method: 'POST', headers: { ...headers(), 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify({ ...payload, photos: uploadedPhotos }),
      });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (submitError) {
      if (submitError instanceof TypeError || !navigator.onLine) {
        try { await saveForSync({
          ...form,
          workers_count: Number(form.workers_count) || 0,
          measurements: measurements.filter((row) => row.project_location_id && row.boq_item_id && row.quantity !== '')
            .map((row) => ({ project_location_id: Number(row.project_location_id), boq_item_id: Number(row.boq_item_id), quantity: Number(row.quantity), unit: catalog.items.find((candidate) => Number(candidate.id) === Number(row.boq_item_id))?.unit || null })),
        }, uploadedPhotos, filesToSync); }
        catch (queueError) { setError(queueError.message || t('site.offline.storageError')); }
      } else setError(submitError.message || t('site.offline.syncError'));
    }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('site.system.dailySiteReport')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="site-report-form-grid site-report-form-grid-three">
                <div className="form-group">
                  <label className="form-label">{t('site.system.date')} *</label>
                  <input className="form-input" type="date" value={form.report_date} onChange={e => handleChange('report_date', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('site.system.weather')}</label>
                  <input className="form-input" value={form.weather} onChange={e => handleChange('weather', e.target.value)} placeholder={t('site.system.sunny')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('site.system.temp')}</label>
                  <input className="form-input" value={form.temperature} onChange={e => handleChange('temperature', e.target.value)} placeholder="35°C" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('site.system.workersCount')}</label>
                <input className="form-input" type="number" min="0" value={form.workers_count} onChange={e => handleChange('workers_count', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('site.system.workSummary')} *</label>
                <textarea className="form-textarea" value={form.work_summary} onChange={e => handleChange('work_summary', e.target.value)} required />
              </div>
              <div className="site-report-form-grid">
                <div className="form-group">
                  <label className="form-label">{t('site.system.materialsReceived2')}</label>
                  <textarea className="form-textarea" value={form.material_received} onChange={e => handleChange('material_received', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('site.system.equipmentOnSite2')}</label>
                  <textarea className="form-textarea" value={form.equipment_on_site} onChange={e => handleChange('equipment_on_site', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('site.system.issuesNotes')}</label>
                <textarea className="form-textarea" value={form.issues_notes} onChange={e => handleChange('issues_notes', e.target.value)} />
              </div>
              <section className="site-report-measurements">
                <div className="site-report-section-heading">
                  <h4>{t('site.offline.measurements')}</h4>
                  <button type="button" className="btn btn-sm" onClick={addMeasurement} disabled={catalog.loading || catalog.error || !catalog.items.length || !catalog.locations.length}>
                    <Plus size={14} aria-hidden="true" /> {t('site.offline.addMeasurement')}
                  </button>
                </div>
                {catalog.loading && <p role="status">{t('site.offline.catalogLoading')}</p>}
                {catalog.error && <p className="alert alert-danger" role="alert">{t('site.offline.catalogError')}</p>}
                {!catalog.loading && !catalog.error && measurements.map((row) => {
                  const selectedItem = catalog.items.find((item) => Number(item.id) === Number(row.boq_item_id));
                  return <div className="site-report-measurement-row" key={row.rowId}>
                    <label className="form-group">
                      <span className="form-label">{t('site.offline.location')}</span>
                      <select className="form-input" value={row.project_location_id} onChange={(event) => changeMeasurement(row.rowId, 'project_location_id', event.target.value)} required>
                        <option value="">{t('site.offline.chooseLocation')}</option>
                        {catalog.locations.map((location) => <option key={location.id} value={location.id}>{locale === 'ar' ? (location.name_ar || location.name || location.name_en) : (location.name_en || location.name || location.name_ar)}</option>)}
                      </select>
                    </label>
                    <label className="form-group">
                      <span className="form-label">{t('site.offline.boqItem')}</span>
                      <select className="form-input" value={row.boq_item_id} onChange={(event) => changeMeasurement(row.rowId, 'boq_item_id', event.target.value)} required>
                        <option value="">{t('site.offline.chooseItem')}</option>
                        {catalog.items.map((item) => <option key={item.id} value={item.id}>{item.code} · {locale === 'ar' ? (item.description_ar || item.description || item.description_en) : (item.description_en || item.description || item.description_ar)}</option>)}
                      </select>
                    </label>
                    <label className="form-group">
                      <span className="form-label">{t('site.offline.quantity')}</span>
                      <input className="form-input" type="number" min="0" step="any" required value={row.quantity} onChange={(event) => changeMeasurement(row.rowId, 'quantity', event.target.value)} />
                    </label>
                    <span className="site-report-measurement-unit">{selectedItem?.unit || t('site.offline.unit')}</span>
                    <button type="button" className="btn btn-sm btn-danger" aria-label={t('site.offline.removeMeasurement')} onClick={() => removeMeasurement(row.rowId)}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>;
                })}
              </section>
              <div className="form-group">
                <label className="form-label" htmlFor="site-report-photos">{t('site.offline.photos')}</label>
                <input ref={photoInput} id="site-report-photos" className="form-input" type="file" accept="image/*,.pdf" multiple
                  onChange={(event) => handlePhotos(event.target.files)} />
                <div className="form-hint">{t('common.upload.limits', { count: 5, size: 10 })}</div>
                {photos.length > 0 && <ul className="site-report-photo-list">
                  {photos.map((file, index) => <li key={`${file.name}-${file.lastModified}-${index}`}>
                    <span>{file.name} ({Math.ceil(file.size / 1024)}  {t('site.system.kb')}</span>
                    <button type="button" className="btn btn-sm" aria-label={t('common.upload.remove', { name: file.name })} onClick={() => setPhotos((current) => current.filter((_, i) => i !== index))}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>)}
                </ul>}
              </div>
              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ INSTRUCTIONS ============

function InstructionsTab({ projectId, locale, t }) {
  const [instructions, setInstructions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [closeTarget, setCloseTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetchApi(`${API_URL}/projects/${projectId}/instructions${params}`);
      if (res.success) setInstructions(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const advance = async (inst) => {
    const action = NEXT_ACTION[inst.status];
    if (!action) return;
    if (action === 'close') {
      setCloseTarget(inst);
      return;
    }
    await submitInstructionAction(inst, action);
  };

  const submitInstructionAction = async (inst, action, response) => {
    try {
      await fetchApi(`${API_URL}/projects/${projectId}/instructions/${inst.id}/${action}`, {
        method: 'POST', body: JSON.stringify(response ? { response } : {}),
      });
      setCloseTarget(null);
      await load();
    } catch (e) { throw e; }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all', 'issued', 'acknowledged', 'implemented', 'closed'].map(s => (
            <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : ''}`} style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? (t('site.system.all')) : (INSTRUCTION_STATUS_LABELS[locale]?.[s] || s)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t('site.system.issueInstruction')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : instructions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ClipboardList size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('site.system.noInstructions')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('site.system.title')}</th>
                <th>{t('site.system.priority')}</th>
                <th>{t('common.status')}</th>
                <th>{t('site.system.issuedBy')}</th>
                <th>{t('site.system.date')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {instructions.map(inst => (
                <tr key={inst.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{inst.instruction_number}</td>
                  <td style={{ fontWeight: 500 }}>
                    {inst.title}
                    {inst.response && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>↳ {inst.response}</div>}
                  </td>
                  <td><span className={`badge ${PRIORITY_BADGE[inst.priority]}`}>{PRIORITY_LABELS[locale]?.[inst.priority] || inst.priority}</span></td>
                  <td><span className={`badge ${INSTRUCTION_STATUS_BADGE[inst.status]}`}>{INSTRUCTION_STATUS_LABELS[locale]?.[inst.status] || inst.status}</span></td>
                  <td style={{ fontSize: '13px' }}>{inst.issued_by_name || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(inst.issued_date)}</td>
                  <td>
                    {NEXT_ACTION[inst.status] ? (
                      <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => advance(inst)}>
                        <CheckCircle size={12} />
                        {NEXT_ACTION_LABELS[locale]?.[NEXT_ACTION[inst.status]]}
                      </button>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                        {t('site.system.closed')} {inst.closed_by_name ? `— ${inst.closed_by_name}` : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <InstructionModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={load} />}
      <TextEntryDialog open={Boolean(closeTarget)} title={t('common.dialogs.closeInstructionTitle')} label={t('common.dialogs.closingResponseLabel')} required={false} onSubmit={(response) => submitInstructionAction(closeTarget, 'close', response)} onCancel={() => setCloseTarget(null)} />
    </div>
  );
}

function InstructionModal({ projectId, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetchApi(`${API_URL}/projects/${projectId}/instructions`, { method: 'POST', body: JSON.stringify(form) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('site.system.issueInstruction')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('site.system.title')} *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">{t('site.system.priority')}</label>
                <select className="form-select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{PRIORITY_LABELS[locale]?.[p] || p}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ SITE VISITS ============

function VisitsTab({ projectId, locale, t }) {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/projects/${projectId}/site-visits`);
      if (res.success) setVisits(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const toggleActionItem = async (visit, idx) => {
    const items = [...(visit.action_items || [])];
    items[idx] = { ...items[idx], done: !items[idx].done };
    try {
      await fetchApi(`${API_URL}/projects/${projectId}/site-visits/${visit.id}`, {
        method: 'PUT', body: JSON.stringify({ action_items: items }),
      });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t('site.system.logVisit')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : visits.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Users size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('site.system.noVisitsLogged')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {visits.map(v => (
            <div className="card" key={v.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{v.visitor_name}</span>
                  {v.visitor_role && <span className="badge badge-info" style={{ marginLeft: '8px' }}>{v.visitor_role}</span>}
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--color-text-secondary)' }}>{formatDate(v.visit_date)}</span>
              </div>
              {v.notes && <p style={{ marginTop: '8px', fontSize: '14px', color: 'var(--color-text-secondary)' }}>{v.notes}</p>}
              {Array.isArray(v.action_items) && v.action_items.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>{t('site.system.actionItems')}</div>
                  {v.action_items.map((item, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '4px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!item.done} onChange={() => toggleActionItem(v, i)} />
                      <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--color-text-secondary)' : 'inherit' }}>{item.text}</span>
                    </label>
                  ))}
                </div>
              )}
              {Array.isArray(v.photos) && v.photos.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                  {v.photos.map((p, i) => (
                    <a key={i} href="#open-file" onClick={e => { e.preventDefault(); openProtectedFile(p.file_url).catch(error => window.alert(error.message)); }}>
                      <ProtectedImage fileUrl={p.file_url} alt={p.original_name || 'visit'} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && <VisitModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={load} />}
    </div>
  );
}

function VisitModal({ projectId, locale, t, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ visit_date: today, visitor_name: '', visitor_role: '', notes: '', photos: [] });
  const [actionItems, setActionItems] = useState([]);
  const [newItem, setNewItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const addItem = () => {
    if (!newItem.trim()) return;
    setActionItems(items => [...items, { text: newItem.trim(), done: false }]);
    setNewItem('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, action_items: actionItems };
      const res = await fetchApi(`${API_URL}/projects/${projectId}/site-visits`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('site.system.logSiteVisit')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="site-report-form-grid site-report-form-grid-three">
                <div className="form-group">
                  <label className="form-label">{t('site.system.date')} *</label>
                  <input className="form-input" type="date" value={form.visit_date} onChange={e => handleChange('visit_date', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('site.system.visitorName')} *</label>
                  <input className="form-input" value={form.visitor_name} onChange={e => handleChange('visitor_name', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('site.system.role')}</label>
                  <input className="form-input" value={form.visitor_role} onChange={e => handleChange('visitor_role', e.target.value)} placeholder={t('site.system.consultant')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('site.system.notes')}</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('site.system.actionItems')}</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-input" value={newItem} onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                    placeholder={t('site.system.addAnItem')} />
                  <button type="button" className="btn" onClick={addItem}><Plus size={14} /></button>
                </div>
                {actionItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', marginTop: '6px' }}>
                    <span style={{ flex: 1 }}>• {item.text}</span>
                    <button type="button" onClick={() => setActionItems(items => items.filter((_, x) => x !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <DocumentUpload locale={locale} accept="image/*,.pdf"
                label={t('site.system.photos')}
                onUploaded={files => handleChange('photos', files || [])} />
              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SiteManagement;
