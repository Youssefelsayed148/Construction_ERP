// Phase 20 — HSE workspace: dashboard, permits, incidents, near misses,
// JSA/risk assessments, inspections, inductions, toolbox talks, PPE,
// equipment inspections, emergency drills. Every tab renders an explicit
// empty state (the zero-records requirement), never a blank screen.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Plus, HardHat, Flame, AlertTriangle, ShieldAlert, Users, Download, Activity } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(url);
      if (r.success) setRows(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  return { rows, loading, reload: load };
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

function HseDashboardTab({ projectId, locale }) {
  const [dash, setDash] = useState(null);
  useEffect(() => {
    const url = projectId ? `${API_URL}/hse/dashboard?project_id=${projectId}` : `${API_URL}/hse/dashboard`;
    fetchApi(url).then(r => r.success && setDash(r.data)).catch(e => console.error(e));
  }, [projectId]);

  if (!dash) return <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>;
  const cards = [
    { label: locale === 'ar' ? 'أيام بدون حادث فقدان وقت' : 'Days without LTI', value: dash.days_without_lti ?? '—', color: 'var(--color-success)' },
    { label: locale === 'ar' ? 'ساعات عمل (اليوم)' : 'Man-hours today', value: dash.man_hours_today, color: 'var(--color-accent)' },
    { label: locale === 'ar' ? 'حوادث مفتوحة' : 'Open incidents', value: dash.open_incidents, color: dash.open_incidents > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' },
    { label: locale === 'ar' ? 'حوادث شبه مفتوحة' : 'Open near misses', value: dash.open_near_misses, color: dash.open_near_misses > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
    { label: locale === 'ar' ? 'تصاريح سارية' : 'Active permits', value: dash.permits?.active ?? 0, color: 'var(--color-accent)' },
    { label: locale === 'ar' ? 'تصاريح تنتهي اليوم' : 'Permits expiring today', value: dash.permits?.expiring_today ?? 0, color: dash.permits?.expiring_today > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
    { label: locale === 'ar' ? 'إجراءات متأخرة' : 'Overdue actions', value: dash.overdue_corrective_actions, color: dash.overdue_corrective_actions > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' },
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
          {locale === 'ar' ? `${dash.permits.expired_active} تصريح نشط انتهت صلاحيته — يجب إغلاقه` : `${dash.permits.expired_active} active permit(s) past validity — close or renew them.`}
        </div>
      )}
    </div>
  );
}

// ============ PERMITS ============

function PermitsTab({ projectId, locale, t }) {
  const { rows, loading, reload } = useProjectData(`${API_URL}/hse/permits?project_id=${projectId}`);
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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'تصريح جديد' : 'New Permit'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={locale === 'ar' ? 'العنوان' : 'Title'} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <select className="input" value={form.permit_type} onChange={e => setForm({ ...form, permit_type: e.target.value })}>
              {Object.entries(PERMIT_TYPE_LABELS[locale] || PERMIT_TYPE_LABELS.en).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className="input" placeholder={locale === 'ar' ? 'الشروط' : 'Conditions'} value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} />
          </div>
          <textarea className="input" placeholder={locale === 'ar' ? 'الوصف' : 'Description'} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <input className="input" type="date" title="Valid from" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} />
            <input className="input" type="date" title="Valid to" value={form.valid_to} onChange={e => setForm({ ...form, valid_to: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Flame} text={locale === 'ar' ? 'لا توجد تصاريح.' : 'No permits to work issued.'} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>Permit</th><th>{locale === 'ar' ? 'النوع' : 'Type'}</th><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th>
              <th>{locale === 'ar' ? 'صالح حتى' : 'Valid to'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th>
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
                    {p.status === 'draft' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'submit')}>{locale === 'ar' ? 'إرسال' : 'Submit'}</button>}
                    {(p.status === 'pending_approval' || p.status === 'approved') && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'decision', { decision: 'approve' })}>{locale === 'ar' ? 'موافقة' : 'Approve'}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'decision', { decision: 'reject' })}>{locale === 'ar' ? 'رفض' : 'Reject'}</button>{' '}
                      </>
                    )}
                    {p.status === 'active' && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'suspended' })}>{locale === 'ar' ? 'إيقاف' : 'Suspend'}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'closed' })}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>{' '}
                      </>
                    )}
                    {p.status === 'suspended' && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'active' })}>{locale === 'ar' ? 'استئناف' : 'Resume'}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'closed' })}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>{' '}
                      </>
                    )}
                    {p.status === 'rejected' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'status', { status: 'pending_approval' })}>{locale === 'ar' ? 'إعادة' : 'Reopen'}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/hse/permits/${p.id}/pdf`, `${p.permit_number}.pdf`)}><Download size={14} /></button>
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

// ============ INCIDENTS ============

function IncidentsTab({ projectId, locale, t }) {
  const { rows, loading, reload } = useProjectData(`${API_URL}/hse/incidents?project_id=${projectId}`);
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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'حادث جديد' : 'Report Incident'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <textarea className="input" required placeholder={locale === 'ar' ? 'الوصف' : 'Description'} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <select className="input" value={form.incident_category} onChange={e => setForm({ ...form, incident_category: e.target.value })}>
              <option value="injury">Injury</option><option value="environmental">Environmental</option>
              <option value="property">Property</option><option value="vehicle">Vehicle</option><option value="other">Other</option>
            </select>
            <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
            </select>
            <input className="input" placeholder={locale === 'ar' ? 'المتضرر' : 'Injured party'} value={form.injured_party} onChange={e => setForm({ ...form, injured_party: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.is_lti} onChange={e => setForm({ ...form, is_lti: e.target.checked })} />
              {locale === 'ar' ? 'حادث فقدان وقت (LTI)' : 'Lost-time injury (LTI)'}
            </label>
            <input className="input" type="number" min="0" placeholder="Lost days" value={form.lost_days} onChange={e => setForm({ ...form, lost_days: e.target.value })} disabled={!form.is_lti} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ShieldAlert} text={locale === 'ar' ? 'لا توجد حوادث.' : 'No incidents reported.'} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th><th>{locale === 'ar' ? 'التصنيف' : 'Category'}</th>
              <th>{locale === 'ar' ? 'الوصف' : 'Description'}</th><th>{locale === 'ar' ? 'الخطورة' : 'Severity'}</th>
              <th>LTI</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id}>
                  <td>{fmtDate(i.incident_date)}</td>
                  <td>{i.incident_category || '-'}</td>
                  <td>{i.description}</td>
                  <td><span className={`badge ${SEVERITY_BADGE[i.severity]}`}>{i.severity}</span></td>
                  <td>{i.is_lti ? <span className="badge badge-danger">LTI</span> : '-'}</td>
                  <td><span className="badge badge-info">{i.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i.status === 'open' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(i, 'investigating')}>{locale === 'ar' ? 'تحقيق' : 'Investigate'}</button>}
                    {(i.status === 'open' || i.status === 'investigating') && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(i, 'closed')}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/hse/incidents/${i.id}/pdf`, `incident-${i.id}.pdf`)}><Download size={14} /></button>
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

