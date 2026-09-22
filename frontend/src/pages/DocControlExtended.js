// Phase 21 — document control extended tabs: controlled registers,
// transmittals, correspondence, cross-record search.
// Rendered inside the ProjectDocuments page's tab strip; every tab renders an
// explicit empty state (the zero-records requirement), never a blank screen.

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Send, CheckCircle, FileText, Search, Download, AlertTriangle } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const downloadPdf = async (url, filename) => {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error('PDF failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
};

const DOC_TYPE_OPTIONS = ['drawing', 'specification', 'contract', 'report', 'method_statement', 'as_built', 'o_m'];
const DISCIPLINE_OPTIONS = ['architectural', 'structural', 'civil', 'mechanical', 'electrical', 'plumbing', 'hvac', 'fire', 'general'];

const TR_STATUS_BADGE = { draft: 'badge-info', sent: 'badge-warning', acknowledged: 'badge-success', closed: 'badge-info' };
const CORR_STATUS_BADGE = { draft: 'badge-info', sent: 'badge-warning', received: 'badge-info', responded: 'badge-success', closed: 'badge-info' };
const CORR_TYPE_LABEL = { letter: 'Letter', notice: 'Notice', instruction: 'Instruction', claim: 'Claim' };

// ============ CONTROLLED REGISTERS ============

export function RegisterTab({ projectId, locale, t }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ doc_type: '', discipline: '', current: 'true' });
  const [registering, setRegistering] = useState(null);
  const [docs, setDocs] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId });
      Object.entries(filter).forEach(([k, v]) => { if (v) params.append(k, v); });
      const r = await fetchApi(`${API_URL}/docs/registers?${params}`);
      if (r.success) setRows(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId, filter]);

  useEffect(() => { load(); }, [load]);

  const openRegister = async () => {
    try {
      const r = await fetchApi(`${API_URL}/docs/documents?project_id=${projectId}`);
      setDocs(r.data || []);
      setRegistering(true);
    } catch (e) { alert(e.message); }
  };

  const registerDoc = async (doc) => {
    try {
      await fetchApi(`${API_URL}/docs/documents/${doc.id}/register`, { method: 'POST', body: '{}' });
      setRegistering(false);
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select className="form-select" style={{ maxWidth: 200 }} value={filter.doc_type} onChange={e => setFilter({ ...filter, doc_type: e.target.value })}>
          <option value="">{locale === 'ar' ? 'كل الأنواع' : 'All types'}</option>
          {['drawing', 'specification', 'contract', 'report', 'method_statement', 'as_built', 'o_m'].map(tp => <option key={tp} value={tp}>{tp.replace('_', ' ')}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 200 }} value={filter.discipline} onChange={e => setFilter({ ...filter, discipline: e.target.value })}>
          <option value="">{locale === 'ar' ? 'كل التخصصات' : 'All disciplines'}</option>
          {['architectural', 'structural', 'civil', 'mechanical', 'electrical', 'plumbing', 'hvac', 'fire'].map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 200 }} value={filter.current} onChange={e => setFilter({ ...filter, current: e.target.value })}>
          <option value="true">{locale === 'ar' ? 'الإصدار الحالي' : 'Current revisions'}</option>
          <option value="">{locale === 'ar' ? 'كل الإصدارات' : 'All revisions'}</option>
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={openRegister}><Plus size={16} />{locale === 'ar' ? 'تسجيل مستند' : 'Register document'}</button>
      </div>
      {registering && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            {locale === 'ar' ? 'اختر مستنداً لتسجيله — رقم مستند بصيغة PROJECT-DISCIPLINE-TYPE-SEQ-REV' : 'Pick a document to register — number format PROJECT-DISCIPLINE-TYPE-SEQ-REV'}
          </p>
          {docs.filter(d => !d.doc_number).length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{locale === 'ar' ? 'كل المستندات مسجلة.' : 'All documents are already registered.'}</p>
          ) : docs.filter(d => !d.doc_number).map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-surface-raised)' }}>
              <span style={{ fontSize: 13 }}>{d.title} <span style={{ color: 'var(--color-text-secondary)' }}>({d.document_type})</span></span>
              <button className="btn btn-primary" style={{ padding: '4px 10px' }} onClick={() => registerDoc(d)}>{locale === 'ar' ? 'تسجيل' : 'Register'}</button>
            </div>
          ))}
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setRegistering(false)}>Close</button>
        </div>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <FileText size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'السجل فارغ.' : 'The controlled register is empty.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>{locale === 'ar' ? 'رقم المستند' : 'Doc number'}</th><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th>
              <th>{locale === 'ar' ? 'النوع' : 'Type'}</th><th>{locale === 'ar' ? 'التخصص' : 'Discipline'}</th>
              <th>{locale === 'ar' ? 'الحزمة' : 'Package'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th>
            </tr></thead>
            <tbody>
              {rows.map(d => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{d.doc_number}{!d.is_current && <span className="badge badge-danger" style={{ marginLeft: 6 }}><AlertTriangle size={10} /> superseded</span>}</td>
                  <td style={{ fontWeight: 500 }}>{d.title}</td>
                  <td>{d.doc_type || d.document_type}</td>
                  <td>{d.discipline || '-'}</td>
                  <td>{d.package || '-'}</td>
                  <td><span className="badge badge-info">{d.doc_status || d.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============ TRANSMITTALS ============

export function TransmittalsTab({ projectId, locale, t }) {
  const { rows, loading, reload } = useTransmittals(projectId);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ direction: 'outgoing', purpose: '', attention: '', response_due: '' });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/docs/transmittals`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), direction: form.direction, purpose: form.purpose,
        attention: form.attention, response_due: form.response_due || null,
      }) });
      setShowModal(false); setForm({ direction: 'outgoing', purpose: '', attention: '', response_due: '' });
      reload();
    } catch (err) { alert(err.message); }
  };

  const act = async (row, status) => {
    try {
      await fetchApi(`${API_URL}/docs/transmittals/${row.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      reload();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'مذكرة جديدة' : 'New Transmittal'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px', maxWidth: 520 }}>
          <select className="input" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}>
            <option value="outgoing">{locale === 'ar' ? 'صادرة' : 'Outgoing'}</option>
            <option value="incoming">{locale === 'ar' ? 'واردة' : 'Incoming'}</option>
          </select>
          <input className="input" placeholder={locale === 'ar' ? 'الغرض' : 'Purpose'} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
          <input className="input" placeholder={locale === 'ar' ? 'إلى وجهة الشخص' : 'Attention'} value={form.attention} onChange={e => setForm({ ...form, attention: e.target.value })} />
          <input className="input" type="date" title="Response due" value={form.response_due} onChange={e => setForm({ ...form, response_due: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Send size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد مذكرات إرسال.' : 'No transmittals.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>Transmittal</th><th>{locale === 'ar' ? 'الاتجاه' : 'Direction'}</th><th>{locale === 'ar' ? 'الغرض' : 'Purpose'}</th>
              <th>{locale === 'ar' ? 'رد مستحق' : 'Response due'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(tr => (
                <tr key={tr.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{tr.transmittal_number}</td>
                  <td>{tr.direction === 'incoming' ? (locale === 'ar' ? 'واردة' : 'Incoming') : (locale === 'ar' ? 'صادرة' : 'Outgoing')}</td>
                  <td>{tr.purpose || '-'}</td>
                  <td>{fmtDate(tr.response_due)}</td>
                  <td><span className={`badge ${TR_STATUS_BADGE[tr.status]}`}>{tr.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {tr.status === 'draft' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(tr, 'sent')}><Send size={12} /> {locale === 'ar' ? 'إرسال' : 'Send'}</button>}
                    {tr.status === 'sent' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(tr, 'acknowledged')}>{locale === 'ar' ? 'إقرار' : 'Acknowledge'}</button>}
                    {(tr.status === 'sent' || tr.status === 'acknowledged') && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(tr, 'closed')}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={async () => {
                      const res = await fetch(`${API_URL}/docs/transmittals/${tr.id}/pdf`, { headers: headers() });
                      const blob = await res.blob();
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob); a.download = `${tr.transmittal_number}.pdf`; a.click(); URL.revokeObjectURL(a.href);
                    }}><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function useTransmittals(projectId) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/docs/transmittals?project_id=${projectId}`);
      if (r.success) setRows(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);
  useEffect(() => { reload(); }, [reload]);
  return { rows, loading, reload };
}

// ============ CORRESPONDENCE ============

export function CorrespondenceTab({ projectId, locale, t }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ corr_type: 'letter', subject: '', body: '', response_due: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/docs/correspondence?project_id=${projectId}`);
      if (r.success) setRows(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/docs/correspondence`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), corr_type: form.corr_type, subject: form.subject,
        body: form.body, response_due: form.response_due || null,
      }) });
      setShowModal(false); setForm({ corr_type: 'letter', subject: '', body: '', response_due: '' });
      load();
    } catch (err) { alert(err.message); }
  };

  const act = async (row, status) => {
    try {
      await fetchApi(`${API_URL}/docs/correspondence/${row.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      load();
    } catch (err) { alert(err.message); }
  };

  const amend = async (row) => {
    const body = prompt(locale === 'ar' ? 'المحتوى المعدل' : 'Amended body', row.body || '');
    if (body == null) return;
    try {
      await fetchApi(`${API_URL}/docs/correspondence/${row.id}/amend`, { method: 'POST', body: JSON.stringify({ body, note: 'Amended' }) });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'مراسلة جديدة' : 'New Correspondence'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px', maxWidth: 560 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select className="input" value={form.corr_type} onChange={e => setForm({ ...form, corr_type: e.target.value })}>
              {Object.entries(CORR_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="input" type="date" title="Response due" value={form.response_due} onChange={e => setForm({ ...form, response_due: e.target.value })} />
          </div>
          <input className="input" required placeholder={locale === 'ar' ? 'الموضوع' : 'Subject'} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <textarea className="input" rows={4} placeholder={locale === 'ar' ? 'المحتوى' : 'Body'} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <FileText size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد مراسلات.' : 'No correspondence.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>Ref</th><th>{locale === 'ar' ? 'النوع' : 'Type'}</th><th>{locale === 'ar' ? 'الموضوع' : 'Subject'}</th>
              <th>Rev</th><th>{locale === 'ar' ? 'رد مستحق' : 'Response due'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.corr_number}</td>
                  <td>{CORR_TYPE_LABEL[c.corr_type] || c.corr_type}</td>
                  <td>{c.subject}</td>
                  <td>{c.revision}</td>
                  <td>{fmtDate(c.response_due)}</td>
                  <td><span className={`badge ${CORR_STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {c.status === 'draft' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(c, 'sent')}><Send size={12} /> {locale === 'ar' ? 'إرسال' : 'Send'}</button>}
                    {c.status === 'sent' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(c, 'responded')}>{locale === 'ar' ? 'تم الرد' : 'Responded'}</button>}
                    {(c.status === 'sent' || c.status === 'responded') && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(c, 'closed')}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>}
                    {c.status !== 'closed' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => amend(c)}>{locale === 'ar' ? 'تعديل' : 'Amend'}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/docs/correspondence/${c.id}/pdf`, `${c.corr_number}.pdf`)}><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============ CROSS-RECORD SEARCH ============

export function DocSearchTab({ projectId, locale }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async (e) => {
    e.preventDefault();
    if (!term.trim()) return;
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/docs/search?project_id=${projectId}&q=${encodeURIComponent(term)}`);
      setResults(r.data || []);
      setSearched(true);
    } catch (err) { alert(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <form onSubmit={run} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="input" placeholder={locale === 'ar' ? 'ابحث في المستندات والمذكرات والمراسلات وطلبات المعلومات والاعتمادات…' : 'Search documents, transmittals, correspondence, RFIs, submittals…'} value={term} onChange={e => setTerm(e.target.value)} style={{ flex: 1 }} />
        <button className="btn btn-primary" type="submit"><Search size={16} />{locale === 'ar' ? 'بحث' : 'Search'}</button>
      </form>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : !searched ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: 40 }}>
          {locale === 'ar' ? 'اكتب مصطلحاً للبحث عبر السجلات الحالية والتاريخية.' : 'Type a term to search across current and historical records.'}
        </p>
      ) : results.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <Search size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا نتائج.' : 'No results.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>{locale === 'ar' ? 'النوع' : 'Record'}</th><th>{locale === 'ar' ? 'الرقم' : 'Number'}</th><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th></tr></thead>
            <tbody>
              {results.map(r => (
                <tr key={`${r.record_type}-${r.id}`}>
                  <td>{r.record_type}{r.record_type === 'document' && !r.is_current ? <span className="badge badge-danger" style={{ marginLeft: 6 }}>superseded</span> : null}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{r.number || '-'}</td>
                  <td>{r.title}</td>
                  <td>{r.status || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
