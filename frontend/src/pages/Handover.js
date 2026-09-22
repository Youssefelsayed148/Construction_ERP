// Phase 25 — handover, closeout & warranty workspace: the exact lifecycle,
// the package checklist with document upload + completion percent, the asset
// register, and the warranty/DLP claim flow with SLA tracking.
// Zero punch items render a correct 0%/clean state, never an error.

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { openProtectedFile } from '../components/ProtectedMedia';
import { ArrowLeft, Plus, KeyRound, PackageCheck, CheckCircle } from 'lucide-react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = `${API_BASE_URL}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const downloadPdf = (path, filename) => openProtectedFile(path);

const fmtDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.getDate().toString().padStart(2, '0')}/${(dt.getMonth() + 1).toString().padStart(2, '0')}/${dt.getFullYear()}`;
};

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 60 }}>
      <Icon size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }} />
      <p style={{ color: 'var(--color-text-secondary)' }}>{text}</p>
    </div>
  );
}

const STATUS_BADGE = { pending: 'badge-info', uploaded: 'badge-warning', approved: 'badge-info', complete: 'badge-success' };
const CLAIM_STATUS_BADGE = { raised: 'badge-danger', assigned: 'badge-warning', rectification_in_progress: 'badge-warning', submitted_for_acceptance: 'badge-info', accepted: 'badge-success', rejected: 'badge-danger', closed: 'badge-info' };

export default function Handover() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [tab, setTab] = useState('lifecycle');
  const [data, setData] = useState(null);
  const [assets, setAssets] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, c] = await Promise.all([
        fetchApi(`${API_URL}/handover/process/${id}`),
        fetchApi(`${API_URL}/handover/assets?project_id=${id}`).catch(() => ({ data: [] })),
        fetchApi(`${API_URL}/handover/claims?project_id=${id}`).catch(() => ({ data: [] })),
      ]);
      setData(p.data || { process: null, readiness: { percent: 0 } });
      setAssets(a.data || []);
      setClaims(c.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const start = async () => {
    try {
      await fetchApi(`${API_URL}/handover/process/${id}/start`, { method: 'POST', body: '{}' });
      load();
    } catch (e) { alert(e.message); }
  };

  const advance = async () => {
    const process = data?.process;
    if (!process) return;
    const states = ['pre_handover', 'punch_snag', 'rectification', 'final_inspection', 'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over', 'dlp_warranty', 'final_completion'];
    const next = states[states.indexOf(process.status) + 1];
    if (!next) return;
    try {
      await fetchApi(`${API_URL}/handover/process/${process.id}/transition`, { method: 'POST', body: JSON.stringify({ status: next }) });
      load();
    } catch (e) { alert(e.message); }
  };

  const markItem = async (item) => {
    const v = prompt(locale === 'ar' ? 'أضف رابط المستند لهذا البند:' : 'Paste the document URL for this item:', item.document_url || '');
    if (v == null) return;
    try {
      await fetchApi(`${API_URL}/handover/package/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ document_url: v, status: 'uploaded' }) });
      load();
    } catch (e) { alert(e.message); }
  };

  const verifyItem = async (item, status) => {
    try {
      await fetchApi(`${API_URL}/handover/package/items/${item.id}/verify`, { method: 'POST', body: JSON.stringify({ status }) });
      load();
    } catch (e) { alert(e.message); }
  };

  const raiseAsset = async () => {
    const code = prompt(locale === 'ar' ? 'رمز الأصل' : 'Asset code');
    if (!code) return;
    const name = prompt(locale === 'ar' ? 'اسم الأصل' : 'Asset name') || code;
    try {
      await fetchApi(`${API_URL}/handover/assets`, { method: 'POST', body: JSON.stringify({ project_id: Number(id), asset_code: code, name }) });
      load();
    } catch (e) { alert(e.message); }
  };

  const raiseClaim = async () => {
    const title = prompt(locale === 'ar' ? 'عنوان المطالبة' : 'Claim title');
    if (!title) return;
    try {
      await fetchApi(`${API_URL}/handover/claims`, { method: 'POST', body: JSON.stringify({ project_id: Number(id), title, description: title, sla_days: 30 }) });
      load();
    } catch (e) { alert(e.message); }
  };

  const TABS = [
    { key: 'lifecycle', icon: ArrowLeft, label: locale === 'ar' ? 'دورة التسليم' : 'Lifecycle' },
    { key: 'package', icon: PackageCheck, label: locale === 'ar' ? 'حزمة التسليم' : 'Handover package' },
    { key: 'assets', icon: KeyRound, label: locale === 'ar' ? 'سجل الأصول' : 'Asset register' },
    { key: 'claims', icon: CheckCircle, label: locale === 'ar' ? 'مطالبات الضمان' : 'Warranty claims' },
  ];

  const readiness = data?.readiness || { percent: 0, items_total: 0, open_punch_items: 0 };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: 20 }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}><ArrowLeft size={16} /></button>
        <div>
          <h1>{locale === 'ar' ? 'التسليم والإقفال' : 'Handover & closeout'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'دورة التسليم والحزمة وسجل الأصول ومطالبات الضمان' : 'Lifecycle, package checklist, asset register & warranty claims'}
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-label">{locale === 'ar' ? 'جاهزية التسليم' : 'Handover readiness'}</div>
          <div className="stat-value" style={{ color: readiness.percent === 100 ? 'var(--color-success)' : 'var(--color-accent)' }}>{readiness.percent}%</div></div>
        <div className="stat-card"><div className="stat-label">{locale === 'ar' ? 'بنود الحزمة' : 'Package items'}</div>
          <div className="stat-value">{readiness.items_total ? `${readiness.items_complete}/${readiness.items_total}` : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">{locale === 'ar' ? 'بنود PUNCH مفتوحة' : 'Open punch items'}</div>
          <div className="stat-value" style={{ color: readiness.open_punch_items > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)' }}>{readiness.open_punch_items}</div></div>
        <div className="stat-card"><div className="stat-label">{locale === 'ar' ? 'مطالبات الضمان' : 'Warranty claims'}</div>
          <div className="stat-value">{claims.length || '—'}</div></div>
      </div>

      <div className="level-line" />

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(tb => (
          <button key={tb.key} className={`btn ${tab === tb.key ? 'btn-primary' : ''}`} style={{ padding: '6px 16px', fontSize: 13 }} onClick={() => setTab(tb.key)}>
            <tb.icon size={14} />{tb.label}
          </button>
        ))}
      </div>

      {tab === 'lifecycle' && (
        !data?.process ? (
          <EmptyState icon={ArrowLeft} text={locale === 'ar' ? 'لم تبدأ دورة التسليم بعد.' : 'No handover process started yet.'} />
        ) : (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 600 }}>{data.process.process_number}</span>
              <span className="badge badge-info">{data.process.status}</span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {['pre_handover', 'punch_snag', 'rectification', 'final_inspection', 'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over', 'dlp_warranty', 'final_completion'].map(s => {
                const states = ['pre_handover', 'punch_snag', 'rectification', 'final_inspection', 'testing_commissioning', 'as_builts', 'o_m', 'training', 'taking_over', 'dlp_warranty', 'final_completion'];
                const reached = states.indexOf(s) <= states.indexOf(data.process.status);
                return (
                  <div key={s} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: reached ? 'var(--color-success)' : 'var(--color-surface-raised)' }} />
                    {s.replace(/_/g, ' ')}
                  </div>
                );
              })}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={advance}>Advance</button>
          </div>
        )
      )}

      {tab === 'lifecycle' && !data?.process && (
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={start}>Start handover process</button>
      )}

      {tab === 'package' && (
        !data?.items || data.items.length === 0 ? (
          <EmptyState icon={PackageCheck} text={locale === 'ar' ? 'الحزمة فارغة (0% جاهزية).' : 'The handover package is empty — 0% complete.'} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>#</th><th>{locale === 'ar' ? 'البند' : 'Item'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{t('common.actions')}</th></tr></thead>
              <tbody>
                {data.items.map((item, idx) => (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td style={{ fontWeight: 500 }}>{item.title}{item.document_url ? <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{item.document_url}</div> : null}</td>
                    <td><span className={`badge ${STATUS_BADGE[item.status] || 'badge-info'}`}>{item.status}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn" style={{ padding: '4px 10px' }} onClick={() => markItem(item)}>{locale === 'ar' ? 'مستند' : 'Document'}</button>{' '}
                      {item.status !== 'complete' && (
                        <>
                          <button className="btn" style={{ padding: '4px 10px' }} onClick={() => verifyItem(item, 'approved')}>{locale === 'ar' ? 'اعتماد' : 'Approve'}</button>{' '}
                          <button className="btn" style={{ padding: '4px 10px' }} onClick={() => verifyItem(item, 'complete')}>{locale === 'ar' ? 'مكتمل' : 'Complete'}</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === 'assets' && (
        <>
          <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={raiseAsset}><Plus size={16} />{locale === 'ar' ? 'أصل جديد' : 'New asset'}</button>
          {assets.length === 0 ? (
            <EmptyState icon={KeyRound} text={locale === 'ar' ? 'لا توجد أصول.' : 'No assets registered yet.'} />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Code</th><th>{locale === 'ar' ? 'الاسم' : 'Name'}</th><th>Serial</th><th>{locale === 'ar' ? 'التشغيل' : 'Commissioned'}</th><th>{locale === 'ar' ? 'نهاية الضمان' : 'Warranty end'}</th></tr></thead>
                <tbody>
                  {assets.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.asset_code}</td>
                      <td>{a.name}</td>
                      <td>{a.serial_no || '-'}</td>
                      <td>{fmtDate(a.commissioning_date)}</td>
                      <td>{fmtDate(a.warranty_end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'claims' && (
        <>
          <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={raiseClaim}><Plus size={16} />{locale === 'ar' ? 'مطالبة جديدة' : 'New claim'}</button>
          {claims.length === 0 ? (
            <EmptyState icon={CheckCircle} text={locale === 'ar' ? 'لا مطالبات — السجل نظيف.' : 'No warranty claims — the DLP register is clean.'} />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Claim</th><th>{locale === 'ar' ? 'العنوان' : 'Title'}</th><th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{locale === 'ar' ? 'الاستحقاق' : 'Due'}</th></tr></thead>
                <tbody>
                  {claims.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{c.claim_number}</td>
                      <td style={{ fontWeight: 500 }}>{c.title}</td>
                      <td><span className={`badge ${CLAIM_STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                      <td>{fmtDate(c.due_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="card" style={{ padding: 12, marginTop: 20 }}>
        <h4 style={{ fontSize: 13, marginBottom: 8 }}>{locale === 'ar' ? 'المستندات' : 'Documents'}</h4>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => downloadPdf(`/api/handover/checklist/${id}/pdf`, 'checklist.pdf')}>Checklist PDF</button>
          <button className="btn" onClick={() => downloadPdf(`/api/handover/assets/${id}/pdf`, 'assets.pdf')}>Asset register PDF</button>
          <button className="btn" onClick={() => downloadPdf(`/api/handover/warranty-register/${id}/pdf`, 'warranty.pdf')}>Warranty register PDF</button>
          <button className="btn" onClick={() => downloadPdf(`/api/handover/certificate/${id}/pdf`, 'certificate.pdf')}>Handover certificate</button>
        </div>
      </div>
    </div>
  );
}
