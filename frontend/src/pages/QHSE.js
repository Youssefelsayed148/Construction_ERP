import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Plus, FlaskConical, AlertOctagon, ShieldCheck, Siren, X, CheckCircle, ClipboardCheck, ListChecks, Wrench, PackageCheck, Gauge } from 'lucide-react';
import { ItpTab, WirTab, PunchTab, CapaTab, MockUpsTab, CalibrationTab } from './QHSEExtended';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

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

const SEVERITY_LABELS = {
  en: { minor: 'Minor', major: 'Major', critical: 'Critical' },
  ar: { minor: 'بسيطة', major: 'كبيرة', critical: 'حرجة' }
};
const SEVERITY_BADGE = { minor: 'badge-info', major: 'badge-warning', critical: 'badge-danger' };

const RESULT_LABELS = {
  en: { pass: 'Pass', fail: 'Fail', pending: 'Pending' },
  ar: { pass: 'ناجح', fail: 'فاشل', pending: 'معلق' }
};
const RESULT_BADGE = { pass: 'badge-success', fail: 'badge-danger', pending: 'badge-warning' };

const NCR_STATUS_LABELS = {
  en: { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', closed: 'Closed' },
  ar: { open: 'مفتوح', in_progress: 'قيد المعالجة', resolved: 'تم الحل', closed: 'مغلق' }
};
const NCR_STATUS_BADGE = { open: 'badge-danger', in_progress: 'badge-warning', resolved: 'badge-success', closed: 'badge-info' };
const NCR_NEXT = { open: 'in_progress', in_progress: 'resolved', resolved: 'closed' };
const NCR_NEXT_LABELS = {
  en: { in_progress: 'Start Work', resolved: 'Mark Resolved', closed: 'Close' },
  ar: { in_progress: 'بدء المعالجة', resolved: 'تم الحل', closed: 'إغلاق' }
};

const INSPECTION_STATUS_LABELS = {
  en: { pending: 'Pending', passed: 'Passed', failed: 'Failed' },
  ar: { pending: 'معلق', passed: 'ناجح', failed: 'فاشل' }
};
const INSPECTION_STATUS_BADGE = { pending: 'badge-warning', passed: 'badge-success', failed: 'badge-danger' };

const INCIDENT_STATUS_LABELS = {
  en: { open: 'Open', investigating: 'Investigating', closed: 'Closed' },
  ar: { open: 'مفتوح', investigating: 'قيد التحقيق', closed: 'مغلق' }
};
const INCIDENT_STATUS_BADGE = { open: 'badge-danger', investigating: 'badge-warning', closed: 'badge-info' };

function QHSE() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState('tests');
  const [summary, setSummary] = useState({ openNcrs: 0, failedTests: 0, openIncidents: 0, inspections: 0 });

  const loadSummary = useCallback(async () => {
    try {
      const [ncrs, tests, incidents, inspections] = await Promise.all([
        fetchApi(`${API_URL}/qhse/ncrs?project_id=${id}`),
        fetchApi(`${API_URL}/qhse/quality-tests?project_id=${id}`),
        fetchApi(`${API_URL}/qhse/incidents?project_id=${id}`),
        fetchApi(`${API_URL}/qhse/inspections?project_id=${id}`),
      ]);
      setSummary({
        openNcrs: (ncrs.data || []).filter(n => n.status !== 'closed').length,
        failedTests: (tests.data || []).filter(qt => qt.result === 'fail').length,
        openIncidents: (incidents.data || []).filter(i => i.status !== 'closed').length,
        inspections: (inspections.data || []).length,
      });
    } catch (e) { console.error(e); }
  }, [id]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const TABS = [
    { key: 'tests', icon: FlaskConical, label: locale === 'ar' ? 'اختبارات الجودة' : 'Quality Tests' },
    { key: 'ncrs', icon: AlertOctagon, label: locale === 'ar' ? 'تقارير عدم المطابقة' : 'NCRs' },
    { key: 'itp', icon: ClipboardCheck, label: locale === 'ar' ? 'خطط الفحص' : 'ITP' },
    { key: 'wirs', icon: ShieldCheck, label: locale === 'ar' ? 'فحص الأعمال' : 'WIRs' },
    { key: 'punch', icon: ListChecks, label: locale === 'ar' ? 'بنود PUNCH' : 'Punch Items' },
    { key: 'capa', icon: Wrench, label: locale === 'ar' ? 'إجراءات CAPA' : 'CAPA' },
    { key: 'mockups', icon: PackageCheck, label: locale === 'ar' ? 'نماذج تجريبية' : 'Mock-ups' },
    { key: 'calibration', icon: Gauge, label: locale === 'ar' ? 'المعايرة' : 'Calibration' },
    { key: 'inspections', icon: ShieldCheck, label: locale === 'ar' ? 'تفتيش السلامة' : 'Safety Inspections' },
    { key: 'incidents', icon: Siren, label: locale === 'ar' ? 'الحوادث' : 'Incidents' },
  ];

  const summaryCards = [
    { label: locale === 'ar' ? 'عدم مطابقة مفتوحة' : 'Open NCRs', value: summary.openNcrs, color: summary.openNcrs > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' },
    { label: locale === 'ar' ? 'اختبارات فاشلة' : 'Failed Tests', value: summary.failedTests, color: summary.failedTests > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' },
    { label: locale === 'ar' ? 'حوادث مفتوحة' : 'Open Incidents', value: summary.openIncidents, color: summary.openIncidents > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
    { label: locale === 'ar' ? 'عمليات تفتيش' : 'Inspections', value: summary.inspections, color: 'var(--color-accent)' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1>{locale === 'ar' ? 'الجودة والسلامة' : 'Quality & HSE'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'اختبارات الجودة وعدم المطابقة والسلامة' : 'Quality tests, NCRs & site safety'}
          </p>
        </div>
      </div>

      <div className="level-line" />

      <div className="stats-grid">
        {summaryCards.map((c, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb.key} className={`btn ${tab === tb.key ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px' }} onClick={() => setTab(tb.key)}>
            <tb.icon size={14} />
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'tests' && <QualityTestsTab projectId={id} locale={locale} t={t} onChanged={loadSummary} />}
      {tab === 'ncrs' && <NcrsTab projectId={id} locale={locale} t={t} onChanged={loadSummary} />}
      {tab === 'itp' && <ItpTab projectId={id} locale={locale} t={t} />}
      {tab === 'wirs' && <WirTab projectId={id} locale={locale} t={t} />}
      {tab === 'punch' && <PunchTab projectId={id} locale={locale} t={t} />}
      {tab === 'capa' && <CapaTab projectId={id} locale={locale} t={t} />}
      {tab === 'mockups' && <MockUpsTab projectId={id} locale={locale} t={t} />}
      {tab === 'calibration' && <CalibrationTab projectId={id} locale={locale} t={t} />}
      {tab === 'inspections' && <InspectionsTab projectId={id} locale={locale} t={t} onChanged={loadSummary} />}
      {tab === 'incidents' && <IncidentsTab projectId={id} locale={locale} t={t} onChanged={loadSummary} />}
    </div>
  );
}

// ============ QUALITY TESTS ============

function QualityTestsTab({ projectId, locale, t, onChanged }) {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [raiseNcrFor, setRaiseNcrFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/qhse/quality-tests?project_id=${projectId}`);
      if (res.success) setTests(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'تسجيل اختبار' : 'Log Test'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : tests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <FlaskConical size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد اختبارات.' : 'No quality tests logged.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'نوع الاختبار' : 'Test Type'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th>{locale === 'ar' ? 'النتيجة' : 'Result'}</th>
                <th>{locale === 'ar' ? 'أجراه' : 'Tested By'}</th>
                <th>{locale === 'ar' ? 'ملاحظات' : 'Notes'}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tests.map(qt => (
                <tr key={qt.id}>
                  <td style={{ fontWeight: 500 }}>{qt.test_type}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(qt.test_date)}</td>
                  <td><span className={`badge ${RESULT_BADGE[qt.result]}`}>{RESULT_LABELS[locale]?.[qt.result] || qt.result}</span></td>
                  <td style={{ fontSize: '13px' }}>{qt.tested_by || '-'}</td>
                  <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{qt.notes || '-'}</td>
                  <td>
                    {qt.result === 'fail' && (
                      <button className="btn btn-danger" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => setRaiseNcrFor(qt)}>
                        <AlertOctagon size={12} />
                        {locale === 'ar' ? 'رفع عدم مطابقة' : 'Raise NCR'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <TestModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={() => { load(); onChanged(); }} />}
      {raiseNcrFor && <NcrModal projectId={projectId} locale={locale} t={t} fromTest={raiseNcrFor} onClose={() => setRaiseNcrFor(null)} onSave={() => { load(); onChanged(); }} />}
    </div>
  );
}

function TestModal({ projectId, locale, t, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ test_type: '', test_date: today, result: 'pending', tested_by: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetchApi(`${API_URL}/qhse/quality-tests`, {
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
          <h3 className="modal-title">{locale === 'ar' ? 'تسجيل اختبار جودة' : 'Log Quality Test'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'نوع الاختبار' : 'Test Type'} *</label>
                  <input className="form-input" value={form.test_type} onChange={e => handleChange('test_type', e.target.value)}
                    placeholder={locale === 'ar' ? 'اختبار مكعبات خرسانة' : 'Concrete cube test'} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'}</label>
                  <input className="form-input" type="date" value={form.test_date} onChange={e => handleChange('test_date', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'النتيجة' : 'Result'}</label>
                  <select className="form-select" value={form.result} onChange={e => handleChange('result', e.target.value)}>
                    {['pending', 'pass', 'fail'].map(r => <option key={r} value={r}>{RESULT_LABELS[locale]?.[r] || r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'أجراه' : 'Tested By'}</label>
                  <input className="form-input" value={form.tested_by} onChange={e => handleChange('tested_by', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
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

// ============ NCRs ============

function NcrsTab({ projectId, locale, t, onChanged }) {
  const [ncrs, setNcrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      const res = await fetchApi(`${API_URL}/qhse/ncrs?${params}`);
      if (res.success) setNcrs(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const advance = async (ncr) => {
    const next = NCR_NEXT[ncr.status];
    if (!next) return;
    let resolution_notes;
    if (next === 'resolved') {
      resolution_notes = prompt(locale === 'ar' ? 'ملاحظات الحل:' : 'Resolution notes:');
      if (resolution_notes === null) return;
    }
    try {
      await fetchApi(`${API_URL}/qhse/ncrs/${ncr.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next, ...(resolution_notes ? { resolution_notes } : {}) }),
      });
      load(); onChanged();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
            <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : ''}`} style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? (locale === 'ar' ? 'الكل' : 'All') : (NCR_STATUS_LABELS[locale]?.[s] || s)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'رفع عدم مطابقة' : 'Raise NCR'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : ncrs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <AlertOctagon size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد تقارير عدم مطابقة.' : 'No NCRs.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('common.description')}</th>
                <th>{locale === 'ar' ? 'الخطورة' : 'Severity'}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'رفعه' : 'Raised By'}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {ncrs.map(n => (
                <tr key={n.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{n.ncr_number}</td>
                  <td style={{ fontWeight: 500 }}>
                    {n.description}
                    {n.resolution_notes && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>↳ {n.resolution_notes}</div>}
                  </td>
                  <td><span className={`badge ${SEVERITY_BADGE[n.severity]}`}>{SEVERITY_LABELS[locale]?.[n.severity] || n.severity}</span></td>
                  <td><span className={`badge ${NCR_STATUS_BADGE[n.status]}`}>{NCR_STATUS_LABELS[locale]?.[n.status] || n.status}</span></td>
                  <td style={{ fontSize: '13px' }}>{n.raised_by_name || '-'}</td>
                  <td>
                    {NCR_NEXT[n.status] && (
                      <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => advance(n)}>
                        <CheckCircle size={12} />
                        {NCR_NEXT_LABELS[locale]?.[NCR_NEXT[n.status]]}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <NcrModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={() => { load(); onChanged(); }} />}
    </div>
  );
}

function NcrModal({ projectId, locale, t, fromTest, onClose, onSave }) {
  const [form, setForm] = useState({
    description: fromTest ? `${locale === 'ar' ? 'اختبار فاشل' : 'Failed test'}: ${fromTest.test_type}${fromTest.notes ? ` — ${fromTest.notes}` : ''}` : '',
    severity: 'minor',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { ...form, project_id: Number(projectId) };
      if (fromTest) body.quality_test_id = fromTest.id;
      const res = await fetchApi(`${API_URL}/qhse/ncrs`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'رفع تقرير عدم مطابقة' : 'Raise NCR'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {fromTest && (
                <div className="alert" style={{ background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                  {locale === 'ar' ? 'مرتبط بالاختبار: ' : 'Linked to test: '}<strong>{fromTest.test_type}</strong> ({formatDate(fromTest.test_date)})
                </div>
              )}
              <div className="form-group">
                <label className="form-label">{t('common.description')} *</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الخطورة' : 'Severity'}</label>
                <select className="form-select" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                  {['minor', 'major', 'critical'].map(s => <option key={s} value={s}>{SEVERITY_LABELS[locale]?.[s] || s}</option>)}
                </select>
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

// ============ SAFETY INSPECTIONS ============

const DEFAULT_CHECKLIST = [
  'PPE compliance (helmets, boots, vests)',
  'Scaffolding safety',
  'Excavation protection',
  'Electrical safety',
  'Fire extinguishers available',
  'First aid kit available',
  'Housekeeping / site cleanliness',
];

function InspectionsTab({ projectId, locale, t, onChanged }) {
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/qhse/inspections?project_id=${projectId}`);
      if (res.success) setInspections(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'تفتيش جديد' : 'New Inspection'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : inspections.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ShieldCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد عمليات تفتيش.' : 'No inspections logged.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {inspections.map(insp => {
            const items = Array.isArray(insp.checklist_items) ? insp.checklist_items : [];
            const okCount = items.filter(i => i.ok).length;
            return (
              <div className="card" key={insp.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatDate(insp.inspection_date)}</span>
                    <span className={`badge ${INSPECTION_STATUS_BADGE[insp.status]}`}>{INSPECTION_STATUS_LABELS[locale]?.[insp.status] || insp.status}</span>
                    {items.length > 0 && <span className="badge badge-info">{okCount}/{items.length} {locale === 'ar' ? 'مطابق' : 'OK'}</span>}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{insp.inspector_name || ''}</span>
                </div>
                {items.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px', marginTop: '12px', fontSize: '13px' }}>
                    {items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {it.ok ? <CheckCircle size={13} style={{ color: 'var(--color-success)', flexShrink: 0 }} /> : <X size={13} style={{ color: 'var(--color-danger, #e5534b)', flexShrink: 0 }} />}
                        <span style={{ color: it.ok ? 'var(--color-text-secondary)' : 'inherit' }}>{it.item}{it.note ? ` — ${it.note}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
                {insp.findings && <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--color-text-secondary)' }}><strong>{locale === 'ar' ? 'الملاحظات: ' : 'Findings: '}</strong>{insp.findings}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showModal && <InspectionModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={() => { load(); onChanged(); }} />}
    </div>
  );
}

function InspectionModal({ projectId, locale, t, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ inspection_date: today, findings: '', status: 'pending' });
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST.map(item => ({ item, ok: false, note: '' })));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleItem = (i) => setChecklist(cl => cl.map((it, x) => x === i ? { ...it, ok: !it.ok } : it));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { ...form, project_id: Number(projectId), checklist_items: checklist };
      const res = await fetchApi(`${API_URL}/qhse/inspections`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'تفتيش سلامة' : 'Safety Inspection'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'}</label>
                  <input className="form-input" type="date" value={form.inspection_date} onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.status')}</label>
                  <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {['pending', 'passed', 'failed'].map(s => <option key={s} value={s}>{INSPECTION_STATUS_LABELS[locale]?.[s] || s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'قائمة الفحص' : 'Checklist'}</label>
                {checklist.map((it, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={it.ok} onChange={() => toggleItem(i)} />
                    <span>{it.item}</span>
                  </label>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الملاحظات' : 'Findings'}</label>
                <textarea className="form-textarea" value={form.findings} onChange={e => setForm(f => ({ ...f, findings: e.target.value }))} />
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

// ============ SAFETY INCIDENTS ============

function IncidentsTab({ projectId, locale, t, onChanged }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/qhse/incidents?project_id=${projectId}`);
      if (res.success) setIncidents(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (incident, status) => {
    try {
      await fetchApi(`${API_URL}/qhse/incidents/${incident.id}`, { method: 'PUT', body: JSON.stringify({ status }) });
      load(); onChanged();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'الإبلاغ عن حادث' : 'Report Incident'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : incidents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Siren size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد حوادث مسجلة.' : 'No incidents reported.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th>{locale === 'ar' ? 'النوع' : 'Type'}</th>
                <th>{locale === 'ar' ? 'الخطورة' : 'Severity'}</th>
                <th>{t('common.description')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map(inc => (
                <tr key={inc.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(inc.incident_date)}</td>
                  <td>{inc.incident_type || '-'}</td>
                  <td><span className={`badge ${SEVERITY_BADGE[inc.severity]}`}>{SEVERITY_LABELS[locale]?.[inc.severity] || inc.severity}</span></td>
                  <td style={{ fontSize: '13px' }}>
                    {inc.description}
                    {inc.injured_party && <div style={{ fontSize: '12px', color: 'var(--color-danger, #e5534b)' }}>{locale === 'ar' ? 'مصاب: ' : 'Injured: '}{inc.injured_party}</div>}
                    {inc.corrective_action && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>↳ {inc.corrective_action}</div>}
                  </td>
                  <td><span className={`badge ${INCIDENT_STATUS_BADGE[inc.status]}`}>{INCIDENT_STATUS_LABELS[locale]?.[inc.status] || inc.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {inc.status === 'open' && (
                        <button className="btn" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => updateStatus(inc, 'investigating')}>
                          {locale === 'ar' ? 'تحقيق' : 'Investigate'}
                        </button>
                      )}
                      {inc.status !== 'closed' && (
                        <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => updateStatus(inc, 'closed')}>
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

      {showModal && <IncidentModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={() => { load(); onChanged(); }} />}
    </div>
  );
}

function IncidentModal({ projectId, locale, t, onClose, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    incident_date: today, incident_type: '', severity: 'minor',
    description: '', injured_party: '', corrective_action: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const res = await fetchApi(`${API_URL}/qhse/incidents`, {
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
          <h3 className="modal-title">{locale === 'ar' ? 'الإبلاغ عن حادث' : 'Report Incident'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'}</label>
                  <input className="form-input" type="date" value={form.incident_date} onChange={e => handleChange('incident_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'النوع' : 'Type'}</label>
                  <input className="form-input" value={form.incident_type} onChange={e => handleChange('incident_type', e.target.value)}
                    placeholder={locale === 'ar' ? 'سقوط، جرح...' : 'Fall, cut...'} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الخطورة' : 'Severity'}</label>
                  <select className="form-select" value={form.severity} onChange={e => handleChange('severity', e.target.value)}>
                    {['minor', 'major', 'critical'].map(s => <option key={s} value={s}>{SEVERITY_LABELS[locale]?.[s] || s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')} *</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المصاب (إن وجد)' : 'Injured Party (if any)'}</label>
                  <input className="form-input" value={form.injured_party} onChange={e => handleChange('injured_party', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الإجراء التصحيحي' : 'Corrective Action'}</label>
                  <input className="form-input" value={form.corrective_action} onChange={e => handleChange('corrective_action', e.target.value)} />
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

export default QHSE;
