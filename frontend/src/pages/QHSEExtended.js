// Phase 19 — QA/QC extended tabs: ITP, WIR, Punch items, Checklists,
// Corrective/Preventive actions, Mock-ups, Calibration records.
// Rendered inside the QHSE page's tab strip; every tab renders an explicit
// empty state (the zero-records requirement), never a blank screen.

import React, { useState, useEffect, useCallback } from 'react';
import WorkPackageSelect from '../components/project/WorkPackageSelect';
import { Plus, ClipboardCheck, ListChecks, Wrench, PackageCheck, Gauge, ShieldCheck, Download } from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

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

const WIR_STATUS_LABELS = {
  en: { draft: 'Draft', submitted: 'QA/QC Review', qa_qc_review: 'QA/QC Review', pm_review: 'PM Review', consultant_review: 'Consultant', approved: 'Approved', approved_with_comments: 'Approved with Comments', rejected: 'Rejected' },
  ar: { draft: 'مسودة', submitted: 'مراجعة الجودة', qa_qc_review: 'مراجعة الجودة', pm_review: 'مراجعة مدير المشروع', consultant_review: 'الاستشاري', approved: 'مقبول', approved_with_comments: 'مقبول بتعليقات', rejected: 'مرفوض' },
};
const WIR_STATUS_BADGE = { draft: 'badge-info', submitted: 'badge-warning', qa_qc_review: 'badge-warning', pm_review: 'badge-info', consultant_review: 'badge-info', approved: 'badge-success', approved_with_comments: 'badge-success', rejected: 'badge-danger' };

