import { formatDate as sharedDate } from '../utils/formatters';
import { translateEnum } from '../i18n/enums';
import { apiFetch, apiResponseJson } from '../services/apiClient';
// Phase 19 — QA/QC extended tabs: ITP, WIR, Punch items, Checklists,
// Corrective/Preventive actions, Mock-ups, Calibration records.
// Rendered inside the QHSE page's tab strip; every tab renders an explicit
// empty state (the zero-records requirement), never a blank screen.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import WorkPackageSelect from '../components/project/WorkPackageSelect';
import LoadMore from '../components/common/LoadMore';
import { Plus, ClipboardCheck, ListChecks, Wrench, PackageCheck, Gauge, ShieldCheck, Download } from 'lucide-react';

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

const WIR_STATUS_LABELS = {
  en: { draft: 'Draft', submitted: 'QA/QC Review', qa_qc_review: 'QA/QC Review', pm_review: 'PM Review', consultant_review: 'Consultant', approved: 'Approved', approved_with_comments: 'Approved with Comments', rejected: 'Rejected' },
  ar: { draft: 'مسودة', submitted: 'مراجعة الجودة', qa_qc_review: 'مراجعة الجودة', pm_review: 'مراجعة مدير المشروع', consultant_review: 'الاستشاري', approved: 'مقبول', approved_with_comments: 'مقبول بتعليقات', rejected: 'مرفوض' },
};
const WIR_STATUS_BADGE = { draft: 'badge-info', submitted: 'badge-warning', qa_qc_review: 'badge-warning', pm_review: 'badge-info', consultant_review: 'badge-info', approved: 'badge-success', approved_with_comments: 'badge-success', rejected: 'badge-danger' };

const POINT_TYPE_BADGE = { hold: 'badge-danger', witness: 'badge-warning', review: 'badge-info' };

const PUNCH_STATUS_LABELS = {
  en: { open: 'Open', assigned: 'Assigned', rectified: 'Rectified', verified: 'Verified', closed: 'Closed' },
  ar: { open: 'مفتوح', assigned: 'مُسند', rectified: 'تم التصحيح', verified: 'تم التحقق', closed: 'مغلق' },
};
const PUNCH_STATUS_BADGE = { open: 'badge-danger', assigned: 'badge-warning', rectified: 'badge-info', verified: 'badge-success', closed: 'badge-info' };

const CAPA_STATUS_LABELS = {
  en: { open: 'Open', in_progress: 'In Progress', completed: 'Completed', verified: 'Verified' },
  ar: { open: 'مفتوح', in_progress: 'قيد التنفيذ', completed: 'مكتمل', verified: 'تم التحقق' },
};
const CAPA_STATUS_BADGE = { open: 'badge-danger', in_progress: 'badge-warning', completed: 'badge-info', verified: 'badge-success' };

