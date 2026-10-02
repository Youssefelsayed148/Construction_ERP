// Phase 22 — planning & scheduling workspace: activities + Gantt-style bars,
// CPM critical path, lookaheads (2/4/6 weeks), delayed activities, SV%/SPI,
// S-curve, alerts, baselines and CSV import/export.
// Zero-record states render explicitly, never a blank screen.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Plus, CalendarRange, AlertTriangle, TrendingDown, Download, Flag, Zap } from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
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
function GanttList({ activities }) {
  const usable = activities.filter(a => a.planned_start && a.planned_finish);
  if (usable.length === 0) {
    return <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
      {activities.length > 0 ? 'Activities need planned start/finish dates to draw bars.' : ''}</p>;
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
          <div key={a.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 220px) 1fr 76px 64px', gap: 8, alignItems: 'center', fontSize: 13 }}>
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

function ActivitiesTab({ projectId, locale, t }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', work_package: '', planned_start: '', planned_finish: '', original_duration: 0, is_milestone: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetchApi(`${API_URL}/schedule/activities?project_id=${projectId}`);
      if (r.success) setRows(r.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await fetchApi(`${API_URL}/schedule/activities`, { method: 'POST', body: JSON.stringify({
        project_id: Number(projectId), name: form.name, work_package: form.work_package || null,
        planned_start: form.planned_start || null, planned_finish: form.planned_finish || null,
        original_duration: Number(form.original_duration) || 0, is_milestone: form.is_milestone,
      }) });
      setShowModal(false);
      setForm({ name: '', work_package: '', planned_start: '', planned_finish: '', original_duration: 0, is_milestone: false });
      load();
    } catch (err) { alert(err.message); }
  };

  const setProgress = async (a) => {
    const v = prompt(locale === 'ar' ? 'نسبة الإنجاز %' : 'Percent complete %', a.percent_complete || 0);
    if (v == null) return;
    try {
      await fetchApi(`${API_URL}/schedule/activities/${a.id}/progress`, { method: 'POST', body: JSON.stringify({ percent_complete: Number(v) }) });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={async () => {
          const res = await fetch(`${API_URL}/schedule/activities/export?project_id=${projectId}`, { headers: headers() });
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = `schedule-${projectId}.csv`; a.click(); URL.revokeObjectURL(a.href);
        }}><Download size={16} /> CSV</button>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} />{locale === 'ar' ? 'نشاط جديد' : 'New Activity'}</button>
      </div>
      {showModal && (
        <form className="card" onSubmit={submit} style={{ marginBottom: 16, display: 'grid', gap: 10, maxWidth: 560 }}>
          <input className="input" required placeholder={locale === 'ar' ? 'اسم النشاط' : 'Activity name'} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="input" type="date" title="Planned start" value={form.planned_start} onChange={e => setForm({ ...form, planned_start: e.target.value })} />
            <input className="input" type="date" title="Planned finish" value={form.planned_finish} onChange={e => setForm({ ...form, planned_finish: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input className="input" placeholder={locale === 'ar' ? 'حزمة العمل' : 'Work package'} value={form.work_package} onChange={e => setForm({ ...form, work_package: e.target.value })} />
            <input className="input" type="number" min="0" placeholder={locale === 'ar' ? 'المدة (أيام)' : 'Duration (days)'} value={form.original_duration} onChange={e => setForm({ ...form, original_duration: e.target.value })} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.is_milestone} onChange={e => setForm({ ...form, is_milestone: e.target.checked })} />
            {locale === 'ar' ? 'معلم' : 'Milestone'}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" type="submit">{t('common.save') || 'Save'}</button>
            <button className="btn" type="button" onClick={() => setShowModal(false)}>Cancel</button>
          </div>
        </form>
      )}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={CalendarRange} text={locale === 'ar' ? 'لا توجد أنشطة مجدولة.' : 'No schedule activities yet — the Gantt is empty.'} />
      ) : <GanttList activities={rows} />}
      {!loading && rows.length > 0 && (
        <div className="table-container" style={{ marginTop: 20 }}>
          <table className="table">
            <thead><tr>
              <th>Code</th><th>{locale === 'ar' ? 'النشاط' : 'Activity'}</th><th>{locale === 'ar' ? 'البداية' : 'Start'}</th>
              <th>{locale === 'ar' ? 'النهاية' : 'Finish'}</th><th>{locale === 'ar' ? 'المدة' : 'Dur.'}</th>
              <th>{locale === 'ar' ? 'الإنجاز' : '% Complete'}</th><th>{locale === 'ar' ? 'حرج' : 'Critical'}</th><th>{t('common.actions')}</th>
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
                  <td>{a.cpm?.critical ? <span className="badge badge-danger">Critical</span> : '-'}</td>
                  <td><button className="btn" style={{ padding: '4px 10px' }} onClick={() => setProgress(a)}>{locale === 'ar' ? 'تحديث' : 'Update progress'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ViewsTab({ projectId, locale }) {
  const [cpm, setCpm] = useState(null);
  const [lookahead, setLookahead] = useState({ rows: [], weeks: 2 });
  const [delayed, setDelayed] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [scurve, setScurve] = useState([]);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [c, l, d, k, sc, al] = await Promise.all([
          fetchApi(`${API_URL}/schedule/schedule/cpm?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/schedule/lookahead?project_id=${projectId}&weeks=2`),
          fetchApi(`${API_URL}/schedule/schedule/delayed?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/schedule/kpis?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/schedule/s-curve?project_id=${projectId}`),
          fetchApi(`${API_URL}/schedule/schedule/alerts?project_id=${projectId}`),
        ]);
        if (c.success) setCpm(c.data);
        if (l.success) setLookahead({ rows: l.data || [], weeks: l.window_weeks || 2 });
        if (d.success) setDelayed(d.data || []);
        if (k.success) setKpis(k.data);
        if (sc.success) setScurve(sc.data || []);
        if (al.success) setAlerts(al.data || []);
      } catch (e) { console.error(e); }
    })();
  }, [projectId]);

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {kpis && (
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Planned progress</div><div className="stat-value">{kpis.project.planned_progress}%</div></div>
          <div className="stat-card"><div className="stat-label">Actual progress</div><div className="stat-value">{kpis.project.actual_progress}%</div></div>
          <div className="stat-card"><div className="stat-label">Schedule variance</div>
            <div className="stat-value" style={{ color: kpis.project.schedule_variance_percent < 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' }}>{kpis.project.schedule_variance_percent}%</div></div>
          <div className="stat-card"><div className="stat-label">SPI</div><div className="stat-value">{kpis.spi ?? '—'}</div></div>
        </div>
      )}
      {alerts.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}><AlertTriangle size={14} /> {locale === 'ar' ? 'تنبيهات الجدولة' : 'Schedule alerts'}</h3>
          {alerts.map((a, i) => (
            <div key={i} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--color-surface-raised)' }}>
              {a.type}: {a.name || a.activity_code || a.blocker}
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>
          <Zap size={14} /> {locale === 'ar' ? 'المسار الحرج (CPM)' : 'Critical path (CPM)'} — project finish: {cpm?.project_finish || '—'}
        </h3>
        <GanttList activities={(cpm?.activities || []).filter(a => a.cpm?.critical)} />
      </div>
      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>{locale === 'ar' ? `نافذة ${lookahead.weeks} أسابيع` : `${lookahead.weeks}-week lookahead`}</h3>
        {lookahead.rows.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{locale === 'ar' ? 'لا أنشطة في النافذة.' : 'No activities start in this window.'}</p>
        ) : lookahead.rows.map(a => (
          <div key={a.id} style={{ fontSize: 13, padding: '4px 0' }}>{a.activity_code} — {a.name} ({fmtDate(a.planned_start)})</div>
        ))}
      </div>
      <div className="card" style={{ padding: 12 }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}><TrendingDown size={14} /> {locale === 'ar' ? 'أنشطة متأخرة' : 'Delayed activities'}</h3>
        {delayed.length === 0 ? (
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{locale === 'ar' ? 'لا أنشطة متأخرة.' : 'No delayed activities.'}</p>
        ) : delayed.map(a => (
          <div key={a.id} style={{ fontSize: 13, padding: '4px 0' }}>
            {a.activity_code} {a.name} — planned finish {fmtDate(a.planned_finish)} @ {a.percent_complete || 0}%
          </div>
        ))}
      </div>
      {scurve.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>S-curve</h3>
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
        <input className="input" placeholder={locale === 'ar' ? 'اسم خط الأساس' : 'Baseline name'} value={name} onChange={e => setName(e.target.value)} required />
        <button className="btn btn-primary" type="submit">{locale === 'ar' ? 'التقاط' : 'Capture'}</button>
      </form>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Flag} text={locale === 'ar' ? 'لا توجد خطوط أساس.' : 'No baselines captured.'} />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>{locale === 'ar' ? 'الاسم' : 'Name'}</th><th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
              <th>{locale === 'ar' ? 'الأنشطة' : 'Activities'}</th><th>{locale === 'ar' ? 'الحالي' : 'Current'}</th>
            </tr></thead>
            <tbody>
              {rows.map(b => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 500 }}>{b.name}</td>
                  <td>{fmtDate(b.baseline_date)}</td>
                  <td>{(b.data || []).length}</td>
                  <td>{b.is_current ? <span className="badge badge-success">{locale === 'ar' ? 'الحالي' : 'Current'}</span> : '-'}</td>
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
    { key: 'activities', icon: CalendarRange, label: locale === 'ar' ? 'الأنشطة والجانت' : 'Activities & Gantt' },
    { key: 'views', icon: TrendingDown, label: locale === 'ar' ? 'التحليلات' : 'Analytics' },
    { key: 'baselines', icon: Flag, label: locale === 'ar' ? 'خطوط الأساس' : 'Baselines' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /></button>
        <div>
          <h1>{locale === 'ar' ? 'الجدولة' : 'Schedule'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'الأنشطة والمسار الحرج والنظرات المستقبلية' : 'Activities, critical path & lookaheads'}
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
      {tab === 'views' && <ViewsTab projectId={id} locale={locale} />}
      {tab === 'baselines' && <BaselinesTab projectId={id} locale={locale} t={t} />}
    </div>
  );
}