const POINT_TYPE_LABELS = { hold: 'Hold', witness: 'Witness', review: 'Review' };
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
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [points, setPoints] = useState([]);
  const [form, setForm] = useState({ title: '', discipline: '', work_package_id: null, project_location_id: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, loc] = await Promise.all([
        fetchApi(`${API_URL}/qhse/itps?project_id=${projectId}`),
        fetchApi(`${API_URL}/locations/project/${projectId}`).catch(() => ({ data: [] })),
      ]);
      if (r.success) setItps(r.data || []);
      setLocations(loc.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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

  const addPoint = async (itpId) => {
    const title = prompt(locale === 'ar' ? 'عنوان نقطة الفحص' : 'Inspection point title');
    if (!title) return;
    const type = prompt(locale === 'ar' ? 'النوع: hold / witness / review' : 'Type: hold / witness / review', 'review') || 'review';
    const criteria = prompt(locale === 'ar' ? 'معايير القبول' : 'Acceptance criteria') || '';
    try {
      await fetchApi(`${API_URL}/qhse/itps/${itpId}/points`, { method: 'POST', body: JSON.stringify({ title, point_type: type, acceptance_criteria: criteria }) });
      const r = await fetchApi(`${API_URL}/qhse/itps/${itpId}`);
      setPoints(r.success ? (r.data.points || []) : []);
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'خطة فحص جديدة' : 'New ITP'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={locale === 'ar' ? 'العنوان' : 'Title'} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <input className="input" placeholder={locale === 'ar' ? 'التخصص' : 'Discipline'} value={form.discipline} onChange={e => setForm({ ...form, discipline: e.target.value })} />
            <WorkPackageSelect projectId={projectId} value={form.work_package_id} onChange={(v) => setForm({ ...form, work_package_id: v })} />
          </div>
          <select className="input" value={form.project_location_id} onChange={e => setForm({ ...form, project_location_id: e.target.value })}>
            <option value="">{locale === 'ar' ? '— الموقع —' : '— Location —'}</option>
            {(locations || []).map(l => <option key={l.id} value={l.id}>{l.name || l.location_name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : itps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ClipboardCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد خطط فحص.' : 'No inspection & test plans yet.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>ITP</th><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th><th>{locale === 'ar' ? 'التخصص' : 'Discipline'}</th>
                <th>{locale === 'ar' ? 'النقاط' : 'Points'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th>
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
                    <td><span className="badge badge-info">{i.status}</span></td>
                    <td>
                      <button className="btn" style={{ padding: '4px 10px' }} onClick={() => openPoints(i)}>{locale === 'ar' ? 'النقاط' : 'Points'}</button>{' '}
                      <button className="btn" style={{ padding: '4px 10px' }} onClick={() => downloadPdf(`${API_URL}/qhse/itps/${i.id}/pdf`, `${i.itp_number}.pdf`)}><Download size={14} /></button>
                    </td>
                  </tr>
                  {expanded === i.id && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--color-bg-secondary, #f7f7f8)' }}>
                        <button className="btn" style={{ padding: '4px 10px', marginBottom: '8px' }} onClick={() => addPoint(i.id)}><Plus size={12} />{locale === 'ar' ? 'نقطة' : 'Point'}</button>
                        {points.length === 0 ? (
                          <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>{locale === 'ar' ? 'لا توجد نقاط فحص.' : 'No inspection points defined.'}</p>
                        ) : (
                          <table className="table" style={{ fontSize: '13px' }}>
                            <thead><tr><th>#</th><th>{locale === 'ar' ? 'النقطة' : 'Point'}</th><th>{locale === 'ar' ? 'النوع' : 'Type'}</th><th>{locale === 'ar' ? 'المسؤول' : 'Responsible'}</th><th>{locale === 'ar' ? 'الاستشاري' : 'Consultant'}</th><th>{locale === 'ar' ? 'معايير القبول' : 'Acceptance criteria'}</th></tr></thead>
                            <tbody>
                              {points.map(p => (
                                <tr key={p.id}>
                                  <td>{p.seq}</td><td>{p.title}</td>
                                  <td><span className={`badge ${POINT_TYPE_BADGE[p.point_type]}`}>{POINT_TYPE_LABELS[p.point_type] || p.point_type}</span></td>
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
    </div>
  );
}

// ============ WIR ============

export function WirTab({ projectId, locale, t }) {
  const [wirs, setWirs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [itps, setItps] = useState([]);
  const [form, setForm] = useState({ work_package_id: null, itp_id: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, ip] = await Promise.all([
        fetchApi(`${API_URL}/qhse/wirs?project_id=${projectId}`),
        fetchApi(`${API_URL}/qhse/itps?project_id=${projectId}`).catch(() => ({ data: [] })),
      ]);
      if (r.success) setWirs(r.data || []);
      setItps(ip.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'طلب فحص أعمال' : 'New WIR'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <WorkPackageSelect projectId={projectId} required value={form.work_package_id} onChange={(v) => setForm({ ...form, work_package_id: v })} />
          <select className="input" value={form.itp_id} onChange={e => setForm({ ...form, itp_id: e.target.value })}>
            <option value="">{locale === 'ar' ? '— ITP (اختياري) —' : '— ITP (optional) —'}</option>
            {itps.map(i => <option key={i.id} value={i.id}>{i.itp_number} — {i.title}</option>)}
          </select>
          <textarea className="input" placeholder={locale === 'ar' ? 'ملاحظات' : 'Notes'} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : wirs.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ShieldCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد طلبات فحص أعمال.' : 'No work inspection requests yet.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>WIR</th><th>{locale === 'ar' ? 'حزمة العمل' : 'Work package'}</th><th>{locale === 'ar' ? 'الموقع' : 'Location'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th><th>{locale === 'ar' ? 'المرحلة' : 'Stage'}</th><th>{locale === 'ar' ? 'النتيجة' : 'Result'}</th><th>{t('common.actions')}</th>
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
                    {w.status === 'draft' && <button className="btn btn-primary" style={{ padding: '4px 10px' }} onClick={() => act(w, 'submit')}>{locale === 'ar' ? 'إرسال' : 'Submit'}</button>}
                    {(w.status === 'qa_qc_review' || w.status === 'pm_review') && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'decision', { decision: 'approve' })}>{locale === 'ar' ? 'اعتماد' : 'Approve'}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'decision', { decision: 'return' })}>{locale === 'ar' ? 'إرجاع' : 'Return'}</button>{' '}
                      </>
                    )}
                    {w.status === 'consultant_review' && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'result', { result: 'approved' })}>{locale === 'ar' ? 'قبول' : 'Accept'}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'result', { result: 'rejected' })}>{locale === 'ar' ? 'رفض' : 'Reject'}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(w, 'result', { result: 'reinspect' })}>{locale === 'ar' ? 'إعادة فحص' : 'Reinspect'}</button>{' '}
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
    </div>
  );
}

// ============ PUNCH ITEMS ============

export function PunchTab({ projectId, locale, t }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ description: '', discipline: '', severity: 'minor', due_date: '', verification_authority: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/qhse/punch-items?project_id=${projectId}`);
      if (r.success) setItems(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
        <button className="btn" onClick={() => downloadPdf(`${API_URL}/qhse/punch-items/pdf?project_id=${projectId}`, `punch-list-${projectId}.pdf`)}><Download size={16} />{locale === 'ar' ? 'قائمة PUNCH' : 'Punch list PDF'}</button>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'بند جديد' : 'New Punch Item'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <textarea className="input" required placeholder={locale === 'ar' ? 'الوصف' : 'Description'} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <input className="input" placeholder={locale === 'ar' ? 'التخصص' : 'Discipline'} value={form.discipline} onChange={e => setForm({ ...form, discipline: e.target.value })} />
            <select className="input" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option>
            </select>
            <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <input className="input" placeholder={locale === 'ar' ? 'جهة التحقق' : 'Verification authority'} value={form.verification_authority} onChange={e => setForm({ ...form, verification_authority: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ListChecks size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد بنود PUNCH.' : 'No punch items — the register is clean.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th><th>{locale === 'ar' ? 'الوصف' : 'Description'}</th><th>{locale === 'ar' ? 'الموقع' : 'Location'}</th>
                <th>{locale === 'ar' ? 'المسؤول' : 'Responsible'}</th><th>{locale === 'ar' ? 'الاستحقاق' : 'Due'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th>
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
                    {p.status === 'open' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'assigned')}>{locale === 'ar' ? 'إسناد' : 'Assign'}</button>}
                    {p.status === 'assigned' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'rectified')}>{locale === 'ar' ? 'تم التصحيح' : 'Rectified'}</button>}
                    {p.status === 'rectified' && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'verified')}>{locale === 'ar' ? 'تحقق' : 'Verify'}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'open')}>{locale === 'ar' ? 'إعادة فتح' : 'Reopen'}</button>
                      </>
                    )}
                    {p.status === 'verified' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(p, 'closed')}>{locale === 'ar' ? 'إغلاق' : 'Close'}</button>}
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

// ============ CAPA (corrective + preventive) ============

export function CapaTab({ projectId, locale, t }) {
  const [kind, setKind] = useState('corrective');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ description: '', assigned_role: '', due_date: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/qhse/actions?project_id=${projectId}&kind=${kind}`);
      if (r.success) setItems(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
          <button className={`btn ${kind === 'corrective' ? 'btn-primary' : ''}`} onClick={() => setKind('corrective')} style={{ padding: '6px 16px', fontSize: '13px' }}>{locale === 'ar' ? 'إجراءات تصحيحية' : 'Corrective'}</button>
          <button className={`btn ${kind === 'preventive' ? 'btn-primary' : ''}`} onClick={() => setKind('preventive')} style={{ padding: '6px 16px', fontSize: '13px' }}>{locale === 'ar' ? 'إجراءات وقائية' : 'Preventive'}</button>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'إجراء جديد' : 'New Action'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <textarea className="input" required placeholder={locale === 'ar' ? 'الوصف' : 'Description'} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <input className="input" placeholder={locale === 'ar' ? 'الدور المسؤول' : 'Assigned role'} value={form.assigned_role} onChange={e => setForm({ ...form, assigned_role: e.target.value })} />
            <input className="input" type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Wrench size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد إجراءات.' : 'No actions recorded.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>#</th><th>{locale === 'ar' ? 'الوصف' : 'Description'}</th><th>{locale === 'ar' ? 'المصدر' : 'Source'}</th><th>{locale === 'ar' ? 'المسؤول' : 'Assigned'}</th><th>{locale === 'ar' ? 'الاستحقاق' : 'Due'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th></tr>
            </thead>
            <tbody>
              {items.map(a => (
                <tr key={a.id}>
                  <td>{a.id}</td>
                  <td>{a.description}</td>
                  <td style={{ fontSize: '13px' }}>{a.source_type} #{a.source_id}</td>
                  <td>{a.assigned_user_name || a.assigned_role || '-'}</td>
                  <td>{fmtDate(a.due_date)}{a.is_overdue ? <span className="badge badge-danger" style={{ marginLeft: 6 }}>overdue</span> : null}</td>
                  <td><span className={`badge ${CAPA_STATUS_BADGE[a.status]}`}>{CAPA_STATUS_LABELS[locale]?.[a.status] || a.status}</span></td>
                  <td>
                    {a.status === 'open' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(a, 'in_progress')}>{locale === 'ar' ? 'بدء' : 'Start'}</button>}
                    {(a.status === 'open' || a.status === 'in_progress') && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(a, 'completed')}>{locale === 'ar' ? 'إنجاز' : 'Complete'}</button>}
                    {a.status === 'completed' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(a, 'verified')}>{locale === 'ar' ? 'تحقق' : 'Verify'}</button>}
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

// ============ MOCK-UPS ============

export function MockUpsTab({ projectId, locale, t }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', discipline: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/qhse/mock-ups?project_id=${projectId}`);
      if (r.success) setItems(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'نموذج تجريبي' : 'Propose Mock-up'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={locale === 'ar' ? 'العنوان' : 'Title'} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="input" placeholder={locale === 'ar' ? 'التخصص' : 'Discipline'} value={form.discipline} onChange={e => setForm({ ...form, discipline: e.target.value })} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <PackageCheck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد نماذج تجريبية.' : 'No mock-ups proposed.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th><th>{locale === 'ar' ? 'التخصص' : 'Discipline'}</th><th>{locale === 'ar' ? 'الموقع' : 'Location'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.title}</td>
                  <td>{m.discipline || '-'}</td>
                  <td>{m.location_name || '-'}</td>
                  <td><span className={`badge ${MOCKUP_STATUS_BADGE[m.status]}`}>{MOCKUP_STATUS_LABELS[locale]?.[m.status] || m.status}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {m.status === 'proposed' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(m, 'under_review')}>{locale === 'ar' ? 'مراجعة' : 'Review'}</button>}
                    {(m.status === 'proposed' || m.status === 'under_review') && (
                      <>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(m, 'approved')}>{locale === 'ar' ? 'قبول' : 'Approve'}</button>{' '}
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(m, 'rejected')}>{locale === 'ar' ? 'رفض' : 'Reject'}</button>
                      </>
                    )}
                    {m.status === 'rework' && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => act(m, 'under_review')}>{locale === 'ar' ? 'إعادة مراجعة' : 'Re-review'}</button>}
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

// ============ CALIBRATION ============

export function CalibrationTab({ projectId, locale, t }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ instrument_name: '', serial_no: '', next_calibration_date: '', certificate_ref: '', result: 'pass' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/qhse/calibration-records?project_id=${projectId}`);
      if (r.success) setItems(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
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
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'سجل معايرة' : 'Record Calibration'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '16px', display: 'grid', gap: '10px' }}>
          <input className="input" required placeholder={locale === 'ar' ? 'اسم الجهاز' : 'Instrument name'} value={form.instrument_name} onChange={e => setForm({ ...form, instrument_name: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <input className="input" placeholder="Serial no." value={form.serial_no} onChange={e => setForm({ ...form, serial_no: e.target.value })} />
            <input className="input" type="date" value={form.next_calibration_date} onChange={e => setForm({ ...form, next_calibration_date: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <input className="input" placeholder={locale === 'ar' ? 'مرجع الشهادة' : 'Certificate ref'} value={form.certificate_ref} onChange={e => setForm({ ...form, certificate_ref: e.target.value })} />
            <select className="input" value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}>
              <option value="pass">Pass</option><option value="fail">Fail</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Gauge size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'لا توجد سجلات معايرة.' : 'No calibration records.'}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>{locale === 'ar' ? 'الجهاز' : 'Instrument'}</th><th>Serial</th><th>{locale === 'ar' ? 'المعايرة' : 'Calibrated'}</th><th>{locale === 'ar' ? 'القادمة' : 'Next due'}</th><th>{locale === 'ar' ? 'النتيجة' : 'Result'}</th><th>{locale === 'ar' ? 'الشهادة' : 'Certificate'}</th></tr></thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.instrument_name}</td>
                  <td>{c.serial_no || '-'}</td>
                  <td>{fmtDate(c.calibration_date)}</td>
                  <td>{fmtDate(c.next_calibration_date)}{c.calibration_overdue ? <span className="badge badge-danger" style={{ marginLeft: 6 }}>overdue</span> : null}</td>
                  <td><span className={`badge ${c.result === 'pass' ? 'badge-success' : 'badge-danger'}`}>{c.result}</span></td>
                  <td>{c.certificate_ref || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
