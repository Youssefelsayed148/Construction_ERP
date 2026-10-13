// Phase 25 — handover, closeout & warranty workspace: the exact lifecycle,
// the package checklist with document upload + completion percent, the asset
// register, and the warranty/DLP claim flow with SLA tracking.
// Zero punch items render a correct 0%/clean state, never an error.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { openProtectedFile } from '../components/ProtectedMedia';
import DocumentUpload from '../components/DocumentUpload';
import TextEntryDialog from '../components/common/TextEntryDialog';
import { ArrowLeft, Plus, KeyRound, PackageCheck, CheckCircle, FileText } from 'lucide-react';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options, translate = (key) => key) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error_code ? translate(`handover.errors.${e.error_code}`) : (e.error || translate('common.states.error'))); });
  return r.json();
});

const downloadPdf = (path, filename) => openProtectedFile(path);

const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
};

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
      <Icon size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }} />
      <p style={{ color: 'var(--color-text-secondary)' }}>{text}</p>
    </div>
  );
}

const STATUS_BADGE = { pending: 'badge-info', uploaded: 'badge-warning', approved: 'badge-info', complete: 'badge-success' };
const CLAIM_STATUS_BADGE = { raised: 'badge-danger', assigned: 'badge-warning', rectification_in_progress: 'badge-warning', submitted_for_acceptance: 'badge-info', accepted: 'badge-success', rejected: 'badge-danger', closed: 'badge-info' };

