import { formatDate as sharedDate } from '../utils/formatters';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { errorMessage } from '../utils/errorMessage';
import TextEntryDialog from '../components/common/TextEntryDialog';
import LoadMore from '../components/common/LoadMore';
import { ArrowLeft, Plus, FlaskConical, AlertOctagon, ShieldCheck, Siren, X, CheckCircle, ClipboardCheck, ListChecks, Wrench, PackageCheck, Gauge } from 'lucide-react';
import { ItpTab, WirTab, PunchTab, CapaTab, MockUpsTab, CalibrationTab } from './QHSEExtended';
import QHSECertificatesTab from './QHSECertificatesTab';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
});

const formatDate = sharedDate;

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
    { key: 'tests', icon: FlaskConical, label: t('qhse.system.qualityTests') },
    { key: 'ncrs', icon: AlertOctagon, label: t('qhse.system.ncrs') },
    { key: 'itp', icon: ClipboardCheck, label: t('qhse.system.itp') },
    { key: 'wirs', icon: ShieldCheck, label: t('qhse.system.wirs') },
    { key: 'punch', icon: ListChecks, label: t('qhse.system.punchItems') },
    { key: 'capa', icon: Wrench, label: t('qhse.system.capa') },
    { key: 'mockups', icon: PackageCheck, label: t('qhse.system.mockUps') },
    { key: 'calibration', icon: Gauge, label: t('qhse.system.calibration') },
    { key: 'certificates', icon: ClipboardCheck, label: t('qhse.certificates.title') },
    { key: 'inspections', icon: ShieldCheck, label: t('qhse.system.safetyInspections') },
    { key: 'incidents', icon: Siren, label: t('qhse.system.incidents') },
  ];

  const summaryCards = [
    { label: t('qhse.system.openNcrs'), value: summary.openNcrs, color: summary.openNcrs > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' },
    { label: t('qhse.system.failedTests'), value: summary.failedTests, color: summary.failedTests > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' },
    { label: t('qhse.system.openIncidents'), value: summary.openIncidents, color: summary.openIncidents > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
    { label: t('qhse.system.inspections'), value: summary.inspections, color: 'var(--color-accent)' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1>{t('qhse.title')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('qhse.system.qualityTestsNcrsSiteSafety')}
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
      {tab === 'certificates' && <QHSECertificatesTab projectId={id} t={t} />}
      {tab === 'inspections' && <InspectionsTab projectId={id} locale={locale} t={t} onChanged={loadSummary} />}
      {tab === 'incidents' && <IncidentsTab projectId={id} locale={locale} t={t} onChanged={loadSummary} />}
    </div>
  );
}

// ============ QUALITY TESTS ============

function QualityTestsTab({ projectId, locale, t, onChanged }) {
  const [tests, setTests] = useState([]);
  const rowsLength = useRef(0); rowsLength.current = tests.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [raiseNcrFor, setRaiseNcrFor] = useState(null);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const res = await fetchApi(`${API_URL}/qhse/quality-tests?${params}`);
      if (res.success) { setTests(current => append ? [...current, ...(res.data || [])] : (res.data || [])); setTotalCount(res.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t('qhse.system.logTest')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : tests.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <FlaskConical size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noQualityTestsLogged')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('qhse.system.testType')}</th>
                <th>{t('qhse.system.date')}</th>
                <th>{t('qhse.system.result')}</th>
                <th>{t('qhse.system.testedBy')}</th>
                <th>{t('qhse.certificates.notes')}</th>
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
                        {t('qhse.system.raiseNcr')}
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
      <LoadMore loadedCount={tests.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
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
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('qhse.system.logQualityTest')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.testType')} *</label>
                  <input className="form-input" value={form.test_type} onChange={e => handleChange('test_type', e.target.value)}
                    placeholder={t('qhse.system.concreteCubeTest')} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.date')}</label>
                  <input className="form-input" type="date" value={form.test_date} onChange={e => handleChange('test_date', e.target.value)} />
                </div>
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.result')}</label>
                  <select className="form-select" value={form.result} onChange={e => handleChange('result', e.target.value)}>
                    {['pending', 'pass', 'fail'].map(r => <option key={r} value={r}>{RESULT_LABELS[locale]?.[r] || r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.testedBy')}</label>
                  <input className="form-input" value={form.tested_by} onChange={e => handleChange('tested_by', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('qhse.certificates.notes')}</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
              </div>
              {error && <div className="alert alert-danger">{errorMessage(error, t)}</div>}
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
  const rowsLength = useRef(0); rowsLength.current = ncrs.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [resolutionTarget, setResolutionTarget] = useState(null);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId });
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.set('limit', '200'); params.set('offset', String(append ? rowsLength.current : 0));
      const res = await fetchApi(`${API_URL}/qhse/ncrs?${params}`);
      if (res.success) { setNcrs(current => append ? [...current, ...(res.data || [])] : (res.data || [])); setTotalCount(res.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const advance = async (ncr) => {
    const next = NCR_NEXT[ncr.status];
    if (!next) return;
    if (next === 'resolved') {
      setResolutionTarget(ncr);
      return;
    }
    try {
      await fetchApi(`${API_URL}/qhse/ncrs/${ncr.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next }),
      });
      load(); onChanged();
    } catch (e) { alert(e.message); }
  };

  const resolveNcr = async (resolution_notes) => {
    const next = NCR_NEXT[resolutionTarget.status];
    await fetchApi(`${API_URL}/qhse/ncrs/${resolutionTarget.id}/status`, {
      method: 'POST', body: JSON.stringify({ status: next, resolution_notes }),
    });
    setResolutionTarget(null);
    load(); onChanged();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['all', 'open', 'in_progress', 'resolved', 'closed'].map(s => (
            <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : ''}`} style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => setStatusFilter(s)}>
              {s === 'all' ? (t('qhse.system.all')) : (NCR_STATUS_LABELS[locale]?.[s] || s)}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t('qhse.system.raiseNcr')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : ncrs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <AlertOctagon size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noNcrs')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('common.description')}</th>
                <th>{t('qhse.system.severity')}</th>
                <th>{t('common.status')}</th>
                <th>{t('qhse.system.raisedBy')}</th>
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
      <TextEntryDialog open={Boolean(resolutionTarget)} title={t('common.dialogs.resolveNcrTitle')} label={t('common.dialogs.resolveNcrLabel')} onSubmit={resolveNcr} onCancel={() => setResolutionTarget(null)} />
      <LoadMore loadedCount={ncrs.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

function NcrModal({ projectId, locale, t, fromTest, onClose, onSave }) {
  const [form, setForm] = useState({
    description: fromTest ? `${t('qhse.system.failedTest')}: ${fromTest.test_type}${fromTest.notes ? ` — ${fromTest.notes}` : ''}` : '',
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
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('qhse.system.raiseNcr2')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {fromTest && (
                <div className="alert" style={{ background: 'var(--color-surface)', padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                  {t('qhse.system.linkedToTest')}<strong>{fromTest.test_type}</strong> ({formatDate(fromTest.test_date)})
                </div>
              )}
              <div className="form-group">
                <label className="form-label">{t('common.description')} *</label>
                <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">{t('qhse.system.severity')}</label>
                <select className="form-select" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                  {['minor', 'major', 'critical'].map(s => <option key={s} value={s}>{SEVERITY_LABELS[locale]?.[s] || s}</option>)}
                </select>
              </div>
              {error && <div className="alert alert-danger">{errorMessage(error, t)}</div>}
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
  const rowsLength = useRef(0); rowsLength.current = inspections.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const res = await fetchApi(`${API_URL}/qhse/inspections?${params}`);
      if (res.success) { setInspections(current => append ? [...current, ...(res.data || [])] : (res.data || [])); setTotalCount(res.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {t('qhse.system.newInspection')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : inspections.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ShieldCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noInspectionsLogged')}</p>
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
                    {items.length > 0 && <span className="badge badge-info">{okCount}/{items.length} {t('qhse.system.ok')}</span>}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{insp.inspector_name || ''}</span>
                </div>
                {items.length > 0 && (
                  <div className="responsive-grid responsive-grid--auto-260" style={{ gap: '4px', marginTop: '12px', fontSize: '13px' }}>
                    {items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {it.ok ? <CheckCircle size={13} style={{ color: 'var(--color-success)', flexShrink: 0 }} /> : <X size={13} style={{ color: 'var(--color-danger, #e5534b)', flexShrink: 0 }} />}
                        <span style={{ color: it.ok ? 'var(--color-text-secondary)' : 'inherit' }}>{it.item}{it.note ? ` — ${it.note}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
                {insp.findings && <p style={{ marginTop: '10px', fontSize: '13px', color: 'var(--color-text-secondary)' }}><strong>{t('qhse.system.findings')}</strong>{insp.findings}</p>}
              </div>
            );
          })}
        </div>
      )}

      {showModal && <InspectionModal projectId={projectId} locale={locale} t={t} onClose={() => setShowModal(false)} onSave={() => { load(); onChanged(); }} />}
      <LoadMore loadedCount={inspections.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
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
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('qhse.system.safetyInspection')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.date')}</label>
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
                <label className="form-label">{t('qhse.system.checklist')}</label>
                {checklist.map((it, i) => (
                  <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={it.ok} onChange={() => toggleItem(i)} />
                    <span>{it.item}</span>
                  </label>
                ))}
              </div>
              <div className="form-group">
                <label className="form-label">{t('qhse.system.findings2')}</label>
                <textarea className="form-textarea" value={form.findings} onChange={e => setForm(f => ({ ...f, findings: e.target.value }))} />
              </div>
              {error && <div className="alert alert-danger">{errorMessage(error, t)}</div>}
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
  const rowsLength = useRef(0); rowsLength.current = incidents.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const res = await fetchApi(`${API_URL}/qhse/incidents?${params}`);
      if (res.success) { setIncidents(current => append ? [...current, ...(res.data || [])] : (res.data || [])); setTotalCount(res.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
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
          {t('qhse.system.reportIncident')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : incidents.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Siren size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noIncidentsReported')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('qhse.system.date')}</th>
                <th>{t('qhse.system.type')}</th>
                <th>{t('qhse.system.severity')}</th>
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
                    {inc.injured_party && <div style={{ fontSize: '12px', color: 'var(--color-danger, #e5534b)' }}>{t('qhse.system.injured')}{inc.injured_party}</div>}
                    {inc.corrective_action && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>↳ {inc.corrective_action}</div>}
                  </td>
                  <td><span className={`badge ${INCIDENT_STATUS_BADGE[inc.status]}`}>{INCIDENT_STATUS_LABELS[locale]?.[inc.status] || inc.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {inc.status === 'open' && (
                        <button className="btn" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => updateStatus(inc, 'investigating')}>
                          {t('qhse.system.investigate')}
                        </button>
                      )}
                      {inc.status !== 'closed' && (
                        <button className="btn btn-success" style={{ padding: '6px 10px', fontSize: '12px' }} onClick={() => updateStatus(inc, 'closed')}>
                          {t('qhse.system.close')}
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
      <LoadMore loadedCount={incidents.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
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
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('qhse.system.reportIncident')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.date')}</label>
                  <input className="form-input" type="date" value={form.incident_date} onChange={e => handleChange('incident_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.type')}</label>
                  <input className="form-input" value={form.incident_type} onChange={e => handleChange('incident_type', e.target.value)}
                    placeholder={t('qhse.system.fallCut')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.severity')}</label>
                  <select className="form-select" value={form.severity} onChange={e => handleChange('severity', e.target.value)}>
                    {['minor', 'major', 'critical'].map(s => <option key={s} value={s}>{SEVERITY_LABELS[locale]?.[s] || s}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.description')} *</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} required />
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.injuredPartyIfAny')}</label>
                  <input className="form-input" value={form.injured_party} onChange={e => handleChange('injured_party', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('qhse.system.correctiveAction')}</label>
                  <input className="form-input" value={form.corrective_action} onChange={e => handleChange('corrective_action', e.target.value)} />
                </div>
              </div>
              {error && <div className="alert alert-danger">{errorMessage(error, t)}</div>}
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
