import { formatDate as sharedDate } from '../utils/formatters';
import { translateEnum } from '../i18n/enums';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import TextEntryDialog from '../components/common/TextEntryDialog';
import LoadMore from '../components/common/LoadMore';
import { ArrowLeft, Plus, Search, X, FileText, FolderOpen, MessageSquare, PackageCheck, History, CheckCircle, XCircle, Upload, Download, AlertTriangle } from 'lucide-react';
import { RegisterTab, TransmittalsTab, CorrespondenceTab, DocSearchTab } from './DocControlExtended';
import DocumentUpload from '../components/DocumentUpload';
import { openProtectedFile } from '../components/ProtectedMedia';
import WorkPackageSelect from '../components/project/WorkPackageSelect';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
});

const formatDate = sharedDate;

const DOC_STATUS_LABELS = {
  en: { draft: 'Draft', review: 'In Review', approved: 'Approved', rejected: 'Rejected', archived: 'Archived' },
  ar: { draft: 'مسودة', review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض', archived: 'مؤرشف' }
};
const DOC_STATUS_BADGE = { draft: 'badge-info', review: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger', archived: 'badge-info' };

const DOC_TYPE_LABELS = {
  en: { drawing: 'Drawing', contract: 'Contract', report: 'Report', photo: 'Photo', rfi: 'RFI', other: 'Other' },
  ar: { drawing: 'رسم هندسي', contract: 'عقد', report: 'تقرير', photo: 'صورة', rfi: 'طلب معلومات', other: 'أخرى' }
};

const RFI_STATUS_LABELS = {
  en: { open: 'Open', answered: 'Answered', closed: 'Closed' },
  ar: { open: 'مفتوح', answered: 'تمت الإجابة', closed: 'مغلق' }
};
const RFI_STATUS_BADGE = { open: 'badge-warning', answered: 'badge-success', closed: 'badge-info' };

const SUBMITTAL_TYPE_LABELS = {
  en: { material: 'Material', shop_drawing: 'Shop Drawing', sample: 'Sample', method: 'Method Statement' },
  ar: { material: 'مواد', shop_drawing: 'رسم تنفيذي', sample: 'عينة', method: 'بيان طريقة' }
};
const SUBMITTAL_STATUS_LABELS = {
  en: { submitted: 'Submitted', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected', revised: 'Revised' },
  ar: { submitted: 'مقدم', under_review: 'قيد المراجعة', approved: 'معتمد', rejected: 'مرفوض', revised: 'معدل' }
};
const SUBMITTAL_STATUS_BADGE = { submitted: 'badge-info', under_review: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger', revised: 'badge-warning' };

function ProjectDocuments() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState('library');

  const TABS = [
    { key: 'library', icon: FolderOpen, label: t('documentControl.system.documentLibrary') },
    { key: 'rfis', icon: MessageSquare, label: t('documentControl.system.rfis') },
    { key: 'submittals', icon: PackageCheck, label: t('documentControl.system.submittals') },
    { key: 'register', icon: FileText, label: t('documentControl.system.controlledRegisters') },
    { key: 'transmittals', icon: Upload, label: t('documentControl.system.transmittals') },
    { key: 'correspondence', icon: MessageSquare, label: t('documentControl.correspondence') },
    { key: 'search', icon: Search, label: t('documentControl.system.crossSearch') },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1>{t('documentControl.system.documentControl')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('documentControl.system.documentsVersionsRfisSubmittals')}
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

      {tab === 'library' && <LibraryTab projectId={id} locale={locale} t={t} />}
      {tab === 'rfis' && <RfisTab projectId={id} locale={locale} t={t} />}
      {tab === 'submittals' && <SubmittalsTab projectId={id} locale={locale} t={t} />}
      {tab === 'register' && <RegisterTab projectId={id} locale={locale} t={t} />}
      {tab === 'transmittals' && <TransmittalsTab projectId={id} locale={locale} t={t} />}
      {tab === 'correspondence' && <CorrespondenceTab projectId={id} locale={locale} t={t} />}
      {tab === 'search' && <DocSearchTab projectId={id} locale={locale} t={t} />}
    </div>
  );
}

// ============ DOCUMENT LIBRARY ============

function LibraryTab({ projectId, locale, t }) {
  const [documents, setDocuments] = useState([]);
  const documentsLength = useRef(0); documentsLength.current = documents.length;
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [versionDoc, setVersionDoc] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId });
      params.set('limit', '200'); params.set('offset', String(append ? documentsLength.current : 0));
      if (categoryFilter) params.append('category_id', categoryFilter);
      if (searchQuery) params.append('search', searchQuery);
      const res = await fetchApi(`${API_URL}/docs/documents?${params}`);
      if (res.success) { setDocuments(current => append ? [...current, ...(res.data || [])] : (res.data || [])); setTotalCount(res.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId, categoryFilter, searchQuery]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/docs/categories`);
      if (res.success) setCategories(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadCategories(); }, [loadCategories]);

  const act = async (docId, action) => {
    try {
      await fetchApi(`${API_URL}/docs/documents/${docId}/${action}`, { method: 'POST' });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', minWidth: '240px' }}>
          <Search size={14} style={{ color: 'var(--color-text-secondary)' }} />
          <input className="form-input" style={{ background: 'transparent', border: 'none', padding: 0, flex: 1 }}
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder={t('documentControl.system.search2')} />
          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><X size={14} /></button>}
        </div>
        <select className="form-select" style={{ maxWidth: '200px' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">{t('documentControl.system.allCategories')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          <Plus size={16} />
          {t('documentControl.system.uploadDocument')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : documents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <FolderOpen size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('documentControl.system.noDocuments')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('documentControl.register.title')}</th>
                <th>{t('documentControl.system.category')}</th>
                <th>{t('documentControl.register.type')}</th>
                <th>{t('documentControl.system.ver')}</th>
                <th>{t('common.status')}</th>
                <th>{t('documentControl.system.updated')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id}>
                  <td style={{ fontWeight: 500 }}>
                    <a href="#open-file" onClick={e => { e.preventDefault(); openProtectedFile(doc.file_url).catch(error => window.alert(error.message)); }} style={{ color: 'var(--color-accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={14} />
                      {doc.title}
                    </a>
                    {doc.description && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{doc.description}</div>}
                    {/* Phase 21: prominent superseded-revision warning */}
                    {doc.doc_status === 'superseded' && (
                      <div className="badge badge-danger" style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={12} />
                        {t('documentControl.system.supersededDoNotUseForConstruction')}
                        {doc.superseded_by_doc_id ? ` → #${doc.superseded_by_doc_id}` : ''}
                      </div>
                    )}
                    {doc.doc_number && (
                      <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                        {doc.doc_number}{doc.revision_code ? ` · ${doc.revision_code}` : ''}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '13px' }}>{doc.category_name || '-'}</td>
                  <td style={{ fontSize: '13px' }}>{DOC_TYPE_LABELS[locale]?.[doc.document_type] || doc.document_type}</td>
                  <td style={{ fontFamily: 'monospace' }}>{t('documentControl.system.v')}{doc.version}</td>
                  <td><span className={`badge ${DOC_STATUS_BADGE[doc.status]}`}>{DOC_STATUS_LABELS[locale]?.[doc.status] || doc.status}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(doc.updated_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(doc.status === 'draft' || doc.status === 'review') && (
                        <>
                          <button className="btn btn-success" style={{ padding: '6px 10px' }} title={t('documentControl.system.approve')} onClick={() => act(doc.id, 'approve')}>
                            <CheckCircle size={14} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '6px 10px' }} title={t('documentControl.system.reject')} onClick={() => act(doc.id, 'reject')}>
                            <XCircle size={14} />
                          </button>
                        </>
                      )}
                      <button className="btn" style={{ padding: '6px 10px' }} title={t('documentControl.system.newVersion')} onClick={() => setVersionDoc(doc)}>
                        <Upload size={14} />
                      </button>
                      <button className="btn" style={{ padding: '6px 10px' }} title={t('documentControl.system.versionHistory')} onClick={() => setHistoryDoc(doc)}>
                        <History size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && <UploadDocModal projectId={projectId} categories={categories} locale={locale} t={t} onClose={() => setShowUpload(false)} onSave={load} />}
      {versionDoc && <NewVersionModal doc={versionDoc} locale={locale} t={t} onClose={() => setVersionDoc(null)} onSave={load} />}
      {historyDoc && <VersionHistoryModal doc={historyDoc} locale={locale} t={t} onClose={() => setHistoryDoc(null)} />}
      <LoadMore loadedCount={documents.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

function UploadDocModal({ projectId, categories, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({
    title: '', description: '', document_type: 'drawing', doc_type: 'drawing', discipline: 'general',
    category_id: '', tags: '', issue_date: '', review_due_date: '', confidentiality: 'internal',
    portal_visibility: 'internal', project_location_id: '', package: '', originator_organization_id: '', recipient_organization_id: '',
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError(t('documentControl.system.chooseAFileFirst')); return; }
    setSaving(true); setError('');
    try {
      const body = {
        project_id: Number(projectId),
        category_id: form.category_id ? Number(form.category_id) : null,
        title: form.title,
        description: form.description,
        document_type: form.document_type,
        file_url: file.file_url,
        file_type: file.file_type,
        file_size_bytes: file.file_size_bytes,
        tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
        doc_type: form.doc_type,
        discipline: form.discipline,
        issue_date: form.issue_date || null,
        review_due_date: form.review_due_date || null,
        confidentiality: form.confidentiality,
        portal_visibility: form.portal_visibility,
        project_location_id: form.project_location_id ? Number(form.project_location_id) : null,
        package: form.package || null,
        originator_organization_id: form.originator_organization_id ? Number(form.originator_organization_id) : null,
        recipient_organization_id: form.recipient_organization_id ? Number(form.recipient_organization_id) : null,
      };
      const res = await fetchApi(`${API_URL}/docs/documents`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('documentControl.system.uploadDocument')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('documentControl.register.title')} *</label>
                <input className="form-input" value={form.title} onChange={e => handleChange('title', e.target.value)} required />
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('documentControl.system.category')}</label>
                  <select className="form-select" value={form.category_id} onChange={e => handleChange('category_id', e.target.value)}>
                    <option value="">-</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('documentControl.register.type')}</label>
                  <select className="form-select" value={form.document_type} onChange={e => handleChange('document_type', e.target.value)}>
                    {['drawing', 'contract', 'report', 'photo', 'other'].map(dt => <option key={dt} value={dt}>{DOC_TYPE_LABELS[locale]?.[dt] || dt}</option>)}
                  </select>
                </div>
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <label className="form-group">{t('documentControl.register.controlledType')}
                  <select className="form-select" value={form.doc_type} onChange={e => handleChange('doc_type', e.target.value)}>
                    {['drawing', 'specification', 'contract', 'report', 'method_statement', 'as_built', 'o_m', 'other'].map(type => <option key={type} value={type}>{t(`documentControl.register.types.${type}`)}</option>)}
                  </select>
                </label>
                <label className="form-group">{t('documentControl.register.discipline')}
                  <select className="form-select" value={form.discipline} onChange={e => handleChange('discipline', e.target.value)}>
                    {['architectural', 'structural', 'civil', 'mechanical', 'electrical', 'plumbing', 'hvac', 'fire', 'general'].map(discipline => <option key={discipline} value={discipline}>{t(`documentControl.register.disciplines.${discipline}`)}</option>)}
                  </select>
                </label>
                <label className="form-group">{t('documentControl.register.issueDate')}<input className="form-input" type="date" value={form.issue_date} onChange={e => handleChange('issue_date', e.target.value)} /></label>
                <label className="form-group">{t('documentControl.register.reviewDue')}<input className="form-input" type="date" value={form.review_due_date} onChange={e => handleChange('review_due_date', e.target.value)} /></label>
                <label className="form-group">{t('documentControl.register.confidentiality')}
                  <select className="form-select" value={form.confidentiality} onChange={e => handleChange('confidentiality', e.target.value)}>
                    {['public', 'internal', 'confidential', 'restricted'].map(level => <option key={level} value={level}>{t(`documentControl.register.confidentialityLevels.${level}`)}</option>)}
                  </select>
                </label>
                <label className="form-group">{t('documentControl.register.visibility')}
                  <select className="form-select" value={form.portal_visibility} onChange={e => handleChange('portal_visibility', e.target.value)}>
                    {['internal', 'client', 'consultant', 'subcontractor', 'all_external'].map(level => <option key={level} value={level}>{t(`documentControl.register.visibilityLevels.${level}`)}</option>)}
                  </select>
                </label>
                <label className="form-group">{t('documentControl.register.locationId')}<input className="form-input" type="number" min="1" value={form.project_location_id} onChange={e => handleChange('project_location_id', e.target.value)} /></label>
                <label className="form-group">{t('documentControl.register.package')}<input className="form-input" maxLength="150" value={form.package} onChange={e => handleChange('package', e.target.value)} /></label>
                <label className="form-group">{t('documentControl.register.originatorId')}<input className="form-input" type="number" min="1" value={form.originator_organization_id} onChange={e => handleChange('originator_organization_id', e.target.value)} /></label>
                <label className="form-group">{t('documentControl.register.recipientId')}<input className="form-input" type="number" min="1" value={form.recipient_organization_id} onChange={e => handleChange('recipient_organization_id', e.target.value)} /></label>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('documentControl.system.tagsCommaSeparated')}</label>
                <input className="form-input" value={form.tags} onChange={e => handleChange('tags', e.target.value)} placeholder={t('documentControl.system.structuralRevB')} />
              </div>
              <DocumentUpload locale={locale} multiple={false}
                label={t('documentControl.system.file')}
                onUploaded={f => setFile(f)} />
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

function NewVersionModal({ doc, locale, t, onClose, onSave }) {
  const [file, setFile] = useState(null);
  const [changeDescription, setChangeDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError(t('documentControl.system.chooseAFileFirst')); return; }
    setSaving(true); setError('');
    try {
      const res = await fetchApi(`${API_URL}/docs/documents/${doc.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          file_url: file.file_url, file_type: file.file_type,
          file_size_bytes: file.file_size_bytes, change_description: changeDescription,
        }),
      });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('documentControl.system.newVersion2', { title: doc.title })}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              {t('documentControl.system.currentVersionVWillBecomeV', { version: doc.version, value: doc.version + 1 })}
            </p>
            <div className="form-group">
              <label className="form-label">{t('documentControl.system.changeDescription')}</label>
              <textarea className="form-textarea" value={changeDescription} onChange={e => setChangeDescription(e.target.value)} />
            </div>
            <DocumentUpload locale={locale} multiple={false}
              label={t('documentControl.system.newFile')}
              onUploaded={f => setFile(f)} />
            {error && <div className="alert alert-danger">{error}</div>}
          </div>
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

function VersionHistoryModal({ doc, locale, t, onClose }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi(`${API_URL}/docs/documents/${doc.id}`)
      .then(res => { if (res.success) setVersions(res.data.versions || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [doc.id]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('documentControl.system.versionHistory2', { title: doc.title })}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><span className="spinner" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {versions.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                  <span className="badge badge-info" style={{ fontFamily: 'monospace' }}>{t('documentControl.system.v')}{v.version_no}</span>
                  <div style={{ flex: 1 }}>
                    <div>{v.change_description || '-'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      {v.uploaded_by_name || ''} — {formatDate(v.created_at)}
                    </div>
                  </div>
                  <a className="btn" style={{ padding: '6px 10px' }} href="#open-file" onClick={e => { e.preventDefault(); openProtectedFile(v.file_url).catch(error => window.alert(error.message)); }} title={t('documentControl.system.download')}>
                    <Download size={14} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ RFIs ============

function RfisTab({ projectId, locale, t }) {
  const [rfis, setRfis] = useState([]);
  const rfisLength = useRef(0); rfisLength.current = rfis.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [respondTo, setRespondTo] = useState(null);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rfisLength.current : 0) });
      const res = await fetchApi(`${API_URL}/docs/rfis?${params}`);
      if (res.success) { setRfis(current => append ? [...current, ...(res.data || [])] : (res.data || [])); setTotalCount(res.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const closeRfi = async (rfi) => {
    try {
      await fetchApi(`${API_URL}/docs/rfis/${rfi.id}/close`, { method: 'POST' });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t('documentControl.system.raiseRfi')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rfis.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <MessageSquare size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('documentControl.system.noRfis')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('documentControl.system.subject')}</th>
                <th>{t('common.status')}</th>
                <th>{t('documentControl.system.due')}</th>
                <th>{t('documentControl.system.raisedBy')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rfis.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{r.rfi_number}</td>
                  <td style={{ fontWeight: 500 }}>
                    {r.subject}
                    {r.question && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{r.question}</div>}
                    {(r.project_location_name || r.work_package_code || r.cost_impact != null || r.schedule_impact_days != null) && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                      {[r.project_location_name && `${t('documentControl.rfiImpacts.location')}: ${r.project_location_name}`,
                        r.work_package_code && `${t('documentControl.rfiImpacts.workPackage')}: ${r.work_package_code}`,
                        r.cost_impact != null && `${t('documentControl.rfiImpacts.cost')}: ${r.cost_impact}`,
                        r.schedule_impact_days != null && `${t('documentControl.rfiImpacts.schedule')}: ${r.schedule_impact_days}`].filter(Boolean).join(' · ')}
                    </div>}
                    {r.answer && <div style={{ fontSize: '12px', color: 'var(--color-success)', marginTop: '2px' }}>↳ {r.answer}</div>}
                  </td>
                  <td><span className={`badge ${RFI_STATUS_BADGE[r.status]}`}>{RFI_STATUS_LABELS[locale]?.[r.status] || r.status}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                    {formatDate(r.due_date)}
                    {r.is_overdue && <span className="badge badge-danger" style={{ marginLeft: '6px' }}>{t('documentControl.system.overdue')}</span>}
                  </td>
                  <td style={{ fontSize: '13px' }}>{r.raised_by_name || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {r.status === 'open' && (
                        <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setRespondTo(r)}>
                          {t('documentControl.system.answer')}
                        </button>
                      )}
                      {r.status === 'answered' && (
                        <button className="btn" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => closeRfi(r)}>
                          {t('documentControl.system.close')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <RfiModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={load} />}
      {respondTo && <RfiRespondModal rfi={respondTo} locale={locale} t={t} onClose={() => setRespondTo(null)} onSave={load} />}
      <LoadMore loadedCount={rfis.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

function RfiModal({ projectId, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({ subject: '', question: '', category: '', priority: 'normal', due_date: '', project_location_id: '', work_package_id: null, cost_impact: '', schedule_impact_days: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [locationOptions, setLocationOptions] = useState({ loading: true, failed: false, rows: [] });

  useEffect(() => {
    let cancelled = false;
    setLocationOptions({ loading: true, failed: false, rows: [] });
    fetchApi(`${API_URL}/locations/project/${projectId}`)
      .then((res) => { if (!cancelled) setLocationOptions({ loading: false, failed: false, rows: res.data || [] }); })
      .catch(() => { if (!cancelled) setLocationOptions({ loading: false, failed: true, rows: [] }); });
    return () => { cancelled = true; };
  }, [projectId]);

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = {
        ...form, project_id: Number(projectId),
        project_location_id: form.project_location_id ? Number(form.project_location_id) : null,
        cost_impact: form.cost_impact === '' ? null : Number(form.cost_impact),
        schedule_impact_days: form.schedule_impact_days === '' ? null : Number(form.schedule_impact_days),
      };
      if (!body.due_date) delete body.due_date;
      const res = await fetchApi(`${API_URL}/docs/rfis`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('documentControl.system.raiseRfi')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('documentControl.system.subject')} *</label>
                <input className="form-input" value={form.subject} onChange={e => handleChange('subject', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">{t('documentControl.system.question')}</label>
                <textarea className="form-textarea" value={form.question} onChange={e => handleChange('question', e.target.value)} />
              </div>
              <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('documentControl.system.category')}</label>
                  <input className="form-input" value={form.category} onChange={e => handleChange('category', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('documentControl.system.priority')}</label>
                  <select className="form-select" value={form.priority} onChange={e => handleChange('priority', e.target.value)}>
                    {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{translateEnum(t, 'priority', p)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('documentControl.system.dueDate')}</label>
                  <input className="form-input" type="date" value={form.due_date} onChange={e => handleChange('due_date', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('documentControl.rfiImpacts.location')}</label>
                <select className="form-select" value={form.project_location_id} disabled={locationOptions.loading || locationOptions.failed} onChange={e => handleChange('project_location_id', e.target.value)}>
                  <option value="">{t('documentControl.rfiImpacts.none')}</option>
                  {locationOptions.rows.map((location) => <option key={location.id} value={location.id}>{location.code ? `${location.code} · ` : ''}{location.name || location.name_en || location.name_ar}</option>)}
                </select>
                {locationOptions.loading && <small role="status">{t('documentControl.rfiImpacts.loading')}</small>}
                {locationOptions.failed && <small role="alert">{t('documentControl.rfiImpacts.locationsUnavailable')}</small>}
              </div>
              <div className="form-group">
                <label className="form-label">{t('documentControl.rfiImpacts.workPackage')}</label>
                <WorkPackageSelect projectId={projectId} value={form.work_package_id} onChange={(value) => handleChange('work_package_id', value)} className="form-select" />
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group"><label className="form-label">{t('documentControl.rfiImpacts.cost')}</label><input className="form-input" type="number" step="0.01" value={form.cost_impact} onChange={e => handleChange('cost_impact', e.target.value)} /></div>
                <div className="form-group"><label className="form-label">{t('documentControl.rfiImpacts.schedule')}</label><input className="form-input" type="number" step="1" value={form.schedule_impact_days} onChange={e => handleChange('schedule_impact_days', e.target.value)} /></div>
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

function RfiRespondModal({ rfi, locale, t, onClose, onSave }) {
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetchApi(`${API_URL}/docs/rfis/${rfi.id}/respond`, { method: 'POST', body: JSON.stringify({ answer }) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{rfi.rfi_number} — {rfi.subject}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {rfi.question && <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{rfi.question}</p>}
            <div className="form-group">
              <label className="form-label">{t('documentControl.system.answer2')} *</label>
              <textarea className="form-textarea" value={answer} onChange={e => setAnswer(e.target.value)} required />
            </div>
            {error && <div className="alert alert-danger">{error}</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving || !answer.trim()}>
            {saving ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ SUBMITTALS ============

function SubmittalsTab({ projectId, locale, t }) {
  const [submittals, setSubmittals] = useState([]);
  const submittalsLength = useRef(0); submittalsLength.current = submittals.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [responseTarget, setResponseTarget] = useState(null);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? submittalsLength.current : 0) });
      const res = await fetchApi(`${API_URL}/docs/submittals?${params}`);
      if (res.success) { setSubmittals(current => append ? [...current, ...(res.data || [])] : (res.data || [])); setTotalCount(res.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const respond = async (sub, status) => {
    if (status === 'rejected' || status === 'revised') {
      setResponseTarget({ sub, status });
      return;
    }
    await submitResponse(sub, status, '');
  };

  const submitResponse = async (sub, status, response) => {
    try {
      await fetchApi(`${API_URL}/docs/submittals/${sub.id}/respond`, {
        method: 'POST', body: JSON.stringify({ status, ...(response ? { response } : {}) }),
      });
      setResponseTarget(null);
      await load();
    } catch (e) { throw e; }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t('documentControl.system.newSubmittal')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : submittals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <PackageCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('documentControl.system.noSubmittals')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('documentControl.register.title')}</th>
                <th>{t('documentControl.register.type')}</th>
                <th>{t('common.status')}</th>
                <th>{t('documentControl.system.submittedTo')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {submittals.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{s.submittal_number}</td>
                  <td style={{ fontWeight: 500 }}>
                    {s.title}
                    {s.response && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>↳ {s.response}</div>}
                  </td>
                  <td style={{ fontSize: '13px' }}>{SUBMITTAL_TYPE_LABELS[locale]?.[s.submittal_type] || s.submittal_type}</td>
                  <td><span className={`badge ${SUBMITTAL_STATUS_BADGE[s.status]}`}>{SUBMITTAL_STATUS_LABELS[locale]?.[s.status] || s.status}</span></td>
                  <td style={{ fontSize: '13px' }}>{s.submitted_to || '-'}</td>
                  <td>
                    {(s.status === 'submitted' || s.status === 'under_review' || s.status === 'revised') && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {s.status === 'submitted' && (
                          <button className="btn" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => respond(s, 'under_review')}>
                            {t('documentControl.system.review')}
                          </button>
                        )}
                        <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => respond(s, 'approved')}>
                          {t('documentControl.system.approve')}
                        </button>
                        <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => respond(s, 'rejected')}>
                          {t('documentControl.system.reject')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <SubmittalModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={load} />}
      <TextEntryDialog open={Boolean(responseTarget)} title={t('common.dialogs.submittalResponseTitle')} label={t('common.dialogs.reasonNotesLabel')} required={false} onSubmit={(response) => submitResponse(responseTarget.sub, responseTarget.status, response)} onCancel={() => setResponseTarget(null)} />
      <LoadMore loadedCount={submittals.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

function SubmittalModal({ projectId, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', submittal_type: 'material', submitted_to: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetchApi(`${API_URL}/docs/submittals`, {
        method: 'POST', body: JSON.stringify({ ...form, project_id: Number(projectId) }),
      });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('documentControl.system.newSubmittal')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('documentControl.register.title')} *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('documentControl.register.type')}</label>
                  <select className="form-select" value={form.submittal_type} onChange={e => setForm(f => ({ ...f, submittal_type: e.target.value }))}>
                    {['material', 'shop_drawing', 'sample', 'method'].map(st => <option key={st} value={st}>{SUBMITTAL_TYPE_LABELS[locale]?.[st] || st}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('documentControl.system.submittedTo')}</label>
                  <input className="form-input" value={form.submitted_to} onChange={e => setForm(f => ({ ...f, submitted_to: e.target.value }))}
                    placeholder={t('documentControl.register.visibilityLevels.consultant')} />
                </div>
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

export default ProjectDocuments;
