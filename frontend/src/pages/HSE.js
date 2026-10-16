import { formatDate as sharedDate } from '../utils/formatters';
import { translateEnum } from '../i18n/enums';
import { apiFetch, apiResponseJson } from '../services/apiClient';
// Phase 20 — HSE workspace: dashboard, permits, incidents, near misses,
// JSA/risk assessments, inspections, inductions, toolbox talks, PPE,
// equipment inspections, emergency drills. Every tab renders an explicit
// empty state (the zero-records requirement), never a blank screen.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Plus, HardHat, Flame, AlertTriangle, ShieldAlert, Users, Download, Activity } from 'lucide-react';
import LoadMore from '../components/common/LoadMore';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
});

const downloadPdf = async (url, filename) => {
  const res = await apiFetch(url, { headers: headers() });
  if (!res.ok) throw new Error('PDF failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
};

const fmtDate = sharedDate;

const PERMIT_TYPE_LABELS = {
  en: { work: 'Work', hot_work: 'Hot Work', lifting: 'Lifting', excavation: 'Excavation', confined_space: 'Confined Space' },
  ar: { work: 'أعمال', hot_work: 'أعمال ساخنة', lifting: 'رفع', excavation: 'حفر', confined_space: 'مساحة ضيقة' },
};
const PERMIT_TYPE_BADGE = { work: 'badge-info', hot_work: 'badge-danger', lifting: 'badge-warning', excavation: 'badge-warning', confined_space: 'badge-danger' };
const PERMIT_STATUS_LABELS = {
  en: { draft: 'Draft', pending_approval: 'Pending Approval', approved: 'Approved', active: 'Active', suspended: 'Suspended', closed: 'Closed', rejected: 'Rejected', expired: 'Expired' },
  ar: { draft: 'مسودة', pending_approval: 'بانتظار الموافقة', approved: 'معتمد', active: 'ساري', suspended: 'معلق', closed: 'مغلق', rejected: 'مرفوض', expired: 'منتهي' },
};
const PERMIT_STATUS_BADGE = { draft: 'badge-info', pending_approval: 'badge-warning', approved: 'badge-success', active: 'badge-success', suspended: 'badge-warning', closed: 'badge-info', rejected: 'badge-danger', expired: 'badge-danger' };

const SEVERITY_BADGE = { minor: 'badge-info', major: 'badge-warning', critical: 'badge-danger' };

function useProjectData(url) {
  const [rows, setRows] = useState([]);
  const rowsLength = useRef(0);
  rowsLength.current = rows.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const [path, query = ''] = url.split('?');
      const params = new URLSearchParams(query);
      params.set('limit', '200');
      params.set('offset', String(append ? rowsLength.current : 0));
      const r = await fetchApi(`${path}?${params}`);
      if (r.success) {
        setRows(current => append ? [...current, ...(r.data || [])] : (r.data || []));
        setTotalCount(r.totalCount ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { rows, loading, loadingMore, totalCount, reload: load, loadMore: () => load({ append: true }) };
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
      <Icon size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
      <p style={{ color: 'var(--color-text-secondary)' }}>{text}</p>
    </div>
  );
}

// ============ DASHBOARD ============

function HseDashboardTab({ projectId, locale, t }) {
  const [dash, setDash] = useState(null);
  useEffect(() => {
    const url = projectId ? `${API_URL}/hse/dashboard?project_id=${projectId}` : `${API_URL}/hse/dashboard`;
    fetchApi(url).then(r => r.success && setDash(r.data)).catch(e => console.error(e));
  }, [projectId]);

  if (!dash) return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>;
  const cards = [
    { label: t('hse.system.daysWithoutLti'), value: dash.days_without_lti ?? '—', color: 'var(--color-success)' },
    { label: t('hse.system.manHoursToday'), value: dash.man_hours_today, color: 'var(--color-accent)' },
    { label: t('hse.system.openIncidents'), value: dash.open_incidents, color: dash.open_incidents > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' },
    { label: t('hse.system.openNearMisses'), value: dash.open_near_misses, color: dash.open_near_misses > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
    { label: t('hse.system.activePermits'), value: dash.permits?.active ?? 0, color: 'var(--color-accent)' },
    { label: t('hse.system.permitsExpiringToday'), value: dash.permits?.expiring_today ?? 0, color: dash.permits?.expiring_today > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
    { label: t('hse.system.overdueActions'), value: dash.overdue_corrective_actions, color: dash.overdue_corrective_actions > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' },
  ];
  return (
    <div>
      <div className="stats-grid">
        {cards.map((c, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value" style={{ color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>
      {dash.permits?.expired_active > 0 && (
        <div className="card" style={{ marginTop: 12, borderLeft: '4px solid var(--color-danger, #e5534b)', padding: 12 }}>
          {t('hse.system.activePermitSPastValidityCloseOrRenewThem', { expired_active: dash.permits.expired_active })}
        </div>
      )}
    </div>
  );
}

// ============ PERMITS ============

function PermitsTab({ projectId, locale, t }) {
  const { rows, loading, loadingMore, totalCount, reload, loadMore } = useProjectData(`${API_URL}/hse/permits?project_id=${projectId}`);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ permit_type: 'work', title: '', description: '', valid_from: '', valid_to: '', conditions: '' });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/hse/permits`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), permit_type: form.permit_type, title: form.title,
        description: form.description, conditions: form.conditions,
        valid_from: form.valid_from || null, valid_to: form.valid_to || null,
      }) });
      setShowModal(false); setForm({ permit_type: 'work', title: '', description: '', valid_from: '', valid_to: '', conditions: '' });
      reload();
    } catch (err) { alert(err.message); }
  };

  const act = async (permit, path, body = {}) => {
    try {
      await fetchApi(`${API_URL}/hse/permits/${permit.id}/${path}`, { method: 'POST', body: JSON.stringify(body) });
      reload();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('hse.system.newPermit')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={t('hse.system.title')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <div className="responsive-grid responsive-grid--two" style={{ gap: '10px' }}>
            <select className="input" value={form.permit_type} onChange={e => setForm({ ...form, permit_type: e.target.value })}>
              {Object.entries(PERMIT_TYPE_LABELS[locale] || PERMIT_TYPE_LABELS.en).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="input" placeholder={t('hse.system.conditions')} value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} />
          </div>
          <textarea className="input" placeholder={t('hse.system.description')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="responsive-grid responsive-grid--two" style={{ gap: '10px' }}>
            <input className="input" type="date" title={t('hse.system.validFrom')} value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
            <input className="input" type="date" title={t('hse.system.validTo')} value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('hse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('hse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Flame} text={t('hse.system.noPermitsToWorkIssued')} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>{t('hse.system.permit')}</th><th>{t('hse.system.type')}</th><th>{t('hse.system.title')}</th>
              <th>{t('hse.system.validTo2')}</th><th>{t('hse.system.status')}</th><th>{t('common.actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{p.permit_number}</td>
                  <td><span className={`badge ${PERMIT_TYPE_BADGE[p.permit_type]}`}>{PERMIT_TYPE_LABELS[locale]?.[p.permit_type] || p.permit_type}</span></td>
                  <td>{p.title}</td>
                  <td>{fmtDate(p.valid_to)}</td>
                  <td><span className={`badge ${PERMIT_STATUS_BADGE[p.status]}`}>{PERMIT_STATUS_LABELS[locale]?.[p.status] || p.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {p.status === 'draft' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'submit')}>{t('hse.system.submit')}</button>}
                    {(p.status === 'pending_approval' || p.status === 'approved') && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'decision', { decision: 'approve' })}>{t('hse.system.approve')}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'decision', { decision: 'reject' })}>{t('hse.system.reject')}</button>{' '}
                      </>
                    )}
                    {p.status === 'active' && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'suspended' })}>{t('hse.system.suspend')}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'closed' })}>{t('hse.system.close')}</button>{' '}
                      </>
                    )}
                    {p.status === 'suspended' && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'active' })}>{t('hse.system.resume')}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'closed' })}>{t('hse.system.close')}</button>{' '}
                      </>
                    )}
                    {p.status === 'rejected' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'pending_approval' })}>{t('hse.system.reopen')}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/hse/permits/${p.id}/pdf`, `${p.permit_number}.pdf`)}><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={rows.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={loadMore} />
    </div>
  );
}

// ============ INCIDENTS ============

function IncidentsTab({ projectId, locale, t }) {
  const { rows, loading, loadingMore, totalCount, reload, loadMore } = useProjectData(`${API_URL}/hse/incidents?project_id=${projectId}`);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ description: '', incident_category: 'injury', severity: 'minor', is_lti: false, lost_days: 0, injured_party: '' });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/hse/incidents`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), description: form.description, incident_category: form.incident_category,
        severity: form.severity, is_lti: form.is_lti, lost_days: Number(form.lost_days) || 0, injured_party: form.injured_party,
      }) });
      setShowModal(false); setForm({ description: '', incident_category: 'injury', severity: 'minor', is_lti: false, lost_days: 0, injured_party: '' });
      reload();
    } catch (err) { alert(err.message); }
  };

  const act = async (row, status) => {
    try {
      await fetchApi(`${API_URL}/hse/incidents/${row.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      reload();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('hse.system.reportIncident')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <textarea className="input" required placeholder={t('hse.system.description')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="responsive-grid responsive-grid--three" style={{ gap: '10px' }}>
            <select className="input" value={form.incident_category} onChange={e => setForm({ ...form, incident_category: e.target.value })}>
              <option value="injury">{t('hse.system.injury')}</option><option value="environmental">{t('hse.system.environmental')}</option>
              <option value="property">{t('hse.system.property')}</option><option value="vehicle">{t('hse.system.vehicle')}</option><option value="other">{t('hse.system.other')}</option>
            </select>
            <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="minor">{t('hse.system.minor')}</option><option value="major">{t('hse.system.major')}</option><option value="critical">{t('hse.system.critical')}</option>
            </select>
            <input className="input" placeholder={t('hse.system.injuredParty')} value={form.injured_party} onChange={e => setForm({ ...form, injured_party: e.target.value })} />
          </div>
          <div className="responsive-grid responsive-grid--two" style={{ gap: '10px', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.is_lti} onChange={e => setForm({ ...form, is_lti: e.target.checked })} />
              {t('hse.system.lostTimeInjuryLti')}
            </label>
            <input className="input" type="number" min="0" placeholder={t('hse.system.lostDays')} value={form.lost_days} onChange={e => setForm({ ...form, lost_days: e.target.value })} disabled={!form.is_lti} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('hse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('hse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldAlert} text={t('hse.system.noIncidentsReported')} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>{t('hse.system.date')}</th><th>{t('hse.system.category')}</th>
              <th>{t('hse.system.description')}</th><th>{t('hse.system.severity')}</th>
              <th>{t('hse.system.lti')}</th><th>{t('hse.system.status')}</th><th>{t('common.actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id}>
                  <td>{fmtDate(i.incident_date)}</td>
                  <td>{i.incident_category || '-'}</td>
                  <td>{i.description}</td>
                  <td><span className={`badge ${SEVERITY_BADGE[i.severity]}`}>{translateEnum(t, 'severity', i.severity)}</span></td>
                  <td>{i.is_lti ? <span className="badge badge-danger">{t('hse.system.lti')}</span> : '-'}</td>
                  <td><span className="badge badge-info">{translateEnum(t, 'status', i.status)}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i.status === 'open' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(i, 'investigating')}>{t('hse.system.investigate')}</button>}
                    {(i.status === 'open' || i.status === 'investigating') && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(i, 'closed')}>{t('hse.system.close')}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/hse/incidents/${i.id}/pdf`, `incident-${i.id}.pdf`)}><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={rows.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={loadMore} />
    </div>
  );
}

// ============ NEAR MISSES ============

function NearMissesTab({ projectId, locale, t }) {
  const { rows, loading, loadingMore, totalCount, reload, loadMore } = useProjectData(`${API_URL}/hse/near-misses?project_id=${projectId}`);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ description: '', category: '', severity: 'minor', immediate_action: '' });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/hse/near-misses`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), description: form.description, category: form.category,
        severity: form.severity, immediate_action: form.immediate_action,
      }) });
      setShowModal(false); setForm({ description: '', category: '', severity: 'minor', immediate_action: '' });
      reload();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('hse.system.reportNearMiss')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <textarea className="input" required placeholder={t('hse.system.description')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="responsive-grid responsive-grid--two" style={{ gap: '10px' }}>
            <input className="input" placeholder={t('hse.system.category')} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="minor">{t('hse.system.minor')}</option><option value="major">{t('hse.system.major')}</option><option value="critical">{t('hse.system.critical')}</option>
            </select>
          </div>
          <textarea className="input" placeholder={t('hse.system.immediateAction')} value={form.immediate_action} onChange={e => setForm({ ...form, immediate_action: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('hse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('hse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={AlertTriangle} text={t('hse.system.noNearMissesReported')} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>{t('hse.system.nm')}</th><th>{t('hse.system.date')}</th><th>{t('hse.system.description')}</th>
              <th>{t('hse.system.severity')}</th><th>{t('hse.system.status')}</th><th>{t('common.actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(n => (
                <tr key={n.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{n.near_miss_number}</td>
                  <td>{fmtDate(n.incident_date)}</td>
                  <td>{n.description}</td>
                  <td><span className={`badge ${SEVERITY_BADGE[n.severity]}`}>{translateEnum(t, 'severity', n.severity)}</span></td>
                  <td><span className="badge badge-info">{translateEnum(t, 'status', n.status)}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {n.status === 'open' && <button className="btn" style={{ padding: '4px 10px' }} onClick={async () => { try { await fetchApi(`${API_URL}/hse/near-misses/${n.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'closed' }) }); reload(); } catch (e) { alert(e.message); } }}>{t('hse.system.close')}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/hse/near-misses/${n.id}/pdf`, `${n.near_miss_number}.pdf`)}><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={rows.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={loadMore} />
    </div>
  );
}

// ============ JSA / RISK ASSESSMENTS ============

function JsaTab({ projectId, locale, t }) {
  const [kind, setKind] = useState('jsas');
  const { rows, loading, loadingMore, totalCount, reload, loadMore } = useProjectData(`${API_URL}/hse/${kind}?project_id=${projectId}`);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', activity: '', likelihood: 'medium', severity: 'medium', controls: '' });

  const submit = async (e) => {
    e.preventDefault();
    try {
      const url = kind === 'jsas' ? `${API_URL}/hse/jsas` : `${API_URL}/hse/risk-assessments`;
      await fetchApi(url, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), title: form.title, activity: form.activity, controls: form.controls,
        ...(kind === 'risk-assessments' ? { likelihood: form.likelihood, severity: form.severity } : {}),
      }) });
      setShowModal(false); setForm({ title: '', activity: '', likelihood: 'medium', severity: 'medium', controls: '' });
      reload();
    } catch (err) { alert(err.message); }
  };

  const act = async (row, status) => {
    try {
      await fetchApi(`${API_URL}/hse/${kind === 'jsas' ? `jsas/${row.id}/status` : `risk-assessments/${row.id}/status`}`, { method: 'POST', body: JSON.stringify({ status }) });
      reload();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn ${kind === 'jsas' ? 'btn-primary' : ''}`} onClick={() => setKind('jsas')} style={{ padding: '6px 16px', fontSize: '13px' }}>{t('hse.system.jsa')}</button>
          <button className={`btn ${kind === 'risk-assessments' ? 'btn-primary' : ''}`} onClick={() => setKind('risk-assessments')} style={{ padding: '6px 16px', fontSize: '13px' }}>{t('hse.system.riskAssessments')}</button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('hse.system.new')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={t('hse.system.title')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder={t('hse.system.activity')} value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value })} />
          {kind === 'risk-assessments' && (
            <div className="responsive-grid responsive-grid--two" style={{ gap: '10px' }}>
              <select className="input" value={form.likelihood} onChange={e => setForm({ ...form, likelihood: e.target.value })}>
                <option value="low">{t('hse.system.likelihoodLow')}</option><option value="medium">{t('hse.system.likelihoodMedium')}</option><option value="high">{t('hse.system.likelihoodHigh')}</option>
              </select>
              <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                <option value="low">{t('hse.system.severityLow')}</option><option value="medium">{t('hse.system.severityMedium')}</option><option value="high">{t('hse.system.severityHigh')}</option>
              </select>
            </div>
          )}
          <textarea className="input" placeholder={t('hse.system.controls')} value={form.controls} onChange={e => setForm({ ...form, controls: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('hse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('hse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Activity} text={t('hse.system.noRecordsYet')} />
      ) : kind === 'jsas' ? (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>{t('hse.system.title')}</th><th>{t('hse.system.activity')}</th><th>{t('hse.system.hazards')}</th><th>{t('hse.system.status')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {rows.map(j => (
                <tr key={j.id}>
                  <td style={{ fontWeight: 500 }}>{j.title}</td>
                  <td>{j.activity || '-'}</td>
                  <td>{(j.hazards || []).length}</td>
                  <td><span className="badge badge-info">{translateEnum(t, 'status', j.status)}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {j.status === 'draft' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(j, 'reviewed')}>{t('hse.system.review')}</button>}
                    {j.status === 'reviewed' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(j, 'approved')}>{t('hse.system.approve2')}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/hse/jsas/${j.id}/pdf`, `jsa-${j.id}.pdf`)}><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>{t('hse.system.title')}</th><th>{t('hse.system.activity')}</th><th>{t('hse.system.likelihood')}</th><th>{t('hse.system.severity')}</th><th>{t('hse.system.risk')}</th></tr></thead>
            <tbody>
              {rows.map(ra => (
                <tr key={ra.id}>
                  <td style={{ fontWeight: 500 }}>{ra.title}</td>
                  <td>{ra.activity || '-'}</td>
                  <td>{ra.likelihood}</td>
                  <td>{translateEnum(t, 'severity', ra.severity)}</td>
                  <td><span className={`badge ${ra.risk_level === 'low' ? 'badge-success' : ra.risk_level === 'critical' ? 'badge-danger' : 'badge-warning'}`}>{ra.risk_level}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={rows.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={loadMore} />
    </div>
  );
}

// ============ REGISTERS (inductions / toolbox / PPE / equipment / drills / inspections) ============

function RegistersTab({ projectId, locale, t }) {
  const [kind, setKind] = useState('inspections');
  const { rows, loading, loadingMore, totalCount, reload, loadMore } = useProjectData(`${API_URL}/hse/${kind}?project_id=${projectId}`);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', person_name: '', item: '', equipment_name: '', drill_type: 'fire', value: '' });

  const KINDS = [
    { key: 'inspections', label: t('hse.system.inspections') },
    { key: 'inductions', label: t('hse.system.inductions') },
    { key: 'toolbox-talks', label: t('hse.system.toolboxTalks') },
    { key: 'ppe-records', label: t('hse.system.personalProtectiveEquipment') },
    { key: 'equipment-inspections', label: t('hse.system.equipment') },
    { key: 'emergency-drills', label: t('hse.system.drills') },
  ];

  const submit = async (e) => {
    e.preventDefault();
    try {
      let body = { project_id: Number(projectId) };
      if (kind === 'inspections') body = { ...body, findings: form.value };
      if (kind === 'inductions') body = { ...body, person_name: form.person_name };
      if (kind === 'toolbox-talks') body = { ...body, title: form.title, attendees_count: Number(form.value || 0) };
      if (kind === 'ppe-records') body = { ...body, person_name: form.person_name, item: form.item };
      if (kind === 'equipment-inspections') body = { ...body, equipment_name: form.equipment_name, inspector: form.person_name };
      if (kind === 'emergency-drills') body = { ...body, drill_type: form.drill_type, participants_count: Number(form.value || 0) };
      await fetchApi(`${API_URL}/hse/${kind}`, { method: 'POST', body: JSON.stringify(body) });
      setShowModal(false);
      reload();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {KINDS.map(k => (
            <button key={k.key} className={`btn ${kind === k.key ? 'btn-primary' : ''}`} onClick={() => setKind(k.key)} style={{ padding: '6px 14px', fontSize: '13px' }}>{k.label}</button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('hse.system.add')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px', maxWidth: 480 }}>
          {kind === 'inspections' && <input className="input" placeholder={t('hse.system.findings')} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />}
          {kind === 'inductions' && <input className="input" placeholder={t('hse.system.personName')} value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} required />}
          {kind === 'toolbox-talks' && (
            <>
              <input className="input" placeholder={t('hse.system.title')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              <input className="input" type="number" placeholder={t('hse.system.attendees')} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
            </>
          )}
          {kind === 'ppe-records' && (
            <>
              <input className="input" placeholder={t('hse.system.personName')} value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} required />
              <input className="input" placeholder={t('hse.system.ppeItem')} value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} required />
            </>
          )}
          {kind === 'equipment-inspections' && <input className="input" placeholder={t('hse.system.equipmentName')} value={form.equipment_name} onChange={e => setForm({ ...form, equipment_name: e.target.value })} required />}
          {kind === 'emergency-drills' && (
            <>
              <input className="input" placeholder={t('hse.system.drillType')} value={form.drill_type} onChange={e => setForm({ ...form, drill_type: e.target.value })} required />
              <input className="input" type="number" placeholder={t('hse.system.participants')} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
            </>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('hse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('hse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} text={t('hse.system.noRecordsInThisRegister')} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              {kind === 'inspections' && <><th>{t('hse.system.date')}</th><th>{t('hse.system.type')}</th><th>{t('hse.system.status')}</th><th>{t('hse.system.findings')}</th></>}
              {kind === 'inductions' && <><th>{t('hse.system.person')}</th><th>{t('hse.system.organization')}</th><th>{t('hse.system.date')}</th><th>{t('hse.system.type')}</th></>}
              {kind === 'toolbox-talks' && <><th>{t('hse.system.title')}</th><th>{t('hse.system.topic')}</th><th>{t('hse.system.attendees2')}</th><th>{t('hse.system.date')}</th></>}
              {kind === 'ppe-records' && <><th>{t('hse.system.person')}</th><th>{t('hse.system.item')}</th><th>{t('hse.system.qty')}</th><th>{t('hse.system.date')}</th></>}
              {kind === 'equipment-inspections' && <><th>{t('hse.system.equipment2')}</th><th>{t('hse.system.date')}</th><th>{t('hse.system.result')}</th><th>{t('hse.system.defects')}</th></>}
              {kind === 'emergency-drills' && <><th>{t('hse.system.type')}</th><th>{t('hse.system.date')}</th><th>{t('hse.system.participants')}</th><th>{t('hse.system.findings')}</th></>}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  {kind === 'inspections' && <><td>{fmtDate(r.inspection_date)}</td><td>{r.inspection_type || t('hse.system.site')}</td><td><span className="badge badge-info">{translateEnum(t, 'status', r.status)}</span></td><td>{r.findings || '-'}</td></>}
                  {kind === 'inductions' && <><td>{r.person_name}</td><td>{r.organization_name || '-'}</td><td>{fmtDate(r.induction_date)}</td><td>{r.induction_type}</td></>}
                  {kind === 'toolbox-talks' && <><td>{r.title}</td><td>{r.topic || '-'}</td><td>{r.attendees_count}</td><td>{fmtDate(r.held_at)}</td></>}
                  {kind === 'ppe-records' && <><td>{r.person_name}</td><td>{r.item}</td><td>{r.quantity}</td><td>{fmtDate(r.issue_date)}</td></>}
                  {kind === 'equipment-inspections' && <><td>{r.equipment_name}</td><td>{fmtDate(r.inspection_date)}</td><td><span className={`badge ${r.result === 'pass' ? 'badge-success' : 'badge-danger'}`}>{translateEnum(t, 'result', r.result)}</span></td><td>{r.defects || '-'}</td></>}
                  {kind === 'emergency-drills' && <><td>{r.drill_type}</td><td>{fmtDate(r.drill_date)}</td><td>{r.participants_count}</td><td>{r.findings || '-'}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={rows.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={loadMore} />
    </div>
  );
}

// ============ PAGE ============

export default function HSE() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState('dashboard');

  const TABS = [
    { key: 'dashboard', icon: Activity, label: t('hse.system.hseDashboard') },
    { key: 'permits', icon: Flame, label: t('hse.system.permits') },
    { key: 'incidents', icon: ShieldAlert, label: t('hse.incidents') },
    { key: 'nearmisses', icon: AlertTriangle, label: t('hse.system.nearMisses') },
    { key: 'jsa', icon: HardHat, label: t('hse.system.jsaRisk') },
    { key: 'registers', icon: Users, label: t('hse.system.registers') },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /></button>
        <div>
          <h1>{t('hse.system.hse')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('hse.system.permitsIncidentsSafetyRegisters')}
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

      {tab === 'dashboard' && <HseDashboardTab projectId={id} locale={locale} t={t} />}
      {tab === 'permits' && <PermitsTab projectId={id} locale={locale} t={t} />}
      {tab === 'incidents' && <IncidentsTab projectId={id} locale={locale} t={t} />}
      {tab === 'nearmisses' && <NearMissesTab projectId={id} locale={locale} t={t} />}
      {tab === 'jsa' && <JsaTab projectId={id} locale={locale} t={t} />}
      {tab === 'registers' && <RegistersTab projectId={id} locale={locale} t={t} />}
    </div>
  );
}
