import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { Search, Plus, Edit, Trash2, Shield, CheckCircle, XCircle, X } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const STATUS_TABS = ['all', 'pending', 'verified', 'rejected'];

const STATUS_LABELS = {
  en: { all: 'All', pending: 'Pending', verified: 'Verified', rejected: 'Rejected' },
  ar: { all: 'الكل', pending: 'معلق', verified: 'معتمد', rejected: 'مرفوض' }
};

const DOC_TYPE_LABELS = {
  en: {
    contract: 'Contract', permit: 'Permit', insurance: 'Insurance',
    report: 'Report', license: 'License', compliance: 'Compliance', other: 'Other'
  },
  ar: {
    contract: 'عقد', permit: 'تصريح', insurance: 'تأمين',
    report: 'تقرير', license: 'رخصة', compliance: 'امتثال', other: 'أخرى'
  }
};

const docTypes = ['contract', 'permit', 'insurance', 'report', 'license', 'compliance', 'other'];

function Legal() {
  const { t, locale } = useLocale();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/legal?${params}`);
      if (res.success) setDocuments(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter, searchQuery]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const handleStatusUpdate = async (id, status) => {
    try {
      await fetchApi(`${API_URL}/legal/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      loadDocuments();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id) => {
    if (locale === 'ar') {
      const name = prompt('اكتب عنوان المستند للحذف:');
      const doc = documents.find(i => i.id === id);
      if (name !== doc?.title) return;
    } else {
      const name = prompt('Type document title to confirm delete:');
      const doc = documents.find(i => i.id === id);
      if (name !== doc?.title) return;
    }
    try {
      await fetchApi(`${API_URL}/legal/${id}`, { method: 'DELETE' });
      loadDocuments();
    } catch (e) { alert(e.message); }
  };

  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;
  const docTypeLabel = (t) => DOC_TYPE_LABELS[locale]?.[t] || t;
  const statusBadgeClass = (s) => {
    if (s === 'verified') return 'badge-success';
    if (s === 'rejected') return 'badge-danger';
    return 'badge-warning';
  };
  const statusText = (s) => {
    if (s === 'verified') return locale === 'ar' ? 'معتمد' : 'Verified';
    if (s === 'rejected') return locale === 'ar' ? 'مرفوض' : 'Rejected';
    return locale === 'ar' ? 'معلق' : 'Pending';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{locale === 'ar' ? 'المستندات القانونية' : 'Legal Documents'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'إدارة المستندات القانونية والتصاريح' : 'Legal & Compliance Document Management'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingDocument(null); setShowModal(true); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة مستند' : 'Add Document'}
        </button>
      </div>

      <div className="level-line" />

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {STATUS_TABS.map(s => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px' }}
            onClick={() => setStatusFilter(s)}
          >
            {statusLabel(s)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', maxWidth: '400px' }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن مستندات...' : 'Search documents...'}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : documents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Shield size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد مستندات. أضف أول مستند.' : 'No documents found. Add your first document.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'العنوان' : 'Title'}</th>
                <th>{t('common.category')}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'مقدم من' : 'Submitted By'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id}>
                  <td style={{ fontWeight: 500 }}>{doc.title}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    {docTypeLabel(doc.document_type)}
                  </td>
                  <td>
                    <span className={`badge ${statusBadgeClass(doc.status)}`}>
                      {statusText(doc.status)}
                    </span>
                  </td>
                  <td>{doc.submitted_by || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(doc.date || doc.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {doc.status !== 'verified' && (
                        <button
                          className="btn btn-success"
                          style={{ padding: '6px 10px' }}
                          onClick={() => handleStatusUpdate(doc.id, 'verified')}
                          title={locale === 'ar' ? 'اعتماد' : 'Verify'}
                        >
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {doc.status !== 'rejected' && (
                        <button
                          className="btn btn-danger"
                          style={{ padding: '6px 10px' }}
                          onClick={() => handleStatusUpdate(doc.id, 'rejected')}
                          title={locale === 'ar' ? 'رفض' : 'Reject'}
                        >
                          <XCircle size={14} />
                        </button>
                      )}
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingDocument(doc); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(doc.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <LegalModal
        document={editingDocument}
        locale={locale}
        t={t}
        onClose={() => setShowModal(false)}
        onSave={loadDocuments}
      />}
    </div>
  );
}

function LegalModal({ document, locale, t, onClose, onSave }) {
  const isEdit = !!document;
  const [form, setForm] = useState({
    title: document?.title || '',
    document_type: document?.document_type || 'contract',
    description: document?.description || '',
    submitted_by: document?.submitted_by || '',
    status: document?.status || 'pending',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/legal/${document.id}` : `${API_URL}/legal`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetchApi(url, { method, body: JSON.stringify(form) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit
              ? (locale === 'ar' ? 'تعديل المستند' : 'Edit Document')
              : (locale === 'ar' ? 'إضافة مستند جديد' : 'Add New Document')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'العنوان' : 'Title'} *</label>
                <input className="form-input" value={form.title} onChange={e => handleChange('title', e.target.value)} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'نوع المستند' : 'Document Type'}</label>
                  <select className="form-select" value={form.document_type} onChange={e => handleChange('document_type', e.target.value)}>
                    {docTypes.map(t => <option key={t} value={t}>{DOC_TYPE_LABELS[locale]?.[t] || t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'مقدم من' : 'Submitted By'}</label>
                  <input className="form-input" value={form.submitted_by} onChange={e => handleChange('submitted_by', e.target.value)} />
                </div>
              </div>

              {isEdit && (
                <div className="form-group">
                  <label className="form-label">{t('common.status')}</label>
                  <select className="form-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                    <option value="pending">{locale === 'ar' ? 'معلق' : 'Pending'}</option>
                    <option value="verified">{locale === 'ar' ? 'معتمد' : 'Verified'}</option>
                    <option value="rejected">{locale === 'ar' ? 'مرفوض' : 'Rejected'}</option>
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} />
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

export default Legal;
