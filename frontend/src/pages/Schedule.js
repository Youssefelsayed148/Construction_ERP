import { formatDate as sharedDate } from '../utils/formatters';
import { apiFetch, apiResponseJson } from '../services/apiClient';
// Phase 22 — planning & scheduling workspace: activities + Gantt-style bars,
// CPM critical path, lookaheads (2/4/6 weeks), delayed activities, SV%/SPI,
// S-curve, alerts, baselines and CSV import/export.
// Zero-record states render explicitly, never a blank screen.

import WorkPackageSelect from '../components/project/WorkPackageSelect';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { FORMAT_LOCALE } from '../i18n/config';
import { authService } from '../services/api';
import { hasProjectPermission } from '../utils/projectNav';
import LoadMore from '../components/common/LoadMore';
import { ArrowLeft, Plus, CalendarRange, AlertTriangle, TrendingDown, Download, Flag, Zap, History, Users, DollarSign } from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => {
    const error = new Error(e.error || e.error_code || 'Request failed');
    error.error_code = e.error_code || e.error;
    throw error;
  });
  return apiResponseJson(r);
});

const fmtDate = sharedDate;
const localDateInputValue = () => {
  const now = new Date(); const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
      <Icon size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
      <p style={{ color: 'var(--color-text-secondary)' }}>{text}</p>
    </div>
  );
}

// Gantt-style bars across the min/max planning window.
function GanttList({ activities, t }) {
  const usable = activities.filter(a => a.planned_start && a.planned_finish);
  if (usable.length === 0) {
    return <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
      {activities.length > 0 ? t('schedule.system.activitiesNeedPlannedStartFinishDatesToDrawBars') : ''}</p>;
  }
  const times = usable.flatMap(a => [new Date(a.planned_start).getTime(), new Date(a.planned_finish).getTime()]);
  const min = Math.min(...times), max = Math.max(...times);
  const span = max - min || 1;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {activities.map(a => {
        const s = a.planned_start ? new Date(a.planned_start).getTime() : null;
        const f = a.planned_finish ? new Date(a.planned_finish).getTime() : null;
        const width = s != null && f != null ? Math.max(1, ((f - s) / span) * 100) : 1;
        const crit = a.cpm?.critical;
        return (
          <div key={a.id} className="responsive-grid responsive-grid--schedule-row" style={{ gap: 8, alignItems: 'center', fontSize: 13 }}>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {a.is_milestone ? <Flag size={12} style={{ color: crit ? 'var(--color-danger, #e5534b)' : 'var(--color-accent)', marginRight: 4 }} /> : null}
              {a.activity_code} {a.name}
            </div>
            <div style={{ position: 'relative', height: 18, background: 'var(--color-surface-raised)', borderRadius: 4 }}>
              <div style={{
                position: 'absolute', left: `${leftPct(a, min, span)}%`, width: a.is_milestone ? 8 : `${width}%`,
                top: 2, bottom: 2,
                background: crit ? 'var(--color-danger, #e5534b)' : 'var(--color-accent)',
                opacity: 0.85, borderRadius: 3,
              }} title={`${a.activity_code}: ${a.percent_complete || 0}%`} />
            </div>
            <span>{fmtDate(a.planned_start)}</span>
            <span style={{ fontWeight: 600 }}>{a.percent_complete || 0}%</span>
          </div>
        );
      })}
    </div>
  );
}
function leftPct(a, min, span) {
  if (a.planned_start == null) return 0;
  return Math.min(100, Math.max(0, ((new Date(a.planned_start).getTime() - min) / span) * 100));
}

