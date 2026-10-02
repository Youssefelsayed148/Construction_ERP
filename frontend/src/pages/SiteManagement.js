import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Plus, CalendarDays, ClipboardList, Users, Sun, CheckCircle, X } from 'lucide-react';
import DocumentUpload from '../components/DocumentUpload';
import { openProtectedFile, ProtectedImage } from '../components/ProtectedMedia';

const API_BASE_URL = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
const API_URL = `${API_BASE_URL}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

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

const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
};

function SiteManagement() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState('reports');

  const TABS = [
    { key: 'reports', icon: CalendarDays, label: locale === 'ar' ? 'التقارير اليومية' : 'Daily Reports' },
    { key: 'instructions', icon: ClipboardList, label: locale === 'ar' ? 'تعليمات المهندس' : 'Engineer Instructions' },
    { key: 'visits', icon: Users, label: locale === 'ar' ? 'زيارات الموقع' : 'Site Visits' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1>{locale === 'ar' ? 'إدارة الموقع' : 'Site Management'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'التقارير اليومية والتعليمات والزيارات' : 'Daily reports, instructions & visits'}
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
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/projects/${projectId}/site-reports?limit=100`);
      if (res.success) setReports(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'تقرير اليوم' : "File Today's Report"}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : reports.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <CalendarDays size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد تقارير يومية بعد.' : 'No daily reports filed yet.'}
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
                  <span className="badge badge-info"><Users size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{r.workers_count} {locale === 'ar' ? 'عامل' : 'workers'}</span>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{r.created_by_name || ''}</span>
              </div>
              {r.work_summary && <p style={{ marginTop: '12px', fontSize: '14px' }}>{r.work_summary}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '12px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {r.material_received && <div><strong>{locale === 'ar' ? 'مواد مستلمة: ' : 'Materials received: '}</strong>{r.material_received}</div>}
                {r.equipment_on_site && <div><strong>{locale === 'ar' ? 'معدات بالموقع: ' : 'Equipment on site: '}</strong>{r.equipment_on_site}</div>}
                {r.issues_notes && <div style={{ color: 'var(--color-danger, #e5534b)' }}><strong>{locale === 'ar' ? 'مشاكل: ' : 'Issues: '}</strong>{r.issues_notes}</div>}
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

      {showModal && <ReportModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={load} />}
    </div>
  );
}

function ReportModal({ projectId, locale, t, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    report_date: today, weather: '', temperature: '', workers_count: 0,
    work_summary: '', material_received: '', equipment_on_site: '', issues_notes: '', photos: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form, workers_count: Number(form.workers_count) || 0 };
      const res = await fetchApi(`${API_URL}/projects/${projectId}/site-reports`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'تقرير موقع يومي' : 'Daily Site Report'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'} *</label>
                  <input className="form-input" type="date" value={form.report_date} onChange={e => handleChange('report_date', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الطقس' : 'Weather'}</label>
                  <input className="form-input" value={form.weather} onChange={e => handleChange('weather', e.target.value)} placeholder={locale === 'ar' ? 'مشمس' : 'Sunny'} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الحرارة' : 'Temp'}</label>
                  <input className="form-input" value={form.temperature} onChange={e => handleChange('temperature', e.target.value)} placeholder="35°C" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'عدد العمال' : 'Workers Count'}</label>
                <input className="form-input" type="number" min="0" value={form.workers_count} onChange={e => handleChange('workers_count', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'ملخص الأعمال' : 'Work Summary'} *</label>
                <textarea className="form-textarea" value={form.work_summary} onChange={e => handleChange('work_summary', e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'مواد مستلمة' : 'Materials Received'}</label>
                  <textarea className="form-textarea" value={form.material_received} onChange={e => handleChange('material_received', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'معدات بالموقع' : 'Equipment on Site'}</label>
                  <textarea className="form-textarea" value={form.equipment_on_site} onChange={e => handleChange('equipment_on_site', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'مشاكل / ملاحظات' : 'Issues / Notes'}</label>
                <textarea className="form-textarea" value={form.issues_notes} onChange={e => handleChange('issues_notes', e.target.value)} />
              </div>
              <DocumentUpload locale={locale} accept="image/*,.pdf"
                label={locale === 'ar' ? 'صور الموقع' : 'Site Photos'}
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

// ============ INSTRUCTIONS ============

function InstructionsTab({ projectId, locale, t }) {
  const [instructions, setInstructions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);

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
    let response;
    if (action === 'close') {
      response = prompt(locale === 'ar' ? 'ملاحظات الإغلاق (اختياري):' : 'Closing response (optional):') || undefined;
    }
    try {
      await fetchApi(`${API_URL}/projects/${projectId}/instructions/${inst.id}/${action}`, {
        method: 'POST', body: JSON.stringify(response ? { response } : {}),
      });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all', 'issued', 'acknowledged', 'implemented', 'closed'].map(s => (
            <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : ''}`} style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? (locale === 'ar' ? 'الكل' : 'All') : (INSTRUCTION_STATUS_LABELS[locale]?.[s] || s)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'إصدار تعليمات' : 'Issue Instruction'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : instructions.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ClipboardList size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد تعليمات.' : 'No instructions.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{locale === 'ar' ? 'العنوان' : 'Title'}</th>
                <th>{locale === 'ar' ? 'الأولوية' : 'Priority'}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'أصدرها' : 'Issued By'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
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
                        {locale === 'ar' ? 'مغلقة' : 'Closed'} {inst.closed_by_name ? `— ${inst.closed_by_name}` : ''}
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
          <h3 className="modal-title">{locale === 'ar' ? 'إصدار تعليمات' : 'Issue Instruction'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'العنوان' : 'Title'} *</label>
                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الأولوية' : 'Priority'}</label>
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
          {locale === 'ar' ? 'تسجيل زيارة' : 'Log Visit'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : visits.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Users size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد زيارات مسجلة.' : 'No visits logged.'}</p>
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
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>{locale === 'ar' ? 'بنود المتابعة' : 'Action Items'}</div>
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
          <h3 className="modal-title">{locale === 'ar' ? 'تسجيل زيارة موقع' : 'Log Site Visit'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'} *</label>
                  <input className="form-input" type="date" value={form.visit_date} onChange={e => handleChange('visit_date', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'اسم الزائر' : 'Visitor Name'} *</label>
                  <input className="form-input" value={form.visitor_name} onChange={e => handleChange('visitor_name', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الصفة' : 'Role'}</label>
                  <input className="form-input" value={form.visitor_role} onChange={e => handleChange('visitor_role', e.target.value)} placeholder={locale === 'ar' ? 'استشاري' : 'Consultant'} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'بنود المتابعة' : 'Action Items'}</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input className="form-input" value={newItem} onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                    placeholder={locale === 'ar' ? 'أضف بند...' : 'Add an item...'} />
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
                label={locale === 'ar' ? 'صور' : 'Photos'}
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