export default function Handover() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState('lifecycle');
  const [data, setData] = useState(null);
  const [assets, setAssets] = useState([]);
  const [claims, setClaims] = useState([]);
  const [packageItems, setPackageItems] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [uploadTarget, setUploadTarget] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [assetDocumentAsset, setAssetDocumentAsset] = useState(null);
  const [assetDocuments, setAssetDocuments] = useState([]);
  const [assetDocumentError, setAssetDocumentError] = useState('');
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [assetForm, setAssetForm] = useState({ asset_code: '', name: '', model: '', serial_no: '', commissioning_date: '', warranty_start: '', warranty_end: '' });
  const [showWarrantyForm, setShowWarrantyForm] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [warrantyForm, setWarrantyForm] = useState({ title: '', issuer: '', asset_id: '', coverage_description: '', start_date: '', end_date: '', notes: '' });
  const [warrantyDocumentId, setWarrantyDocumentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const apiCall = useCallback((url, options) => fetchApi(url, options, t), [t]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [p, packageResult, a, c, w] = await Promise.all([
        apiCall(`${API_URL}/handover/process/${id}`),
        apiCall(`${API_URL}/handover/package/${id}`),
        apiCall(`${API_URL}/handover/assets?project_id=${id}`),
        apiCall(`${API_URL}/handover/claims?project_id=${id}`),
        apiCall(`${API_URL}/handover/warranties?project_id=${id}`),
      ]);
      setData(p.data || { process: null, readiness: { percent: 0 } });
      setPackageItems(packageResult.data?.items || []);
      setAssets(a.data || []);
      setClaims(c.data || []);
      setWarranties(w.data || []);
    } catch (e) { setLoadError(e.message); }
    finally { setLoading(false); }
  }, [apiCall, id]);

  useEffect(() => { load(); }, [load]);

  const start = async () => {
    try {
      await apiCall(`${API_URL}/handover/process/${id}/start`, { method: 'POST', body: '{}' });
      load();
    } catch (e) { alert(e.message); }
  };

  const advance = async () => {
    const process = data?.process;
    if (!process) return;
    const states = ['pre_handover', 'punch_snag', 'rectification', 'final_inspection', 'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over', 'dlp_warranty', 'final_completion'];
    const next = states[states.indexOf(process.status) + 1];
    if (!next) return;
    try {
      await apiCall(`${API_URL}/handover/process/${process.id}/transition`, { method: 'POST', body: JSON.stringify({ status: next }) });
      load();
    } catch (e) { alert(e.message); }
  };

  const createProjectDocument = async (file, projectId, title) => {
    const result = await apiCall(`${API_URL}/docs/documents`, { method: 'POST', body: JSON.stringify({
      project_id: Number(projectId), title: title || file.original_name,
      document_type: ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(String(file.file_type).toLowerCase()) ? 'photo' : 'other',
      file_url: file.file_url, file_type: file.file_type, file_size_bytes: file.file_size_bytes,
      doc_type: 'other', doc_status: 'draft', confidentiality: 'internal', portal_visibility: 'internal',
    }) });
    return result.data;
  };
  const uploadedPackageDocument = async (item, file) => {
    setUploadError('');
    try {
      const document = await createProjectDocument(file, id, item.title);
      await apiCall(`${API_URL}/handover/package/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ project_document_id: document.id, status: 'uploaded' }) });
      setUploadTarget(null); await load();
    } catch (e) { setUploadError(e.message); }
  };
  const openAssetDocuments = async (asset) => {
    setAssetDocumentAsset(asset); setAssetDocumentError('');
    try { const result = await apiCall(`${API_URL}/handover/assets/${asset.id}/documents`); setAssetDocuments(result.data || []); }
    catch (e) { setAssetDocumentError(e.message); }
  };
  const uploadedAssetDocument = async (asset, file) => {
    setAssetDocumentError('');
    try {
      const document = await createProjectDocument(file, id, file.original_name);
      await apiCall(`${API_URL}/handover/assets/${asset.id}/documents`, { method: 'POST', body: JSON.stringify({ project_document_id: document.id, document_type: 'other' }) });
      await openAssetDocuments(asset);
    } catch (e) { setAssetDocumentError(e.message); }
  };
  const uploadedWarrantyDocument = async (file) => {
    setUploadError('');
    try { const document = await createProjectDocument(file, id, warrantyForm.title || file.original_name); setWarrantyDocumentId(document.id); }
    catch (e) { setUploadError(e.message); }
  };
  const submitAsset = async (event) => {
    event.preventDefault();
    try {
      await apiCall(`${API_URL}/handover/assets`, { method: 'POST', body: JSON.stringify({ project_id: Number(id), ...assetForm,
        commissioning_date: assetForm.commissioning_date || null, warranty_start: assetForm.warranty_start || null, warranty_end: assetForm.warranty_end || null }) });
      setShowAssetForm(false); setAssetForm({ asset_code: '', name: '', model: '', serial_no: '', commissioning_date: '', warranty_start: '', warranty_end: '' }); await load();
    } catch (e) { alert(e.message); }
  };
  const submitWarranty = async (event) => {
    event.preventDefault(); setUploadError('');
    try {
      await apiCall(`${API_URL}/handover/warranties`, { method: 'POST', body: JSON.stringify({
        project_id: Number(id), ...warrantyForm, asset_id: warrantyForm.asset_id ? Number(warrantyForm.asset_id) : null, project_document_id: warrantyDocumentId,
      }) });
      setShowWarrantyForm(false); setWarrantyDocumentId(null); setWarrantyForm({ title: '', issuer: '', asset_id: '', coverage_description: '', start_date: '', end_date: '', notes: '' }); await load();
    } catch (e) { setUploadError(e.message); }
  };
  const updateWarrantyStatus = async (warranty, status) => {
    try { await apiCall(`${API_URL}/handover/warranties/${warranty.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); await load(); }
    catch (e) { alert(e.message); }
  };
  const warrantyStatusLabel = (status) => ({
    active: t('handover.warrantyStatuses.active'), expired: t('handover.warrantyStatuses.expired'), void: t('handover.warrantyStatuses.void'),
  }[status] || status);

  const verifyItem = async (item, status) => {
    try {
      await apiCall(`${API_URL}/handover/package/items/${item.id}/verify`, { method: 'POST', body: JSON.stringify({ status }) });
      load();
    } catch (e) { alert(e.message); }
  };

  const raiseAsset = () => { setShowAssetForm(true); };

  const raiseClaim = () => setShowClaimForm(true);

  const createClaim = async (title) => {
    try {
      await apiCall(`${API_URL}/handover/claims`, { method: 'POST', body: JSON.stringify({ project_id: Number(id), title, description: title, sla_days: 30 }) });
      setShowClaimForm(false);
      await load();
    } catch (e) { throw e; }
  };

  const TABS = [
    { key: 'lifecycle', icon: ArrowLeft, label: locale === 'ar' ? 'دورة التسليم' : 'Lifecycle' },
    { key: 'package', icon: PackageCheck, label: locale === 'ar' ? 'حزمة التسليم' : 'Handover package' },
    { key: 'assets', icon: KeyRound, label: locale === 'ar' ? 'سجل الأصول' : 'Asset register' },
    { key: 'warranties', icon: FileText, label: t('handover.warranties') },
    { key: 'claims', icon: CheckCircle, label: locale === 'ar' ? 'مطالبات الضمان' : 'Warranty claims' },
  ];

  const readiness = data?.readiness || { percent: 0, items_total: 0, open_punch_items: 0 };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: 20 }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /></button>
        <div>
          <h1>{locale === 'ar' ? 'التسليم والإقفال' : 'Handover & closeout'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'دورة التسليم والحزمة وسجل الأصول ومطالبات الضمان' : 'Lifecycle, package checklist, asset register & warranty claims'}
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">{locale === 'ar' ? 'جاهزية التسليم' : 'Handover readiness'}</div>
          <div className="stat-value" style={{ color: readiness.percent === 100 ? 'var(--color-success)' : 'var(--color-accent)' }}>{readiness.percent}%</div></div>
        <div className="stat-card"><div className="stat-label">{locale === 'ar' ? 'بنود الحزمة' : 'Package items'}</div>
          <div className="stat-value">{readiness.items_total ? `${readiness.items_complete}/${readiness.items_total}` : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">{locale === 'ar' ? 'بنود PUNCH مفتوحة' : 'Open punch items'}</div>
          <div className="stat-value" style={{ color: readiness.open_punch_items > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' }}>{readiness.open_punch_items}</div></div>
        <div className="stat-card"><div className="stat-label">{locale === 'ar' ? 'مطالبات الضمان' : 'Warranty claims'}</div>
          <div className="stat-value">{claims.length || '—'}</div></div>
      </div>

      <div className="level-line" />

      {loading && <p role="status">{t('common.states.loading')}</p>}
      {loadError && <div role="alert" className="alert alert-danger">{loadError} <button className="btn" onClick={load}>{t('common.states.retry')}</button></div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb.key} className={`btn ${tab === tb.key ? 'btn-primary' : ''}`} style={{ padding: '6px 16px', fontSize: 13 }} onClick={() => setTab(tb.key)}>
            <tb.icon size={14} />{tb.label}
          </button>
        ))}
      </div>

      {tab === 'lifecycle' && (
        !data?.process ? (
          <EmptyState icon={ArrowLeft} text={locale === 'ar' ? 'لم تبدأ دورة التسليم بعد.' : 'No handover process started yet.'} />
        ) : (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>{data.process.process_number}</span>
              <span className="badge badge-info">{data.process.status}</span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {['pre_handover', 'punch_snag', 'rectification', 'final_inspection', 'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over', 'dlp_warranty', 'final_completion'].map(s => {
                const states = ['pre_handover', 'punch_snag', 'rectification', 'final_inspection', 'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over', 'dlp_warranty', 'final_completion'];
                const reached = states.indexOf(s) <= states.indexOf(data.process.status);
                return (
                  <div key={s} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: reached ? 'var(--color-success)' : 'var(--color-surface-raised)' }} />
                    {s.replace(/_/g, ' ')}
                  </div>
                );
              })}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={advance}>Advance</button>
          </div>
        )
      )}

      {tab === 'lifecycle' && !data?.process && (
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={start}>Start handover process</button>
      )}

      {tab === 'package' && (
        packageItems.length === 0 ? (
          <EmptyState icon={PackageCheck} text={locale === 'ar' ? 'الحزمة فارغة (0% جاهزية).' : 'The handover package is empty — 0% complete.'} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>#</th><th>{locale === 'ar' ? 'البند' : 'Item'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {packageItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 500 }}>{item.title}{item.project_document_title ? <div><button className="btn" onClick={() => openProtectedFile(item.project_document_url).catch((error) => alert(error.message))}>{item.project_document_title}</button></div> : item.document_url ? <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{t('handover.legacyDocumentUrl')}</div> : null}</td>
                    <td><span className={`badge ${STATUS_BADGE[item.status] || 'badge-info'}`}>{item.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn" style={{ padding: '4px 10px' }} onClick={() => { setUploadTarget(item); setUploadError(''); }}>{t('handover.uploadEvidence')}</button>{' '}
                      {item.status !== 'complete' && (
                        <>
                          <button className="btn" style={{ padding: '4px 10px' }} onClick={() => verifyItem(item, 'approved')}>{locale === 'ar' ? 'اعتماد' : 'Approve'}</button>{' '}
                          <button className="btn" style={{ padding: '4px 10px' }} onClick={() => verifyItem(item, 'complete')}>{locale === 'ar' ? 'مكتمل' : 'Complete'}</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'assets' && (
        <>
          <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={raiseAsset}><Plus size={16} />{locale === 'ar' ? 'أصل جديد' : 'New asset'}</button>
          {assets.length === 0 ? (
            <EmptyState icon={KeyRound} text={locale === 'ar' ? 'لا توجد أصول.' : 'No assets registered yet.'} />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Code</th><th>{locale === 'ar' ? 'الاسم' : 'Name'}</th><th>Serial</th><th>{locale === 'ar' ? 'التشغيل' : 'Commissioned'}</th><th>{locale === 'ar' ? 'نهاية الضمان' : 'Warranty end'}</th><th>{t('common.actions')}</th></tr></thead>
                <tbody>
                  {assets.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.asset_code}</td>
                      <td>{a.name}</td>
                      <td>{a.serial_no || '-'}</td>
                      <td>{fmtDate(a.commissioning_date)}</td>
                      <td>{fmtDate(a.warranty_end)}</td>
                      <td><button className="btn" onClick={() => openAssetDocuments(a)}>{t('handover.assetDocuments')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'claims' && (
        <>
          <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={raiseClaim}><Plus size={16} />{locale === 'ar' ? 'مطالبة جديدة' : 'New claim'}</button>
          {claims.length === 0 ? (
            <EmptyState icon={CheckCircle} text={locale === 'ar' ? 'لا مطالبات — السجل نظيف.' : 'No warranty claims — the DLP register is clean.'} />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Claim</th><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{locale === 'ar' ? 'الاستحقاق' : 'Due'}</th></tr></thead>
                <tbody>
                  {claims.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.claim_number}</td>
                      <td style={{ fontWeight: 500 }}>{c.title}</td>
                      <td><span className={`badge ${CLAIM_STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                      <td>{fmtDate(c.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'warranties' && (
        <>
          <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => { setShowWarrantyForm(true); setUploadError(''); }}><Plus size={16} />{t('handover.newWarranty')}</button>
          {showWarrantyForm && <form className="card" onSubmit={submitWarranty} style={{ display: 'grid', gap: 10, maxWidth: 700, marginBottom: 16 }}>
            <label>{t('handover.warrantyTitle')}<input className="input" required value={warrantyForm.title} onChange={(event) => setWarrantyForm({ ...warrantyForm, title: event.target.value })} /></label>
            <label>{t('handover.warrantyIssuer')}<input className="input" required value={warrantyForm.issuer} onChange={(event) => setWarrantyForm({ ...warrantyForm, issuer: event.target.value })} /></label>
            <label>{t('handover.asset')}<select className="input" value={warrantyForm.asset_id} onChange={(event) => setWarrantyForm({ ...warrantyForm, asset_id: event.target.value })}><option value="">{t('handover.noAsset')}</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.asset_code} · {asset.name}</option>)}</select></label>
            <label>{t('handover.coverage')}<textarea className="input" value={warrantyForm.coverage_description} onChange={(event) => setWarrantyForm({ ...warrantyForm, coverage_description: event.target.value })} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label>{t('handover.startDate')}<input className="input" type="date" required value={warrantyForm.start_date} onChange={(event) => setWarrantyForm({ ...warrantyForm, start_date: event.target.value })} /></label>
              <label>{t('handover.endDate')}<input className="input" type="date" min={warrantyForm.start_date || undefined} required value={warrantyForm.end_date} onChange={(event) => setWarrantyForm({ ...warrantyForm, end_date: event.target.value })} /></label>
            </div>
            <label>{t('handover.notes')}<input className="input" value={warrantyForm.notes} onChange={(event) => setWarrantyForm({ ...warrantyForm, notes: event.target.value })} /></label>
            <DocumentUpload multiple={false} label={t('handover.warrantyDocument')} onUploaded={(file) => file && uploadedWarrantyDocument(file)} />
            {warrantyDocumentId && <p role="status">{t('handover.documentAttached')}</p>}{uploadError && <p role="alert" className="alert alert-danger">{uploadError}</p>}
            <div><button className="btn btn-primary" type="submit">{t('common.save')}</button> <button className="btn" type="button" onClick={() => { setShowWarrantyForm(false); setWarrantyDocumentId(null); }}>{t('common.cancel')}</button></div>
          </form>}
          {warranties.length === 0 ? <EmptyState icon={FileText} text={t('handover.noWarranties')} /> : <div className="table-container"><table className="table"><thead><tr><th>{t('handover.warrantyNumber')}</th><th>{t('handover.warrantyTitle')}</th><th>{t('handover.asset')}</th><th>{t('handover.warrantyIssuer')}</th><th>{t('handover.startDate')}</th><th>{t('handover.endDate')}</th><th>{t('handover.status')}</th><th>{t('common.actions')}</th></tr></thead><tbody>
            {warranties.map((warranty) => <tr key={warranty.id}><td>{warranty.warranty_number}</td><td>{warranty.title}{warranty.project_document_title && <div><button className="btn" onClick={() => openProtectedFile(warranty.project_document_url).catch((error) => alert(error.message))}>{warranty.project_document_title}</button></div>}</td><td>{warranty.asset_code ? `${warranty.asset_code} · ${warranty.asset_name}` : '-'}</td><td>{warranty.issuer}</td><td>{fmtDate(warranty.start_date)}</td><td>{fmtDate(warranty.end_date)}</td><td>{warrantyStatusLabel(warranty.effective_status || warranty.status)}</td><td>{warranty.status !== 'void' && <button className="btn" onClick={() => updateWarrantyStatus(warranty, 'void')}>{t('handover.voidWarranty')}</button>}{warranty.status === 'void' && <button className="btn" onClick={() => updateWarrantyStatus(warranty, 'active')}>{t('handover.reactivateWarranty')}</button>}</td></tr>)}
          </tbody></table></div>}
        </>
      )}
      {showAssetForm && <form className="card" onSubmit={submitAsset} style={{ display: 'grid', gap: 10, maxWidth: 620, marginTop: 16 }}>
        <h3>{t('handover.newAsset')}</h3>
        <label>{t('handover.assetCode')}<input className="input" required value={assetForm.asset_code} onChange={(event) => setAssetForm({ ...assetForm, asset_code: event.target.value })} /></label>
        <label>{t('handover.assetName')}<input className="input" required value={assetForm.name} onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })} /></label>
        <label>{t('handover.model')}<input className="input" value={assetForm.model} onChange={(event) => setAssetForm({ ...assetForm, model: event.target.value })} /></label>
        <label>{t('handover.serialNumber')}<input className="input" value={assetForm.serial_no} onChange={(event) => setAssetForm({ ...assetForm, serial_no: event.target.value })} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <label>{t('handover.commissioningDate')}<input className="input" type="date" value={assetForm.commissioning_date} onChange={(event) => setAssetForm({ ...assetForm, commissioning_date: event.target.value })} /></label>
          <label>{t('handover.startDate')}<input className="input" type="date" value={assetForm.warranty_start} onChange={(event) => setAssetForm({ ...assetForm, warranty_start: event.target.value })} /></label>
          <label>{t('handover.endDate')}<input className="input" type="date" value={assetForm.warranty_end} onChange={(event) => setAssetForm({ ...assetForm, warranty_end: event.target.value })} /></label>
        </div>
        <div><button className="btn btn-primary" type="submit">{t('common.save')}</button> <button className="btn" type="button" onClick={() => setShowAssetForm(false)}>{t('common.cancel')}</button></div>
      </form>}
      {uploadTarget && <div className="card" role="dialog" aria-label={t('handover.uploadEvidence')} style={{ marginTop: 16, maxWidth: 620 }}>
        <h3>{uploadTarget.title}</h3><DocumentUpload multiple={false} label={t('handover.uploadEvidence')} onUploaded={(file) => file && uploadedPackageDocument(uploadTarget, file)} />
        {uploadError && <p role="alert" className="alert alert-danger">{uploadError}</p>}
        <button className="btn" onClick={() => setUploadTarget(null)}>{t('common.cancel')}</button>
      </div>}
      {assetDocumentAsset && <div className="card" role="dialog" aria-label={t('handover.assetDocuments')} style={{ marginTop: 16, maxWidth: 720 }}>
        <h3>{assetDocumentAsset.asset_code} · {t('handover.assetDocuments')}</h3><DocumentUpload multiple={false} label={t('handover.uploadAssetDocument')} onUploaded={(file) => file && uploadedAssetDocument(assetDocumentAsset, file)} />
        {assetDocumentError && <p role="alert" className="alert alert-danger">{assetDocumentError}</p>}
        {assetDocuments.map((doc) => <div key={doc.id}><button className="btn" onClick={() => openProtectedFile(doc.file_url).catch((error) => alert(error.message))}>{doc.title}</button></div>)}
        <button className="btn" onClick={() => setAssetDocumentAsset(null)}>{t('common.cancel')}</button>
      </div>}
      <TextEntryDialog open={showClaimForm} title={t('common.dialogs.handoverClaimTitle')} label={t('common.dialogs.handoverClaimLabel')} onSubmit={createClaim} onCancel={() => setShowClaimForm(false)} />
      <div className="card" style={{ padding: 12, marginTop: 20 }}>
        <h4 style={{ fontSize: 13, marginBottom: 8 }}>{locale === 'ar' ? 'المستندات' : 'Documents'}</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => downloadPdf(`/api/handover/checklist/${id}/pdf`, 'checklist.pdf')}>Checklist PDF</button>
          <button className="btn" onClick={() => downloadPdf(`/api/handover/assets/${id}/pdf`, 'assets.pdf')}>Asset register PDF</button>
          <button className="btn" onClick={() => downloadPdf(`/api/handover/warranty-register/${id}/pdf`, 'warranty.pdf')}>Warranty register PDF</button>
          <button className="btn" onClick={() => downloadPdf(`/api/handover/certificate/${id}/pdf`, 'certificate.pdf')}>Handover certificate</button>
        </div>
      </div>
    </div>
  );
}