const MOCKUP_STATUS_LABELS = {
  en: { proposed: 'Proposed', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected', rework: 'Rework' },
  ar: { proposed: 'مقترح', under_review: 'قيد المراجعة', approved: 'مقبول', rejected: 'مرفوض', rework: 'إعادة عمل' },
};
const MOCKUP_STATUS_BADGE = { proposed: 'badge-info', under_review: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger', rework: 'badge-warning' };

// ============ ITP ============

export function ItpTab({ projectId, locale, t }) {
  const [itps, setItps] = useState([]);
  const rowsLength = useRef(0); rowsLength.current = itps.length;
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [points, setPoints] = useState([]);
  const [form, setForm] = useState({ title: '', discipline: '', work_package_id: null, project_location_id: '' });
  const [pointFormTarget, setPointFormTarget] = useState(null);
  const [pointForm, setPointForm] = useState({ title: '', point_type: 'review', acceptance_criteria: '' });
  const [pointError, setPointError] = useState('');

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const [r, loc] = await Promise.all([
        fetchApi(`${API_URL}/qhse/itps?${params}`),
        fetchApi(`${API_URL}/locations/project/${projectId}`).catch(() => ({ data: [] })),
      ]);
      if (r.success) { setItps(current => append ? [...current, ...(r.data || [])] : (r.data || [])); setTotalCount(r.totalCount ?? null); }
      setLocations(loc.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const openPoints = async (itp) => {
    if (expanded === itp.id) { setExpanded(null); return; }
    setExpanded(itp.id);
    try {
      const r = await fetchApi(`${API_URL}/qhse/itps/${itp.id}`);
      setPoints(r.success ? (r.data.points || []) : []);
    } catch (e) { setPoints([]); }
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/qhse/itps`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), title: form.title, discipline: form.discipline,
        work_package_id: form.work_package_id, project_location_id: form.project_location_id ? Number(form.project_location_id) : null,
        points: [],
      }) });
      setShowModal(false); setForm({ title: '', discipline: '', work_package_id: null, project_location_id: '' });
      load();
    } catch (err) { alert(err.message); }
  };

  const addPoint = (itpId) => {
    setPointFormTarget(itpId);
    setPointForm({ title: '', point_type: 'review', acceptance_criteria: '' });
    setPointError('');
  };

  const submitPoint = async (event) => {
    event.preventDefault();
    try {
      await fetchApi(`${API_URL}/qhse/itps/${pointFormTarget}/points`, { method: 'POST', body: JSON.stringify(pointForm) });
      const r = await fetchApi(`${API_URL}/qhse/itps/${pointFormTarget}`);
      setPoints(r.success ? (r.data.points || []) : []);
      setPointFormTarget(null);
      load();
    } catch (err) { setPointError(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('qhse.system.newItp')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={t('qhse.certificates.name')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <div className="responsive-grid responsive-grid--two" style={{ gap: '10px' }}>
            <input className="input" placeholder={t('qhse.system.discipline')} value={form.discipline} onChange={e => setForm({ ...form, discipline: e.target.value })} />
            <WorkPackageSelect projectId={projectId} value={form.work_package_id} onChange={(v) => setForm({ ...form, work_package_id: v })} />
          </div>
          <select className="input" value={form.project_location_id} onChange={e => setForm({ ...form, project_location_id: e.target.value })}>
            <option value="">{t('qhse.system.location')}</option>
            {(locations || []).map(l => <option key={l.id} value={l.id}>{l.name || l.location_name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('qhse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('qhse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : itps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ClipboardCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noInspectionTestPlansYet')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('qhse.system.itp2')}</th><th>{t('qhse.certificates.name')}</th><th>{t('qhse.system.discipline')}</th>
                <th>{t('qhse.system.points')}</th><th>{t('qhse.certificates.status')}</th><th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {itps.map(i => (
                <React.Fragment key={i.id}>
                  <tr>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{i.itp_number}</td>
                    <td style={{ fontWeight: 500 }}>{i.title}</td>
                    <td>{i.discipline || '-'}</td>
                    <td>{i.point_count}</td>
                    <td><span className="badge badge-info">{translateEnum(t, 'status', i.status)}</span></td>
                    <td>
                      <button className="btn" style={{ padding: '4px 10px' }} onClick={() => openPoints(i)}>{t('qhse.system.points')}</button>{' '}
                      <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/qhse/itps/${i.id}/pdf`, `${i.itp_number}.pdf`)}><Download size={14} /></button>
                    </td>
                  </tr>
                  {expanded === i.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--color-bg-secondary, #f7f7f8)' }}>
                        <button className="btn" style={{ padding: '4px 10px', marginBottom: '8px' }} onClick={() => addPoint(i.id)}><Plus size={12} />{t('qhse.system.point')}</button>
                        {points.length === 0 ? (
                          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>{t('qhse.system.noInspectionPointsDefined')}</p>
                        ) : (
                          <table className="table" style={{ fontSize: '13px' }}>
                            <thead><tr><th>#</th><th>{t('qhse.system.point2')}</th><th>{t('qhse.system.type')}</th><th>{t('qhse.system.responsible')}</th><th>{t('qhse.system.consultant')}</th><th>{t('qhse.system.acceptanceCriteria')}</th></tr></thead>
                            <tbody>
                              {points.map(p => (
                                <tr key={p.id}>
                                  <td>{p.seq}</td><td>{p.title}</td>
                                  <td><span className={`badge ${POINT_TYPE_BADGE[p.point_type]}`}>{translateEnum(t, 'inspectionPointType', p.point_type)}</span></td>
                                  <td>{p.responsible_party || p.responsible_user_name || '-'}</td>
                                  <td>{p.consultant_responsibility || '-'}</td>
                                  <td>{p.acceptance_criteria || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pointFormTarget && <div className="modal-overlay" onClick={() => setPointFormTarget(null)}>
        <form className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} onSubmit={submitPoint}>
          <div className="modal-header"><h2 className="modal-title">{t('common.dialogs.addInspectionPointTitle')}</h2></div>
          <div className="modal-body">
            <label className="form-group"><span className="form-label">{t('common.dialogs.inspectionPointTitleLabel')} *</span><input className="form-input" required value={pointForm.title} onChange={(event) => setPointForm({ ...pointForm, title: event.target.value })} /></label>
            <label className="form-group"><span className="form-label">{t('common.dialogs.inspectionPointTypeLabel')}</span><select className="form-select" value={pointForm.point_type} onChange={(event) => setPointForm({ ...pointForm, point_type: event.target.value })}>{['hold', 'witness', 'review'].map((type) => <option key={type} value={type}>{translateEnum(t, 'inspectionPointType', type)}</option>)}</select></label>
            <label className="form-group"><span className="form-label">{t('common.dialogs.inspectionCriteriaLabel')}</span><textarea className="form-textarea" value={pointForm.acceptance_criteria} onChange={(event) => setPointForm({ ...pointForm, acceptance_criteria: event.target.value })} /></label>
            {pointError && <div className="form-error" role="alert">{pointError}</div>}
          </div>
          <div className="modal-footer"><button type="button" className="btn" onClick={() => setPointFormTarget(null)}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary">{t('common.save')}</button></div>
        </form>
      </div>}
      <LoadMore loadedCount={itps.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

// ============ WIR ============

export function WirTab({ projectId, locale, t }) {
  const [wirs, setWirs] = useState([]);
  const rowsLength = useRef(0); rowsLength.current = wirs.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [itps, setItps] = useState([]);
  const [form, setForm] = useState({ work_package_id: null, itp_id: '', notes: '' });

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const [r, ip] = await Promise.all([
        fetchApi(`${API_URL}/qhse/wirs?${params}`),
        fetchApi(`${API_URL}/qhse/itps?project_id=${projectId}`).catch(() => ({ data: [] })),
      ]);
      if (r.success) { setWirs(current => append ? [...current, ...(r.data || [])] : (r.data || [])); setTotalCount(r.totalCount ?? null); }
      setItps(ip.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/qhse/wirs`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), work_package_id: form.work_package_id,
        itp_id: form.itp_id ? Number(form.itp_id) : null, notes: form.notes,
      }) });
      setShowModal(false); setForm({ work_package_id: null, itp_id: '', notes: '' });
      load();
    } catch (err) { alert(err.message); }
  };

  const act = async (wir, action, body = {}) => {
    try {
      await fetchApi(`${API_URL}/qhse/wirs/${wir.id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('qhse.system.newWir')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <WorkPackageSelect projectId={projectId} required value={form.work_package_id} onChange={(v) => setForm({ ...form, work_package_id: v })} />
          <select className="input" value={form.itp_id} onChange={e => setForm({ ...form, itp_id: e.target.value })}>
            <option value="">{t('qhse.system.itpOptional')}</option>
            {itps.map(i => <option key={i.id} value={i.id}>{i.itp_number} — {i.title}</option>)}
          </select>
          <textarea className="input" placeholder={t('qhse.certificates.notes')} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('qhse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('qhse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : wirs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ShieldCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noWorkInspectionRequestsYet')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('qhse.system.wir')}</th><th>{t('qhse.system.workPackage')}</th><th>{t('qhse.system.location2')}</th>
                <th>{t('qhse.system.date')}</th><th>{t('qhse.system.stage')}</th><th>{t('qhse.system.result')}</th><th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {wirs.map(w => (
                <tr key={w.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{w.wir_number}</td>
                  <td>{w.work_package || '-'}</td>
                  <td>{w.location_name || '-'}</td>
                  <td>{fmtDate(w.inspection_date)}</td>
                  <td><span className={`badge ${WIR_STATUS_BADGE[w.status] || 'badge-info'}`}>{WIR_STATUS_LABELS[locale]?.[w.status] || w.status}</span></td>
                  <td>{w.result ? <span className={`badge ${w.result === 'approved' || w.result === 'approved_with_comments' ? 'badge-success' : w.result === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>{WIR_STATUS_LABELS[locale]?.[w.result] || w.result}</span> : '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {w.status === 'draft' && <button className="btn btn-primary" style={{ padding: '4px 10px' }} onClick={() => act(w, 'submit')}>{t('qhse.system.submit')}</button>}
                    {(w.status === 'qa_qc_review' || w.status === 'pm_review') && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'decision', { decision: 'approve' })}>{t('qhse.system.approve')}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'decision', { decision: 'return' })}>{t('qhse.system.return')}</button>{' '}
                      </>
                    )}
                    {w.status === 'consultant_review' && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'result', { result: 'approved' })}>{t('qhse.system.accept')}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'result', { result: 'rejected' })}>{t('qhse.system.reject')}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'result', { result: 'reinspect' })}>{t('qhse.system.reinspect')}</button>{' '}
                      </>
                    )}
                    <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/qhse/wirs/${w.id}/pdf`, `${w.wir_number}.pdf`)}><Download size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={wirs.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

// ============ PUNCH ITEMS ============

export function PunchTab({ projectId, locale, t }) {
  const [items, setItems] = useState([]);
  const rowsLength = useRef(0); rowsLength.current = items.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ description: '', discipline: '', severity: 'minor', due_date: '', verification_authority: '' });

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const r = await fetchApi(`${API_URL}/qhse/punch-items?${params}`);
      if (r.success) { setItems(current => append ? [...current, ...(r.data || [])] : (r.data || [])); setTotalCount(r.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/qhse/punch-items`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), description: form.description, discipline: form.discipline,
        severity: form.severity, due_date: form.due_date || null, verification_authority: form.verification_authority,
      }) });
      setShowModal(false); setForm({ description: '', discipline: '', severity: 'minor', due_date: '', verification_authority: '' });
      load();
    } catch (err) { alert(err.message); }
  };

  const act = async (item, status) => {
    try {
      await fetchApi(`${API_URL}/qhse/punch-items/${item.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
        <button className="btn" onClick={() => downloadPdf(`${API_URL}/qhse/punch-items/pdf?project_id=${projectId}`, `punch-list-${projectId}.pdf`)}><Download size={16} />{t('qhse.system.punchListPdf')}</button>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('qhse.system.newPunchItem')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <textarea className="input" required placeholder={t('qhse.system.description')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="responsive-grid responsive-grid--three" style={{ gap: '10px' }}>
            <input className="input" placeholder={t('qhse.system.discipline')} value={form.discipline} onChange={e => setForm({ ...form, discipline: e.target.value })} />
            <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="minor">{t('qhse.system.minor')}</option><option value="major">{t('qhse.system.major')}</option><option value="critical">{t('qhse.system.critical')}</option>
            </select>
            <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <input className="input" placeholder={t('qhse.system.verificationAuthority')} value={form.verification_authority} onChange={e => setForm({ ...form, verification_authority: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('qhse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('qhse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ListChecks size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noPunchItemsTheRegisterIsClean')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('qhse.system.item')}</th><th>{t('qhse.system.description')}</th><th>{t('qhse.system.location2')}</th>
                <th>{t('qhse.system.responsible')}</th><th>{t('qhse.system.due')}</th><th>{t('qhse.certificates.status')}</th><th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{p.punch_number}</td>
                  <td>{p.description}</td>
                  <td>{p.location_name || '-'}</td>
                  <td>{p.responsible_name || p.responsible_user_name || '-'}</td>
                  <td>{fmtDate(p.due_date)}</td>
                  <td><span className={`badge ${PUNCH_STATUS_BADGE[p.status]}`}>{PUNCH_STATUS_LABELS[locale]?.[p.status] || p.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {p.status === 'open' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'assigned')}>{t('qhse.system.assign')}</button>}
                    {p.status === 'assigned' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'rectified')}>{t('qhse.system.rectified')}</button>}
                    {p.status === 'rectified' && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'verified')}>{t('qhse.system.verify')}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'open')}>{t('qhse.system.reopen')}</button>
                      </>
                    )}
                    {p.status === 'verified' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'closed')}>{t('qhse.system.close')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={items.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

// ============ CAPA (corrective + preventive) ============

export function CapaTab({ projectId, locale, t }) {
  const [kind, setKind] = useState('corrective');
  const [items, setItems] = useState([]);
  const rowsLength = useRef(0); rowsLength.current = items.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ description: '', assigned_role: '', due_date: '' });

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, kind, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const r = await fetchApi(`${API_URL}/qhse/actions?${params}`);
      if (r.success) { setItems(current => append ? [...current, ...(r.data || [])] : (r.data || [])); setTotalCount(r.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId, kind]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/qhse/actions`, { method: 'POST', body: JSON.stringify({
        kind, project_id: Number(projectId), description: form.description,
        assigned_role: form.assigned_role || null, due_date: form.due_date || null,
      }) });
      setShowModal(false); setForm({ description: '', assigned_role: '', due_date: '' });
      load();
    } catch (err) { alert(err.message); }
  };

  const act = async (item, status) => {
    try {
      await fetchApi(`${API_URL}/qhse/actions/${item.id}/status`, { method: 'POST', body: JSON.stringify({ kind, status }) });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={`btn ${kind === 'corrective' ? 'btn-primary' : ''}`} onClick={() => setKind('corrective')} style={{ padding: '6px 16px', fontSize: '13px' }}>{t('qhse.system.corrective')}</button>
          <button className={`btn ${kind === 'preventive' ? 'btn-primary' : ''}`} onClick={() => setKind('preventive')} style={{ padding: '6px 16px', fontSize: '13px' }}>{t('qhse.system.preventive')}</button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('qhse.system.newAction')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <textarea className="input" required placeholder={t('qhse.system.description')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div className="responsive-grid responsive-grid--two" style={{ gap: '10px' }}>
            <input className="input" placeholder={t('qhse.system.assignedRole')} value={form.assigned_role} onChange={e => setForm({ ...form, assigned_role: e.target.value })} />
            <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('qhse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('qhse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Wrench size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noActionsRecorded')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>#</th><th>{t('qhse.system.description')}</th><th>{t('qhse.system.source')}</th><th>{t('qhse.system.assigned')}</th><th>{t('qhse.system.due')}</th><th>{t('qhse.certificates.status')}</th><th>{t('common.actions')}</th></tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.description}</td>
                  <td style={{ fontSize: '13px' }}>{translateEnum(t, 'entityType', a.source_type)} #{a.source_id}</td>
                  <td>{a.assigned_user_name || a.assigned_role || '-'}</td>
                  <td>{fmtDate(a.due_date)}{a.is_overdue ? <span className="badge badge-danger" style={{ marginLeft: 6 }}>{t('qhse.system.overdue')}</span> : null}</td>
                  <td><span className={`badge ${CAPA_STATUS_BADGE[a.status]}`}>{CAPA_STATUS_LABELS[locale]?.[a.status] || a.status}</span></td>
                  <td>
                    {a.status === 'open' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(a, 'in_progress')}>{t('qhse.system.start')}</button>}
                    {(a.status === 'open' || a.status === 'in_progress') && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(a, 'completed')}>{t('qhse.system.complete')}</button>}
                    {a.status === 'completed' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(a, 'verified')}>{t('qhse.system.verify')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={items.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

// ============ MOCK-UPS ============

export function MockUpsTab({ projectId, locale, t }) {
  const [items, setItems] = useState([]);
  const rowsLength = useRef(0); rowsLength.current = items.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', discipline: '' });

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const r = await fetchApi(`${API_URL}/qhse/mock-ups?${params}`);
      if (r.success) { setItems(current => append ? [...current, ...(r.data || [])] : (r.data || [])); setTotalCount(r.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/qhse/mock-ups`, { method: 'POST', body: JSON.stringify({ project_id: Number(projectId), title: form.title, discipline: form.discipline }) });
      setShowModal(false); setForm({ title: '', discipline: '' });
      load();
    } catch (err) { alert(err.message); }
  };

  const act = async (item, status) => {
    try {
      await fetchApi(`${API_URL}/qhse/mock-ups/${item.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('qhse.system.proposeMockUp')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={t('qhse.certificates.name')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder={t('qhse.system.discipline')} value={form.discipline} onChange={e => setForm({ ...form, discipline: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('qhse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('qhse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <PackageCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noMockUpsProposed')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>{t('qhse.certificates.name')}</th><th>{t('qhse.system.discipline')}</th><th>{t('qhse.system.location2')}</th><th>{t('qhse.certificates.status')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.title}</td>
                  <td>{m.discipline || '-'}</td>
                  <td>{m.location_name || '-'}</td>
                  <td><span className={`badge ${MOCKUP_STATUS_BADGE[m.status]}`}>{MOCKUP_STATUS_LABELS[locale]?.[m.status] || m.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {m.status === 'proposed' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(m, 'under_review')}>{t('qhse.system.review')}</button>}
                    {(m.status === 'proposed' || m.status === 'under_review') && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(m, 'approved')}>{t('qhse.system.approve2')}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(m, 'rejected')}>{t('qhse.system.reject')}</button>
                      </>
                    )}
                    {m.status === 'rework' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(m, 'under_review')}>{t('qhse.system.reReview')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={items.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

// ============ CALIBRATION ============

export function CalibrationTab({ projectId, locale, t }) {
  const [items, setItems] = useState([]);
  const rowsLength = useRef(0); rowsLength.current = items.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ instrument_name: '', serial_no: '', next_calibration_date: '', certificate_ref: '', result: 'pass' });

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const r = await fetchApi(`${API_URL}/qhse/calibration-records?${params}`);
      if (r.success) { setItems(current => append ? [...current, ...(r.data || [])] : (r.data || [])); setTotalCount(r.totalCount ?? null); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/qhse/calibration-records`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), instrument_name: form.instrument_name, serial_no: form.serial_no,
        next_calibration_date: form.next_calibration_date || null, certificate_ref: form.certificate_ref, result: form.result,
      }) });
      setShowModal(false); setForm({ instrument_name: '', serial_no: '', next_calibration_date: '', certificate_ref: '', result: 'pass' });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('qhse.system.recordCalibration')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={t('qhse.system.instrumentName')} value={form.instrument_name} onChange={e => setForm({ ...form, instrument_name: e.target.value })} />
          <div className="responsive-grid responsive-grid--two" style={{ gap: '10px' }}>
            <input className="input" placeholder={t('qhse.system.serialNo')} value={form.serial_no} onChange={e => setForm({ ...form, serial_no: e.target.value })} />
            <input className="input" type="date" value={form.next_calibration_date} onChange={e => setForm({ ...form, next_calibration_date: e.target.value })} />
          </div>
          <div className="responsive-grid responsive-grid--two" style={{ gap: '10px' }}>
            <input className="input" placeholder={t('qhse.system.certificateRef')} value={form.certificate_ref} onChange={e => setForm({ ...form, certificate_ref: e.target.value })} />
            <select className="input" value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}>
              <option value="pass">{t('qhse.system.pass')}</option><option value="fail">{t('qhse.system.fail')}</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('qhse.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('qhse.system.cancel')}</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Gauge size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('qhse.system.noCalibrationRecords')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>{t('qhse.system.instrument')}</th><th>{t('qhse.system.serial')}</th><th>{t('qhse.system.calibrated')}</th><th>{t('qhse.system.nextDue')}</th><th>{t('qhse.system.result')}</th><th>{t('qhse.system.certificate')}</th></tr></thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.instrument_name}</td>
                  <td>{c.serial_no || '-'}</td>
                  <td>{fmtDate(c.calibration_date)}</td>
                  <td>{fmtDate(c.next_calibration_date)}{c.calibration_overdue ? <span className="badge badge-danger" style={{ marginLeft: 6 }}>{t('qhse.system.overdue')}</span> : null}</td>
                  <td><span className={`badge ${c.result === 'pass' ? 'badge-success' : 'badge-danger'}`}>{translateEnum(t, 'result', c.result)}</span></td>
                  <td>{c.certificate_ref || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={items.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}