// ============ NEAR MISSES ============

function NearMissesTab({ projectId, locale, t }) {
  const { rows, loading, reload } = useProjectData(`${API_URL}/hse/near-misses?project_id=${projectId}`);
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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'حدث وشيك' : 'Report Near Miss'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <textarea className="input" required placeholder={locale === 'ar' ? 'الوصف' : 'Description'} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <input className="input" placeholder={locale === 'ar' ? 'التصنيف' : 'Category'} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
            </select>
          </div>
          <textarea className="input" placeholder={locale === 'ar' ? 'الإجراء الفوري' : 'Immediate action'} value={form.immediate_action} onChange={e => setForm({ ...form, immediate_action: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={AlertTriangle} text={locale === 'ar' ? 'لا توجد أحداث وشيك.' : 'No near misses reported.'} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>NM</th><th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th><th>{locale === 'ar' ? 'الوصف' : 'Description'}</th>
              <th>{locale === 'ar' ? 'الخطورة' : 'Severity'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(n => (
                <tr key={n.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{n.near_miss_number}</td>
                  <td>{fmtDate(n.incident_date)}</td>
                  <td>{n.description}</td>
                  <td><span className={`badge ${SEVERITY_BADGE[n.severity]}`}>{n.severity}</span></td>
                  <td><span className="badge badge-info">{n.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {n.status === 'open' && <button className="btn" style={{ padding: '4px 10px' }} onClick={async () => { try { await fetchApi(`${API_URL}/hse/near-misses/${n.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'closed' }) }); reload(); } catch (e) { alert(e.message); } }}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/hse/near-misses/${n.id}/pdf`, `${n.near_miss_number}.pdf`)}><Download size={14} /></button>
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

// ============ JSA / RISK ASSESSMENTS ============

function JsaTab({ projectId, locale, t }) {
  const [kind, setKind] = useState('jsas');
  const { rows, loading, reload } = useProjectData(`${API_URL}/hse/${kind}?project_id=${projectId}`);
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
          <button className={`btn ${kind === 'jsas' ? 'btn-primary' : ''}`} onClick={() => setKind('jsas')} style={{ padding: '6px 16px', fontSize: '13px' }}>JSA</button>
          <button className={`btn ${kind === 'risk-assessments' ? 'btn-primary' : ''}`} onClick={() => setKind('risk-assessments')} style={{ padding: '6px 16px', fontSize: '13px' }}>{locale === 'ar' ? 'تقييم المخاطر' : 'Risk Assessments'}</button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'جديد' : 'New'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={locale === 'ar' ? 'العنوان' : 'Title'} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder={locale === 'ar' ? 'النشاط' : 'Activity'} value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value })} />
          {kind === 'risk-assessments' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <select className="input" value={form.likelihood} onChange={e => setForm({ ...form, likelihood: e.target.value })}>
                <option value="low">Likelihood: Low</option><option value="medium">Likelihood: Medium</option><option value="high">Likelihood: High</option>
              </select>
              <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                <option value="low">Severity: Low</option><option value="medium">Severity: Medium</option><option value="high">Severity: High</option>
              </select>
            </div>
          )}
          <textarea className="input" placeholder={locale === 'ar' ? 'إجراءات التحكم' : 'Controls'} value={form.controls} onChange={e => setForm({ ...form, controls: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Activity} text={locale === 'ar' ? 'لا توجد سجلات.' : 'No records yet.'} />
      ) : kind === 'jsas' ? (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th><th>{locale === 'ar' ? 'النشاط' : 'Activity'}</th><th>{locale === 'ar' ? 'المخاطر' : 'Hazards'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {rows.map(j => (
                <tr key={j.id}>
                  <td style={{ fontWeight: 500 }}>{j.title}</td>
                  <td>{j.activity || '-'}</td>
                  <td>{(j.hazards || []).length}</td>
                  <td><span className="badge badge-info">{j.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {j.status === 'draft' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(j, 'reviewed')}>{locale === 'ar' ? 'مراجعة' : 'Review'}</button>}
                    {j.status === 'reviewed' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(j, 'approved')}>{locale === 'ar' ? 'اعتماد' : 'Approve'}</button>}
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
            <thead><tr><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th><th>{locale === 'ar' ? 'النشاط' : 'Activity'}</th><th>{locale === 'ar' ? 'الاحتمالية' : 'Likelihood'}</th><th>{locale === 'ar' ? 'الخطورة' : 'Severity'}</th><th>{locale === 'ar' ? 'مستوى الخطر' : 'Risk'}</th></tr></thead>
            <tbody>
              {rows.map(ra => (
                <tr key={ra.id}>
                  <td style={{ fontWeight: 500 }}>{ra.title}</td>
                  <td>{ra.activity || '-'}</td>
                  <td>{ra.likelihood}</td>
                  <td>{ra.severity}</td>
                  <td><span className={`badge ${ra.risk_level === 'low' ? 'badge-success' : ra.risk_level === 'critical' ? 'badge-danger' : 'badge-warning'}`}>{ra.risk_level}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============ REGISTERS (inductions / toolbox / PPE / equipment / drills / inspections) ============

function RegistersTab({ projectId, locale, t }) {
  const [kind, setKind] = useState('inspections');
  const { rows, loading, reload } = useProjectData(`${API_URL}/hse/${kind}?project_id=${projectId}`);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', person_name: '', item: '', equipment_name: '', drill_type: 'fire', value: '' });

  const KINDS = [
    { key: 'inspections', label: locale === 'ar' ? 'التفتيش' : 'Inspections' },
    { key: 'inductions', label: locale === 'ar' ? 'التعريفات' : 'Inductions' },
    { key: 'toolbox-talks', label: locale === 'ar' ? 'التوعية' : 'Toolbox Talks' },
    { key: 'ppe-records', label: 'PPE' },
    { key: 'equipment-inspections', label: locale === 'ar' ? 'فحص المعدات' : 'Equipment' },
    { key: 'emergency-drills', label: locale === 'ar' ? 'تدريبات' : 'Drills' },
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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'إضافة' : 'Add'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px', maxWidth: 480 }}>
          {kind === 'inspections' && <input className="input" placeholder={locale === 'ar' ? 'الملاحظات' : 'Findings'} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />}
          {kind === 'inductions' && <input className="input" placeholder={locale === 'ar' ? 'الشخص' : 'Person name'} value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} required />}
          {kind === 'toolbox-talks' && (
            <>
              <input className="input" placeholder={locale === 'ar' ? 'العنوان' : 'Title'} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
              <input className="input" type="number" placeholder={locale === 'ar' ? 'عدد الحضور' : 'Attendees'} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
            </>
          )}
          {kind === 'ppe-records' && (
            <>
              <input className="input" placeholder={locale === 'ar' ? 'الشخص' : 'Person name'} value={form.person_name} onChange={e => setForm({ ...form, person_name: e.target.value })} required />
              <input className="input" placeholder={locale === 'ar' ? 'الصنف' : 'PPE item'} value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} required />
            </>
          )}
          {kind === 'equipment-inspections' && <input className="input" placeholder={locale === 'ar' ? 'اسم المعدة' : 'Equipment name'} value={form.equipment_name} onChange={e => setForm({ ...form, equipment_name: e.target.value })} required />}
          {kind === 'emergency-drills' && (
            <>
              <input className="input" placeholder={locale === 'ar' ? 'نوع التدريب' : 'Drill type'} value={form.drill_type} onChange={e => setForm({ ...form, drill_type: e.target.value })} required />
              <input className="input" type="number" placeholder={locale === 'ar' ? 'المشاركون' : 'Participants'} value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
            </>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} text={locale === 'ar' ? 'لا توجد سجلات.' : 'No records in this register.'} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              {kind === 'inspections' && <><th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th><th>{locale === 'ar' ? 'النوع' : 'Type'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{locale === 'ar' ? 'الملاحظات' : 'Findings'}</th></>}
              {kind === 'inductions' && <><th>{locale === 'ar' ? 'الشخص' : 'Person'}</th><th>{locale === 'ar' ? 'الجهة' : 'Organization'}</th><th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th><th>{locale === 'ar' ? 'النوع' : 'Type'}</th></>}
              {kind === 'toolbox-talks' && <><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th><th>{locale === 'ar' ? 'الموضوع' : 'Topic'}</th><th>{locale === 'ar' ? 'الحضور' : 'Attendees'}</th><th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th></>}
              {kind === 'ppe-records' && <><th>{locale === 'ar' ? 'الشخص' : 'Person'}</th><th>{locale === 'ar' ? 'الصنف' : 'Item'}</th><th>{locale === 'ar' ? 'الكمية' : 'Qty'}</th><th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th></>}
              {kind === 'equipment-inspections' && <><th>{locale === 'ar' ? 'المعدة' : 'Equipment'}</th><th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th><th>{locale === 'ar' ? 'النتيجة' : 'Result'}</th><th>{locale === 'ar' ? 'العيوب' : 'Defects'}</th></>}
              {kind === 'emergency-drills' && <><th>{locale === 'ar' ? 'النوع' : 'Type'}</th><th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th><th>{locale === 'ar' ? 'المشاركون' : 'Participants'}</th><th>{locale === 'ar' ? 'الملاحظات' : 'Findings'}</th></>}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  {kind === 'inspections' && <><td>{fmtDate(r.inspection_date)}</td><td>{r.inspection_type || 'site'}</td><td><span className="badge badge-info">{r.status}</span></td><td>{r.findings || '-'}</td></>}
                  {kind === 'inductions' && <><td>{r.person_name}</td><td>{r.organization_name || '-'}</td><td>{fmtDate(r.induction_date)}</td><td>{r.induction_type}</td></>}
                  {kind === 'toolbox-talks' && <><td>{r.title}</td><td>{r.topic || '-'}</td><td>{r.attendees_count}</td><td>{fmtDate(r.held_at)}</td></>}
                  {kind === 'ppe-records' && <><td>{r.person_name}</td><td>{r.item}</td><td>{r.quantity}</td><td>{fmtDate(r.issue_date)}</td></>}
                  {kind === 'equipment-inspections' && <><td>{r.equipment_name}</td><td>{fmtDate(r.inspection_date)}</td><td><span className={`badge ${r.result === 'pass' ? 'badge-success' : 'badge-danger'}`}>{r.result}</span></td><td>{r.defects || '-'}</td></>}
                  {kind === 'emergency-drills' && <><td>{r.drill_type}</td><td>{fmtDate(r.drill_date)}</td><td>{r.participants_count}</td><td>{r.findings || '-'}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    { key: 'dashboard', icon: Activity, label: locale === 'ar' ? 'لوحة HSE' : 'HSE Dashboard' },
    { key: 'permits', icon: Flame, label: locale === 'ar' ? 'تصاريح العمل' : 'Permits' },
    { key: 'incidents', icon: ShieldAlert, label: locale === 'ar' ? 'الحوادث' : 'Incidents' },
    { key: 'nearmisses', icon: AlertTriangle, label: locale === 'ar' ? 'الأحداث الوشيكة' : 'Near Misses' },
    { key: 'jsa', icon: HardHat, label: locale === 'ar' ? 'JSA والمخاطر' : 'JSA / Risk' },
    { key: 'registers', icon: Users, label: locale === 'ar' ? 'السجلات' : 'Registers' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /></button>
        <div>
          <h1>{locale === 'ar' ? 'الصحة والسلامة' : 'HSE'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'التصاريح والحوادث والسجلات السلامة' : 'Permits, incidents & safety registers'}
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

      {tab === 'dashboard' && <HseDashboardTab projectId={id} locale={locale} />}
      {tab === 'permits' && <PermitsTab projectId={id} locale={locale} t={t} />}
      {tab === 'incidents' && <IncidentsTab projectId={id} locale={locale} t={t} />}
      {tab === 'nearmisses' && <NearMissesTab projectId={id} locale={locale} t={t} />}
      {tab === 'jsa' && <JsaTab projectId={id} locale={locale} t={t} />}
      {tab === 'registers' && <RegistersTab projectId={id} locale={locale} t={t} />}
    </div>
  );
}
