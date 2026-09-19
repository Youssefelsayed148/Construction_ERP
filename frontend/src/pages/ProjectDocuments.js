import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Plus, Search, X, FileText, FolderOpen, MessageSquare, PackageCheck, History, CheckCircle, XCircle, Upload, Download } from 'lucide-react';
import DocumentUpload from '../components/DocumentUpload';
import { openProtectedFile } from '../components/ProtectedMedia';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = `${API_BASE_URL}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

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
    { key: 'library', icon: FolderOpen, label: locale === 'ar' ? 'مكتبة المستندات' : 'Document Library' },
    { key: 'rfis', icon: MessageSquare, label: locale === 'ar' ? 'طلبات المعلومات' : 'RFIs' },
    { key: 'submittals', icon: PackageCheck, label: locale === 'ar' ? 'الاعتمادات' : 'Submittals' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1>{locale === 'ar' ? 'التحكم في المستندات' : 'Document Control'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'المستندات والإصدارات وطلبات المعلومات والاعتمادات' : 'Documents, versions, RFIs & submittals'}
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
    </div>
  );
}

// ============ DOCUMENT LIBRARY ============

function LibraryTab({ projectId, locale, t }) {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [versionDoc, setVersionDoc] = useState(null);
  const [historyDoc, setHistoryDoc] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (categoryFilter) params.append('category_id', categoryFilter);
      if (searchQuery) params.append('search', searchQuery);
      const res = await fetchApi(`${API_URL}/docs/documents?${params}`);
      if (res.success) setDocuments(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
            placeholder={locale === 'ar' ? 'بحث...' : 'Search...'} />
          {searchQuery && <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}><X size={14} /></button>}
        </div>
        <select className="form-select" style={{ maxWidth: '200px' }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">{locale === 'ar' ? 'كل الفئات' : 'All Categories'}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => setShowUpload(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'رفع مستند' : 'Upload Document'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : documents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <FolderOpen size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد مستندات.' : 'No documents.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'العنوان' : 'Title'}</th>
                <th>{locale === 'ar' ? 'الفئة' : 'Category'}</th>
                <th>{locale === 'ar' ? 'النوع' : 'Type'}</th>
                <th>{locale === 'ar' ? 'الإصدار' : 'Ver.'}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'التحديث' : 'Updated'}</th>
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
                  </td>
                  <td style={{ fontSize: '13px' }}>{doc.category_name || '-'}</td>
                  <td style={{ fontSize: '13px' }}>{DOC_TYPE_LABELS[locale]?.[doc.document_type] || doc.document_type}</td>
                  <td style={{ fontFamily: 'monospace' }}>v{doc.version}</td>
                  <td><span className={`badge ${DOC_STATUS_BADGE[doc.status]}`}>{DOC_STATUS_LABELS[locale]?.[doc.status] || doc.status}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(doc.updated_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {(doc.status === 'draft' || doc.status === 'review') && (
                        <>
                          <button className="btn btn-success" style={{ padding: '6px 10px' }} title={locale === 'ar' ? 'اعتماد' : 'Approve'} onClick={() => act(doc.id, 'approve')}>
                            <CheckCircle size={14} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '6px 10px' }} title={locale === 'ar' ? 'رفض' : 'Reject'} onClick={() => act(doc.id, 'reject')}>
                            <XCircle size={14} />
                          </button>
                        </>
                      )}
                      <button className="btn" style={{ padding: '6px 10px' }} title={locale === 'ar' ? 'إصدار جديد' : 'New version'} onClick={() => setVersionDoc(doc)}>
                        <Upload size={14} />
                      </button>
                      <button className="btn" style={{ padding: '6px 10px' }} title={locale === 'ar' ? 'سجل الإصدارات' : 'Version history'} onClick={() => setHistoryDoc(doc)}>
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
      {historyDoc && <VersionHistoryModal doc={historyDoc} locale={locale} onClose={() => setHistoryDoc(null)} />}
    </div>
  );
}

function UploadDocModal({ projectId, categories, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({ title: '', description: '', document_type: 'drawing', category_id: '', tags: '' });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError(locale === 'ar' ? 'اختر ملفًا أولاً' : 'Choose a file first'); return; }
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
          <h3 className="modal-title">{locale === 'ar' ? 'رفع مستند' : 'Upload Document'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'العنوان' : 'Title'} *</label>
                <input className="form-input" value={form.title} onChange={e => handleChange('title', e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الفئة' : 'Category'}</label>
                  <select className="form-select" value={form.category_id} onChange={e => handleChange('category_id', e.target.value)}>
                    <option value="">-</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'النوع' : 'Type'}</label>
                  <select className="form-select" value={form.document_type} onChange={e => handleChange('document_type', e.target.value)}>
                    {['drawing', 'contract', 'report', 'photo', 'other'].map(dt => <option key={dt} value={dt}>{DOC_TYPE_LABELS[locale]?.[dt] || dt}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'وسوم (مفصولة بفاصلة)' : 'Tags (comma-separated)'}</label>
                <input className="form-input" value={form.tags} onChange={e => handleChange('tags', e.target.value)} placeholder="structural, rev-b" />
              </div>
              <DocumentUpload locale={locale} multiple={false}
                label={locale === 'ar' ? 'الملف' : 'File'}
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
    if (!file) { setError(locale === 'ar' ? 'اختر ملفًا أولاً' : 'Choose a file first'); return; }
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
          <h3 className="modal-title">{locale === 'ar' ? `إصدار جديد — ${doc.title}` : `New Version — ${doc.title}`}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              {locale === 'ar' ? `الإصدار الحالي: v${doc.version} — سيصبح v${doc.version + 1}` : `Current version: v${doc.version} — will become v${doc.version + 1}`}
            </p>
            <div className="form-group">
              <label className="form-label">{locale === 'ar' ? 'وصف التغيير' : 'Change Description'}</label>
              <textarea className="form-textarea" value={changeDescription} onChange={e => setChangeDescription(e.target.value)} />
            </div>
            <DocumentUpload locale={locale} multiple={false}
              label={locale === 'ar' ? 'الملف الجديد' : 'New File'}
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

function VersionHistoryModal({ doc, locale, onClose }) {
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
          <h3 className="modal-title">{locale === 'ar' ? `سجل الإصدارات — ${doc.title}` : `Version History — ${doc.title}`}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><span className="spinner" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {versions.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                  <span className="badge badge-info" style={{ fontFamily: 'monospace' }}>v{v.version_no}</span>
                  <div style={{ flex: 1 }}>
                    <div>{v.change_description || '-'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                      {v.uploaded_by_name || ''} — {formatDate(v.created_at)}
                    </div>
                  </div>
                  <a className="btn" style={{ padding: '6px 10px' }} href="#open-file" onClick={e => { e.preventDefault(); openProtectedFile(v.file_url).catch(error => window.alert(error.message)); }} title={locale === 'ar' ? 'تنزيل' : 'Download'}>
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
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [respondTo, setRespondTo] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/docs/rfis?project_id=${projectId}`);
      if (res.success) setRfis(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
          {locale === 'ar' ? 'طلب معلومات جديد' : 'Raise RFI'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rfis.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <MessageSquare size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد طلبات معلومات.' : 'No RFIs.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{locale === 'ar' ? 'الموضوع' : 'Subject'}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'الاستحقاق' : 'Due'}</th>
                <th>{locale === 'ar' ? 'رفعه' : 'Raised By'}</th>
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
                    {r.answer && <div style={{ fontSize: '12px', color: 'var(--color-success)', marginTop: '2px' }}>↳ {r.answer}</div>}
                  </td>
                  <td><span className={`badge ${RFI_STATUS_BADGE[r.status]}`}>{RFI_STATUS_LABELS[locale]?.[r.status] || r.status}</span></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                    {formatDate(r.due_date)}
                    {r.is_overdue && <span className="badge badge-danger" style={{ marginLeft: '6px' }}>{locale === 'ar' ? 'متأخر' : 'Overdue'}</span>}
                  </td>
                  <td style={{ fontSize: '13px' }}>{r.raised_by_name || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {r.status === 'open' && (
                        <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setRespondTo(r)}>
                          {locale === 'ar' ? 'إجابة' : 'Answer'}
                        </button>
                      )}
                      {r.status === 'answered' && (
                        <button className="btn" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => closeRfi(r)}>
                          {locale === 'ar' ? 'إغلاق' : 'Close'}
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
    </div>
  );
}

