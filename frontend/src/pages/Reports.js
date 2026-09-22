// Phase 24 — reports workspace: catalog + saved views + scheduled reports +
// exports (CSV/PDF) + the automatic project report. Permission-aware: the
// columns shown are exactly what the server returned for this user.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Download, FileSpreadsheet, BellRing, Save, Package } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

function download(url, filename) {
  fetch(url, { headers: headers() }).then(r => {
    if (!r.ok) throw new Error('Export failed');
    return r.blob();
  }).then(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }).catch(e => alert(e.message));
}

const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
};

export default function Reports() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [catalog, setCatalog] = useState(null);
  const [savedViews, setSavedViews] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [reportKey, setReportKey] = useState('projects');
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [projectReport, setProjectReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadCatalog = useCallback(async () => {
    try {
      const r = await fetchApi(`${API_URL}/reports/catalog`);
      if (r.success) setCatalog(r.data);
    } catch (e) { console.error(e); }
  }, []);

  const loadSaved = useCallback(async () => {
    try {
      const r = await fetchApi(`${API_URL}/reports/saved-views`);
      if (r.success) setSavedViews(r.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const loadScheduled = useCallback(async () => {
    try {
      const r = await fetchApi(`${API_URL}/reports/scheduled${id ? `?project_id=${id}` : ''}`);
      if (r.success) setScheduled(r.data || []);
    } catch (e) { console.error(e); }
  }, [id]);

  const loadData = useCallback(async (key) => {
    setReportKey(key);
    try {
      const r = await fetchApi(`${API_URL}/reports/data/${key}${id ? `?project_id=${id}` : ''}`);
      if (r.success) { setRows(r.data.rows || []); setColumns(r.data.columns || []); }
    } catch (e) { console.error(e); }
  }, [id]);

  useEffect(() => {
    (async () => {
      await Promise.all([loadCatalog(), loadSaved(), loadScheduled()]);
      await loadData('projects');
      if (id) {
        try {
          const r = await fetchApi(`${API_URL}/reports/project-report/${id}`);
          if (r.success) setProjectReport(r.data);
        } catch (e) { console.error(e); }
      }
      setLoading(false);
    })();
  }, [loadCatalog, loadSaved, loadScheduled, loadData, id]);

  const saveView = async () => {
    const name = prompt(locale === 'ar' ? 'اسم العرض' : 'View name');
    if (!name) return;
    try {
      await fetchApi(`${API_URL}/reports/saved-views`, { method: 'POST', body: JSON.stringify({
        module: reportKey, name, params: id ? { project_id: id } : {},
      }) });
      loadSaved();
    } catch (e) { alert(e.message); }
  };

  const scheduleReport = async () => {
    if (!id) { alert(locale === 'ar' ? 'افتح من داخل مشروع' : 'Open from inside a project first'); return; }
    try {
      await fetchApi(`${API_URL}/reports/scheduled`, { method: 'POST', body: JSON.stringify({
        project_id: Number(id), report_key: reportKey, name: `${reportKey} weekly`, frequency: 'weekly', format: 'pdf',
      }) });
      loadScheduled();
    } catch (e) { alert(e.message); }
  };

  const reportSpec = catalog && (catalog.reports || []).find(r => r.key === reportKey);
  const isProjectReport = Boolean(id);

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(id ? `/projects/${id}` : '/dashboard')}><ArrowLeft size={16} /></button>
        <div>
          <h1>{locale === 'ar' ? 'التقارير' : 'Reports'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'كتالوج التقارير والتصدير والتقارير المجدولة' : 'Catalog, exports, saved views & schedules'}
          </p>
        </div>
      </div>
      <div className="level-line" />

      {loading || !catalog ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><span className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {(catalog.reports || []).map(r => (
                <button key={r.key} className={`btn ${reportKey === r.key ? 'btn-primary' : ''}`} style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => loadData(r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
            {reportSpec && (
              <div className="table-container">
                <table className="table">
                  <thead><tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr><td colSpan={columns.length || 1} style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        {locale === 'ar' ? 'لا سجلات.' : 'No records.'}
                      </td></tr>
                    ) : rows.map((row, i) => (
                      <tr key={row.id || i}>{columns.map(c => <td key={c.key}>{String(row[c.key] == null ? '-' : row[c.key]).slice(0, 40)}</td>)}</tr>
                    ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={() => download(`${API_URL}/reports/export/${reportKey}${id ? `?project_id=${id}` : ''}&format=csv`, `${reportKey}-report.csv`)}><Save size={14} /> CSV</button>
              <button className="btn" onClick={() => download(`${API_URL}/reports/export/${reportKey}?format=pdf${id ? `&project_id=${id}` : ''}`, `${reportKey}-report.pdf`)}><Package size={14} /> PDF</button>
              <button className="btn" onClick={saveView}>Save view</button>
              <button className="btn" onClick={scheduleReport}>Schedule</button>
            </div>
            {savedViews.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <h4 style={{ fontSize: 13, marginBottom: 6 }}>Saved views</h4>
                {savedViews.map(v => <div key={v.id} style={{ fontSize: 13, padding: '3px 0' }}>{v.name} · {v.module}</div>)}
              </div>
            )}
            {scheduled.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <h4 style={{ fontSize: 13, marginBottom: 6 }}>Scheduled reports</h4>
                {scheduled.map(s => (
                  <div key={s.id} style={{ fontSize: 13, padding: '3px 0' }}>
                    {s.name} — {s.frequency} ({s.format}) · runs: {s.run_count}
                  </div>
                ))}
              </div>
            )}
          </div>

          {isProjectReport && (
            <div className="card" style={{ padding: 12 }}>
              <h3 className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>
                {locale === 'ar' ? 'تقرير المشروع التلقائي' : 'Automatic project report'} — {projectReport?.project_name || ''}
              </h3>
              <button className="btn" onClick={() => download(`${API_URL}/reports/project-report/${id}/pdf`, `project-report-${id}.pdf`)}><Save size={14} /> PDF</button>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {(projectReport?.sections || []).map(s => (
                  <div key={s.key} style={{ borderBottom: '1px solid var(--color-surface-raised)', paddingBottom: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{(s.lines || []).join(' · ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