export function ActivitiesTab({ projectId, locale, t }) {
  const canEditBudget = hasProjectPermission(authService.getCurrentUser(), 'schedule', 'edit', projectId);
  const [rows, setRows] = useState([]);
  const rowsLength = useRef(0);
  rowsLength.current = rows.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', work_package_id: null, planned_start: '', planned_finish: '', original_duration: 0, is_milestone: false });
  const [progressActivity, setProgressActivity] = useState(null);
  const [progressValue, setProgressValue] = useState('');
  const [progressDate, setProgressDate] = useState('');
  const [progressNotes, setProgressNotes] = useState('');
  const [progressHistory, setProgressHistory] = useState([]);
  const [assignmentActivity, setAssignmentActivity] = useState(null);
  const [resources, setResources] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [assignmentForm, setAssignmentForm] = useState({ resource: '', assigned_from: '', assigned_to: '', allocation_percent: 100, notes: '' });
  const [assignmentError, setAssignmentError] = useState('');
  const [budgetActivity, setBudgetActivity] = useState(null);
  const [budgetCost, setBudgetCost] = useState('');
  const [budgetError, setBudgetError] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ project_id: projectId, limit: '200', offset: String(append ? rowsLength.current : 0) });
      const r = await fetchApi(`${API_URL}/schedule/activities?${params}`);
      if (r.success) {
        setRows(current => append ? [...current, ...(r.data || [])] : (r.data || []));
        setTotalCount(r.totalCount ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/schedule/activities`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), name: form.name, work_package_id: form.work_package_id,
        planned_start: form.planned_start || null, planned_finish: form.planned_finish || null,
        original_duration: Number(form.original_duration) || 0, is_milestone: form.is_milestone,
      }) });
      setShowModal(false);
      setForm({ name: '', work_package_id: null, planned_start: '', planned_finish: '', original_duration: 0, is_milestone: false });
      load();
    } catch (err) { alert(err.message); }
  };

  const openBudget = (activity) => {
    setBudgetActivity(activity);
    setBudgetCost(activity.budgeted_cost == null ? '' : String(activity.budgeted_cost));
    setBudgetError('');
  };

  const submitBudget = async (event) => {
    event.preventDefault();
    setSavingBudget(true); setBudgetError('');
    try {
      await fetchApi(`${API_URL}/schedule/activities/${budgetActivity.id}/budgeted-cost`, {
        method: 'PUT', body: JSON.stringify({ budgeted_cost: budgetCost === '' ? null : Number(budgetCost) }),
      });
      setBudgetActivity(null);
      await load();
    } catch (error) { setBudgetError(t(`errors.${error.error_code}`, { defaultValue: t('schedule.budgetSaveFailed') })); }
    finally { setSavingBudget(false); }
  };

  const openProgress = async (activity) => {
    setProgressActivity(activity); setProgressValue(String(activity.percent_complete || 0)); setProgressNotes('');
    setProgressDate(localDateInputValue());
    try {
      const result = await fetchApi(API_URL + '/schedule/activities/' + activity.id + '/progress-history');
      setProgressHistory(result.data || []);
    } catch (err) { setProgressHistory([]); alert(err.message); }
  };
  const submitProgress = async (event) => {
    event.preventDefault();
    try {
      await fetchApi(API_URL + '/schedule/activities/' + progressActivity.id + '/progress', { method: 'POST', body: JSON.stringify({ percent_complete: Number(progressValue), data_date: progressDate, notes: progressNotes || null }) });
      setProgressActivity(null); load();
    } catch (err) { alert(err.message); }
  };
  const openAssignments = async (activity) => {
    setAssignmentActivity(activity); setAssignmentError('');
    try {
      const results = await Promise.all([
        fetchApi(API_URL + '/schedule/resources?project_id=' + projectId),
        fetchApi(API_URL + '/schedule/activities/' + activity.id + '/assignments'),
      ]);
      setResources(results[0].data || []); setAssignments(results[1].data || []);
      setAssignmentForm({ resource: '', assigned_from: '', assigned_to: '', allocation_percent: 100, notes: '' });
    } catch (err) { setAssignmentError(err.message); }
  };
  const submitAssignment = async (event) => {
    event.preventDefault(); setAssignmentError('');
    const resource = resources.find((item) => item.resource_type + ':' + item.resource_id === assignmentForm.resource);
    if (!resource) return;
    const payload = {
      [resource.resource_type === 'employee' ? 'employee_id' : 'asset_register_id']: resource.resource_id,
      assigned_from: assignmentForm.assigned_from, assigned_to: assignmentForm.assigned_to,
      allocation_percent: Number(assignmentForm.allocation_percent), notes: assignmentForm.notes || null,
    };
    try {
      await fetchApi(API_URL + '/schedule/activities/' + assignmentActivity.id + '/assignments', { method: 'POST', body: JSON.stringify(payload) });
      const result = await fetchApi(API_URL + '/schedule/activities/' + assignmentActivity.id + '/assignments');
      setAssignments(result.data || []);
      setAssignmentForm({ resource: '', assigned_from: '', assigned_to: '', allocation_percent: 100, notes: '' });
    } catch (err) {
      const key = err.message === 'schedule_assignment_date_overlap' ? 'schedule.resourceOverlap' : err.message === 'schedule_assignment_resource_project_mismatch' ? 'schedule.resourceProjectMismatch' : err.message === 'invalid_schedule_assignment' ? 'schedule.invalidAssignment' : '';
      setAssignmentError(key ? t(key) : err.message);
    }
  };
  const updateAssignmentStatus = async (assignment, status) => {
    try {
      await fetchApi(API_URL + '/schedule/assignments/' + assignment.id + '/status', { method: 'PUT', body: JSON.stringify({ status }) });
      const result = await fetchApi(API_URL + '/schedule/activities/' + assignmentActivity.id + '/assignments');
      setAssignments(result.data || []);
    } catch (err) { setAssignmentError(err.message); }
  };
  const assignmentStatusLabel = (status) => ({
    planned: t('schedule.assignmentStatuses.planned'), active: t('schedule.assignmentStatuses.active'),
    completed: t('schedule.assignmentStatuses.completed'), cancelled: t('schedule.assignmentStatuses.cancelled'),
  }[status] || status);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={async () => {
          const res = await apiFetch(`${API_URL}/schedule/activities/export?project_id=${projectId}`, { headers: headers() });
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = `schedule-${projectId}.csv`; a.click(); URL.revokeObjectURL(a.href);
        }}><Download size={16} /> CSV</button>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{t('schedule.system.newActivity')}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: 16, display: 'grid', gap: 10, maxWidth: 560 }}>
          <input className="input" required placeholder={t('schedule.system.activityName')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div className="responsive-grid responsive-grid--two" style={{ gap: 10 }}>
            <input className="input" type="date" title={t('schedule.system.plannedStart')} value={form.planned_start} onChange={e => setForm({ ...form, planned_start: e.target.value })} />
            <input className="input" type="date" title={t('schedule.system.plannedFinish')} value={form.planned_finish} onChange={e => setForm({ ...form, planned_finish: e.target.value })} />
          </div>
          <div className="responsive-grid responsive-grid--two" style={{ gap: 10 }}>
            <WorkPackageSelect projectId={projectId} value={form.work_package_id} onChange={(v) => setForm({ ...form, work_package_id: v })} />
            <input className="input" type="number" min="0" placeholder={t('schedule.system.durationDays')} value={form.original_duration} onChange={e => setForm({ ...form, original_duration: e.target.value })} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.is_milestone} onChange={e => setForm({ ...form, is_milestone: e.target.checked })} />
            {t('schedule.system.milestone')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || t('schedule.system.save')}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>{t('schedule.system.cancel')}</button>
          </div>
        </form>
      )}
      {progressActivity && (
        <div className="card" role="dialog" aria-label={t('schedule.progressHistory')} style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <h3>{progressActivity.activity_code} ? {t('schedule.progressHistory')}</h3>
          <form onSubmit={submitProgress} style={{ display: 'grid', gap: 8, maxWidth: 560 }}>
            <label>{t('schedule.percentComplete')}<input className="input" type="number" min="0" max="100" step="0.01" required value={progressValue} onChange={(event) => setProgressValue(event.target.value)} /></label>
            <label>{t('schedule.dataDate')}<input className="input" type="date" required value={progressDate} onChange={(event) => setProgressDate(event.target.value)} /></label>
            <label>{t('schedule.progressNotes')}<textarea className="input" value={progressNotes} onChange={(event) => setProgressNotes(event.target.value)} /></label>
            <div><button className="btn btn-primary" type="submit">{t('schedule.recordProgress')}</button> <button className="btn" type="button" onClick={() => setProgressActivity(null)}>{t('common.cancel')}</button></div>
          </form>
          <h4>{t('schedule.history')}</h4>
          {progressHistory.length ? <ul>{progressHistory.map((item) => <li key={item.id}>{item.data_date} ? {item.previous_percent_complete}% ? {item.percent_complete}% ? {item.created_by_name || '-'}{item.notes ? ' ? ' + item.notes : ''}</li>)}</ul> : <p>{t('schedule.noProgressHistory')}</p>}
        </div>
      )}
      {assignmentActivity && (
        <div className="card" role="dialog" aria-label={t('schedule.resourceAssignments')} style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          <h3>{assignmentActivity.activity_code} ? {t('schedule.resourceAssignments')}</h3>
          {assignmentError && <p role="alert" className="alert alert-danger">{assignmentError}</p>}
          <form onSubmit={submitAssignment} className="responsive-grid responsive-grid--auto-170" style={{ gap: 8 }}>
            <label>{t('schedule.resource')}<select className="input" required value={assignmentForm.resource} onChange={(event) => setAssignmentForm({ ...assignmentForm, resource: event.target.value })}>
              <option value="">{t('schedule.selectResource')}</option>{resources.map((resource) => <option key={resource.resource_type + ':' + resource.resource_id} value={resource.resource_type + ':' + resource.resource_id}>{resource.name} ({t(resource.resource_type === 'employee' ? 'schedule.employee' : 'schedule.equipment')})</option>)}
            </select></label>
            <label>{t('schedule.assignedFrom')}<input className="input" type="date" required value={assignmentForm.assigned_from} onChange={(event) => setAssignmentForm({ ...assignmentForm, assigned_from: event.target.value })} /></label>
            <label>{t('schedule.assignedTo')}<input className="input" type="date" min={assignmentForm.assigned_from || undefined} required value={assignmentForm.assigned_to} onChange={(event) => setAssignmentForm({ ...assignmentForm, assigned_to: event.target.value })} /></label>
            <label>{t('schedule.allocationPercent')}<input className="input" type="number" min="0.01" max="100" step="0.01" required value={assignmentForm.allocation_percent} onChange={(event) => setAssignmentForm({ ...assignmentForm, allocation_percent: event.target.value })} /></label>
            <label>{t('schedule.assignmentNotes')}<input className="input" value={assignmentForm.notes} onChange={(event) => setAssignmentForm({ ...assignmentForm, notes: event.target.value })} /></label>
            <div style={{ alignSelf: 'end' }}><button className="btn btn-primary" disabled={!resources.length} type="submit">{t('schedule.addAssignment')}</button></div>
          </form>
          {assignments.length ? <div className="table-container"><table className="table"><thead><tr><th>{t('schedule.resource')}</th><th>{t('schedule.assignedFrom')}</th><th>{t('schedule.assignedTo')}</th><th>{t('schedule.allocationPercent')}</th><th>{t('schedule.assignmentStatus')}</th><th>{t('common.actions')}</th></tr></thead><tbody>
            {assignments.map((item) => <tr key={item.id}><td>{item.employee_name || item.asset_name}</td><td>{fmtDate(item.assigned_from)}</td><td>{fmtDate(item.assigned_to)}</td><td>{item.allocation_percent}%</td><td>{assignmentStatusLabel(item.status)}</td><td>{['planned', 'active'].includes(item.status) && <><button className="btn" onClick={() => updateAssignmentStatus(item, item.status === 'planned' ? 'active' : 'completed')}>{t(item.status === 'planned' ? 'schedule.startAssignment' : 'schedule.completeAssignment')}</button> <button className="btn" onClick={() => updateAssignmentStatus(item, 'cancelled')}>{t('schedule.cancelAssignment')}</button></>}</td></tr>)}
          </tbody></table></div> : <p>{resources.length ? t('schedule.noAssignments') : t('schedule.noResources')}</p>}
          <button className="btn" style={{ justifySelf: 'start' }} onClick={() => setAssignmentActivity(null)}>{t('common.cancel')}</button>
        </div>
      )}
      {budgetActivity && (
        <div className="card" role="dialog" aria-label={t('schedule.activityBudget')} style={{ marginTop: 16, display: 'grid', gap: 10, maxWidth: 560 }}>
          <h3>{budgetActivity.activity_code} — {t('schedule.activityBudget')}</h3>
          {budgetError && <p role="alert" className="alert alert-danger">{budgetError}</p>}
          <form onSubmit={submitBudget} style={{ display: 'grid', gap: 8 }}>
            <label>{t('schedule.budgetAtCompletion')}<input className="input" type="number" min="0" step="0.01" value={budgetCost} onChange={(event) => setBudgetCost(event.target.value)} /></label>
            <small>{t('schedule.budgetAtCompletionHelp')}</small>
            <div><button className="btn btn-primary" type="submit" disabled={savingBudget}>{savingBudget ? t('common.loading') : t('common.save')}</button> <button className="btn" type="button" disabled={savingBudget} onClick={() => setBudgetActivity(null)}>{t('common.cancel')}</button></div>
          </form>
        </div>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarRange} text={t('schedule.system.noScheduleActivitiesYetTheGanttIsEmpty')} />
      ) : <GanttList t={t} activities={rows} />}
      {!loading && rows.length > 0 && (
        <div className="table-container" style={{ marginTop: 20 }}>
          <table className="table">
            <thead><tr>
              <th>{t('schedule.system.code')}</th><th>{t('schedule.system.activity')}</th><th>{t('schedule.system.start')}</th>
              <th>{t('schedule.system.finish')}</th><th>{t('schedule.system.dur')}</th>
              <th>{t('schedule.system.complete')}</th><th>{t('schedule.system.critical')}</th><th>{t('schedule.budgetAtCompletion')}</th><th>{t('common.actions')}</th>
            </tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.activity_code}</td>
                  <td style={{ fontWeight: 500 }}>{a.is_milestone ? <Flag size={12} style={{ marginRight: 4 }} /> : null}{a.name}</td>
                  <td>{fmtDate(a.planned_start)}</td>
                  <td>{fmtDate(a.planned_finish)}</td>
                  <td>{a.original_duration}</td>
                  <td>{a.percent_complete || 0}%</td>
                  <td>{a.cpm?.critical ? <span className="badge badge-danger">{t('schedule.system.critical')}</span> : '-'}</td>
                  <td>{a.budgeted_cost ?? '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}><button className="btn" style={{ padding: '4px 10px' }} onClick={() => openProgress(a)}><History size={14} />{t('schedule.updateProgress')}</button> {canEditBudget && <button className="btn" style={{ padding: '4px 10px' }} onClick={() => openBudget(a)}><DollarSign size={14} />{t('schedule.activityBudget')}</button>} <button className="btn" style={{ padding: '4px 10px' }} onClick={() => openAssignments(a)}><Users size={14} />{t('schedule.assignResources')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LoadMore loadedCount={rows.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => load({ append: true })} />
    </div>
  );
}

function ViewsTab({ projectId, locale, t }) {
  const [cpm, setCpm] = useState(null);
  const [lookahead, setLookahead] = useState({ rows: [], weeks: 2 });
  const [delayed, setDelayed] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [scurve, setScurve] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [resourceLoad, setResourceLoad] = useState({ loading: true, error: false, rows: [] });

  useEffect(() => {
    (async () => {
      try {
        const [c, l, d, k, sc, al, rl] = await Promise.all([
          fetchApi(`${API_URL}/schedule/schedule/cpm?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/schedule/lookahead?project_id=${projectId}&weeks=2`),
          fetchApi(`${API_URL}/schedule/schedule/delayed?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/schedule/kpis?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/schedule/s-curve?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/schedule/alerts?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/resource-load?project_id=${projectId}`),
        ]);
        if (c.success) setCpm(c.data);
        if (l.success) setLookahead({ rows: l.data || [], weeks: l.window_weeks || 2 });
        if (d.success) setDelayed(d.data || []);
        if (k.success) setKpis(k.data);
        if (sc.success) setScurve(sc.data || []);
        if (al.success) setAlerts(al.data || []);
        if (rl.success) setResourceLoad({ loading: false, error: false, rows: rl.data || [] });
      } catch (e) { console.error(e); setResourceLoad({ loading: false, error: true, rows: [] }); }
    })();
  }, [projectId]);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {kpis && (
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">{t('schedule.plannedProgress')}</div><div className="stat-value">{kpis.project.planned_progress}%</div></div>
          <div className="stat-card"><div className="stat-label">{t('schedule.actualProgress')}</div><div className="stat-value">{kpis.project.actual_progress}%</div></div>
          <div className="stat-card"><div className="stat-label">{t('schedule.scheduleVariance')}</div>
            <div className="stat-value" style={{ color: kpis.project.schedule_variance_percent < 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' }}>{kpis.project.schedule_variance_percent}%</div></div>
          <div className="stat-card"><div className="stat-label">{t('schedule.system.spi')}</div><div className="stat-value">{kpis.spi ?? '—'}</div></div>
          <div className="stat-card"><div className="stat-label">{t('schedule.cpi')}</div><div className="stat-value">{kpis.project.cpi ?? '—'}</div>{kpis.project.cpi == null && <small>{t(`schedule.cpiStatus.${kpis.cpi_status}`)}</small>}</div>
          {kpis.project.bac != null && <div className="stat-card"><div className="stat-label">{t('schedule.budgetAtCompletion')}</div><div className="stat-value">{Number(kpis.project.bac).toLocaleString(FORMAT_LOCALE[locale])}</div></div>}
        </div>
      )}
      <section className="card" aria-labelledby="schedule-resource-load-title">
        <h3 id="schedule-resource-load-title">{t('schedule.resourceLoad')}</h3>
        {resourceLoad.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><span className="spinner" /></div>
          : resourceLoad.error ? <p role="alert">{t('schedule.resourceLoadFailed')}</p>
            : resourceLoad.rows.length === 0 ? <p>{t('schedule.noResourceLoad')}</p>
              : <div className="table-container"><table className="table"><thead><tr><th>{t('schedule.loadDate')}</th><th>{t('schedule.resource')}</th><th>{t('schedule.dailyAllocation')}</th><th>{t('schedule.activities')}</th></tr></thead><tbody>
                {resourceLoad.rows.map((row) => <tr key={`${row.load_date}:${row.resource_type}:${row.employee_id || row.asset_register_id}`}><td>{fmtDate(row.load_date)}</td><td>{row.resource_name || '—'}</td><td>{row.allocation_percent}%</td><td>{(row.activities || []).map((activity) => activity.activity_code || activity.name).join(', ')}</td></tr>)}
              </tbody></table></div>}
      </section>
      {alerts.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}><AlertTriangle size={14} /> {t('schedule.system.scheduleAlerts')}</h3>
          {alerts.map((a, i) => (
            <div key={i} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--color-surface-raised)' }}>
              {a.type}: {a.name || a.activity_code || a.blocker}
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>
          <Zap size={14} /> {t('schedule.system.criticalPathCpm')}  {t('schedule.system.projectFinish')} {cpm?.project_finish || '—'}
        </h3>
        <GanttList t={t} activities={(cpm?.activities || []).filter(a => a.cpm?.critical)} />
      </div>
      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>{t('schedule.system.weekLookahead', { weeks: lookahead.weeks })}</h3>
        {lookahead.rows.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{t('schedule.system.noActivitiesStartInThisWindow')}</p>
        ) : lookahead.rows.map(a => (
          <div key={a.id} style={{ fontSize: 13, padding: '4px 0' }}>{a.activity_code} — {a.name} ({fmtDate(a.planned_start)})</div>
        ))}
      </div>
      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}><TrendingDown size={14} /> {t('schedule.system.delayedActivities')}</h3>
        {delayed.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{t('schedule.system.noDelayedActivities')}</p>
        ) : delayed.map(a => (
          <div key={a.id} style={{ fontSize: 13, padding: '4px 0' }}>
            {a.activity_code} {a.name}  {t('schedule.system.plannedFinish2')} {fmtDate(a.planned_finish)} @ {a.percent_complete || 0}%
          </div>
        ))}
      </div>
      {scurve.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>{t('schedule.system.sCurve')}</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
            {scurve.map((p, i) => (
              <div key={i} title={`${p.date}: planned ${p.planned_percent}% actual ${p.actual_percent ?? '—'}%`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ height: `${p.actual_percent ?? 0}%`, background: 'var(--color-success)', width: '100%' }} />
                <div style={{ height: `${p.planned_percent}%`, background: 'var(--color-accent)', opacity: 0.4, width: '100%' }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BaselinesTab({ projectId, locale, t }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/schedule/baselines?project_id=${projectId}`);
      if (r.success) setRows(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/schedule/baselines`, { method: 'POST', body: JSON.stringify({ project_id: Number(projectId), name: name || 'Baseline' }) });
      setName('');
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <form onSubmit={submit} className="card" style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 480 }}>
        <input className="input" placeholder={t('schedule.system.baselineName')} value={name} onChange={e => setName(e.target.value)} required />
        <button className="btn btn-primary" type="submit">{t('schedule.system.capture')}</button>
      </form>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Flag} text={t('schedule.system.noBaselinesCaptured')} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>{t('schedule.system.name')}</th><th>{t('schedule.loadDate')}</th>
              <th>{t('schedule.activities')}</th><th>{t('schedule.system.current')}</th>
            </tr></thead>
            <tbody>
              {rows.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 500 }}>{b.name}</td>
                  <td>{fmtDate(b.baseline_date)}</td>
                  <td>{(b.data || []).length}</td>
                  <td>{b.is_current ? <span className="badge badge-success">{t('schedule.system.current')}</span> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Schedule() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState('activities');

  const TABS = [
    { key: 'activities', icon: CalendarRange, label: t('schedule.system.activitiesGantt') },
    { key: 'views', icon: TrendingDown, label: t('schedule.system.analytics') },
    { key: 'baselines', icon: Flag, label: t('schedule.system.baselines') },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /></button>
        <div>
          <h1>{t('schedule.system.schedule')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('schedule.system.activitiesCriticalPathLookaheads')}
          </p>
        </div>
      </div>
      <div className="level-line" />
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb.key} className={`btn ${tab === tb.key ? 'btn-primary' : ''}`} style={{ padding: '6px 16px', fontSize: '13px' }} onClick={() => setTab(tb.key)}>
            <tb.icon size={14} />{tb.label}
          </button>
        ))}
      </div>
      {tab === 'activities' && <ActivitiesTab projectId={id} locale={locale} t={t} />}
      {tab === 'views' && <ViewsTab projectId={id} locale={locale} t={t} />}
      {tab === 'baselines' && <BaselinesTab projectId={id} locale={locale} t={t} />}
    </div>
  );
}