function RfiModal({ projectId, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({ subject: '', question: '', category: '', priority: 'normal', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { ...form, project_id: Number(projectId) };
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
          <h3 className="modal-title">{locale === 'ar' ? 'طلب معلومات جديد' : 'Raise RFI'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الموضوع' : 'Subject'} *</label>
                <input className="form-input" value={form.subject} onChange={e => handleChange('subject', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'السؤال' : 'Question'}</label>
                <textarea className="form-textarea" value={form.question} onChange={e => handleChange('question', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الفئة' : 'Category'}</label>
                  <input className="form-input" value={form.category} onChange={e => handleChange('category', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الأولوية' : 'Priority'}</label>
                  <select className="form-select" value={form.priority} onChange={e => handleChange('priority', e.target.value)}>
                    {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}</label>
                  <input className="form-input" type="date" value={form.due_date} onChange={e => handleChange('due_date', e.target.value)} />
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
              <label className="form-label">{locale === 'ar' ? 'الإجابة' : 'Answer'} *</label>
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
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/docs/submittals?project_id=${projectId}`);
      if (res.success) setSubmittals(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const respond = async (sub, status) => {
    let response;
    if (status === 'rejected' || status === 'revised') {
      response = prompt(locale === 'ar' ? 'سبب / ملاحظات:' : 'Reason / notes:');
      if (response === null) return;
    }
    try {
      await fetchApi(`${API_URL}/docs/submittals/${sub.id}/respond`, {
        method: 'POST', body: JSON.stringify({ status, ...(response ? { response } : {}) }),
      });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'اعتماد جديد' : 'New Submittal'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : submittals.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <PackageCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد اعتمادات.' : 'No submittals.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{locale === 'ar' ? 'العنوان' : 'Title'}</th>
                <th>{locale === 'ar' ? 'النوع' : 'Type'}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'مقدم إلى' : 'Submitted To'}</th>
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
                            {locale === 'ar' ? 'مراجعة' : 'Review'}
                          </button>
                        )}
                        <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => respond(s, 'approved')}>
                          {locale === 'ar' ? 'اعتماد' : 'Approve'}
                        </button>
                        <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => respond(s, 'rejected')}>
                          {locale === 'ar' ? 'رفض' : 'Reject'}
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
          <h3 className="modal-title">{locale === 'ar' ? 'اعتماد جديد' : 'New Submittal'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'العنوان' : 'Title'} *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'النوع' : 'Type'}</label>
                  <select className="form-select" value={form.submittal_type} onChange={e => setForm(f => ({ ...f, submittal_type: e.target.value }))}>
                    {['material', 'shop_drawing', 'sample', 'method'].map(st => <option key={st} value={st}>{SUBMITTAL_TYPE_LABELS[locale]?.[st] || st}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'مقدم إلى' : 'Submitted To'}</label>
                  <input className="form-input" value={form.submitted_to} onChange={e => setForm(f => ({ ...f, submitted_to: e.target.value }))}
                    placeholder={locale === 'ar' ? 'الاستشاري' : 'Consultant'} />
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
