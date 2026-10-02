import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import {
  Building2, Layers, MapPin, AlertTriangle, FileText,
  Users, Camera, Wallet, RefreshCw,
} from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const TYPE_ICONS = {
  building: Building2,
  floor: Layers,
  site: MapPin,
  zone: MapPin,
  area: MapPin,
  room: Layers,
};

export default function LocationDashboard() {
  const { id: projectId } = useParams();
  const { locale } = useLocale();
  const [locations, setLocations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [progress, setProgress] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weightPolicy, setWeightPolicy] = useState('boq_value');

  const L = {
    en: {
      title: 'Locations & Quantities', select: 'Select a location',
      planned: 'Planned', executed: 'Executed', approved: 'Approved',
      certified: 'Certified', remaining: 'Remaining',
      physical: 'Physical Progress', approvedProgress: 'Approved Progress',
      certifiedProgress: 'Certified Progress', measurements: 'Measurements',
      documents: 'Documents', qhse: 'Quality & HSE', cost: 'Cost & Budget',
      labour: 'Labour', ncr: 'NCRs', observations: 'Observations', spent: 'Spent',
      budget: 'Budget', totalPaid: 'Paid', manDays: 'Man-days',
      weightPolicy: 'Weight policy', projectRollup: 'Project roll-up',
      boq_value: 'BOQ value', planned_quantity: 'Planned quantity',
      manual: 'Manual', schedule: 'Schedule',
    },
    ar: {
      title: 'المواقع والكميات', select: 'اختر موقعاً',
      planned: 'المخطط', executed: 'المنفذ', approved: 'المعتمد',
      certified: 'المُصادق', remaining: 'المتبقي',
      physical: 'الإنجاز الفعلي', approvedProgress: 'الإنجاز المعتمد', certifiedProgress: 'الإنجاز المصادق',
      measurements: 'القياسات',
      documents: 'المستندات', qhse: 'الجودة والسلامة', cost: 'التكلفة والميزانية',
      labour: 'العمالة', ncr: 'مخالفات', observations: 'ملاحظات', spent: 'المصروف',
      budget: 'الميزانية', totalPaid: 'مدفوع', manDays: 'أيام عمل',
      weightPolicy: 'سياسة الوزن', projectRollup: 'إجمالي المشروع',
      boq_value: 'قيمة BOQ', planned_quantity: 'الكمية المخططة',
      manual: 'يدوي', schedule: 'الجدول',
    },
  }[locale === 'ar' ? 'ar' : 'en'];

  const loadLocations = useCallback(async () => {
    try {
      const r = await fetchApi(`${API_URL}/locations/project/${projectId}`);
      setLocations(r.data || []);
      // Default selection: the project root.
      if (r.data && r.data.length > 0 && !selected) setSelected(r.data[0]);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, selected]);

  const loadProgress = useCallback(async (locationId, policy) => {
    try {
      const [p, d] = await Promise.all([
        fetchApi(`${API_URL}/quantities/progress/location/${locationId}`),
        fetchApi(`${API_URL}/quantities/locations/${locationId}/dashboard`),
      ]);
      setProgress(p.data);
      setDashboard(d.data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { loadLocations(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected) loadProgress(selected.id, weightPolicy); }, [selected, weightPolicy]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = async () => { setLoading(true); await loadLocations(); setLoading(false); };

  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', { maximumFractionDigits: 2 }));
  const pct = (n) => (n == null ? '—' : `${Number(n).toFixed(1)}%`);

  const StatRow = ({ label, value, accent }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
      <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent || 'var(--color-text-primary)' }}>{value}</span>
    </div>
  );

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1>{L.title}</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>{L.weightPolicy}:</span>
          <select className="form-select" style={{ width: 'auto' }} value={weightPolicy} onChange={e => setWeightPolicy(e.target.value)}>
            {['boq_value', 'planned_quantity', 'manual', 'schedule'].map(p => (
              <option key={p} value={p}>{L[p] || p}</option>
            ))}
          </select>
          <button className="btn btn-outline" onClick={reload}><RefreshCw size={14} /></button>
        </div>
      </div>

      {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Location tree */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-header"><span className="card-title">{L.select}</span></div>
          <div style={{ padding: 8 }}>
            {locations.map((loc) => {
              const depth = loc.code === 'ROOT' ? 0 : (loc.location_type_name === 'building' ? 1 : 2);
              const Icon = TYPE_ICONS[loc.location_type_code] || MapPin;
              const active = selected && selected.id === loc.id;
              return (
                <button
                  key={loc.id}
                  onClick={() => setSelected(loc)}
                  className={active ? 'btn btn-primary' : 'btn'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'start', justifyContent: 'flex-start', paddingInlineStart: `${8 + depth * 16}px`, marginBottom: 2 }}
                >
                  <Icon size={14} />
                  <span style={{ fontSize: 13 }}>{loc.name}</span>
                  {loc.location_type_name && <span style={{ fontSize: 10, opacity: 0.6 }}>({loc.location_type_name})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Progress + dashboard sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {!progress && !loading && <div className="card">{L.select}</div>}

          {progress && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <Building2 size={16} style={{ display: 'inline', marginRight: 6 }} />
                  {progress.location?.name} — {progress.location?.location_type_name || ''}
                </span>
              </div>
              <div className="stats-grid" style={{ marginBottom: 0 }}>
                <div className="stat-card"><div className="stat-value">{fmt(progress.planned_quantity)}</div><div className="stat-label">{L.planned}</div></div>
                <div className="stat-card"><div className="stat-value">{fmt(progress.executed_quantity)}</div><div className="stat-label">{L.executed}</div></div>
                <div className="stat-card"><div className="stat-value">{fmt(progress.consultant_approved_quantity)}</div><div className="stat-label">{L.approved}</div></div>
                <div className="stat-card"><div className="stat-value">{fmt(progress.certified_quantity)}</div><div className="stat-label">{L.certified}</div></div>
                <div className="stat-card"><div className="stat-value" style={{ color: 'var(--color-warning, #a16207)' }}>{fmt(progress.remaining_quantity)}</div><div className="stat-label">{L.remaining}</div></div>
              </div>
              <div style={{ padding: '12px 16px' }}>
                <StatRow label={L.physical} value={pct(progress.physical_progress)} />
                <StatRow label={L.approvedProgress} value={pct(progress.approved_progress)} />
                <StatRow label={L.certifiedProgress} value={pct(progress.certified_progress)} />
                <StatRow label={L.measurements} value={progress.measurement_count} />
              </div>
            </div>
          )}

          {dashboard && dashboard.documents && (
            <div className="card">
              <div className="card-header"><span className="card-title"><FileText size={16} style={{ display: 'inline', marginRight: 6 }} />{L.documents}</span></div>
              <div style={{ padding: 16 }}>{dashboard.documents.count}</div>
            </div>
          )}

          {dashboard && dashboard.qhse && (
            <div className="card">
              <div className="card-header"><span className="card-title"><AlertTriangle size={16} style={{ display: 'inline', marginRight: 6 }} />{L.qhse}</span></div>
              <div style={{ padding: 16, display: 'flex', gap: 24 }}>
                <div><div style={{ fontWeight: 700 }}>{dashboard.qhse.ncr}</div><div style={{ fontSize: 12, opacity: 0.7 }}>{L.ncr}</div></div>
                <div><div style={{ fontWeight: 700 }}>{dashboard.qhse.observations}</div><div style={{ fontSize: 12, opacity: 0.7 }}>{L.observations}</div></div>
              </div>
            </div>
          )}

          {dashboard && dashboard.cost && (
            <div className="card">
              <div className="card-header"><span className="card-title"><Wallet size={16} style={{ display: 'inline', marginRight: 6 }} />{L.cost}</span></div>
              <div style={{ padding: 16 }}>
                <StatRow label={L.spent} value={fmt(dashboard.cost.spent)} />
                <StatRow label={L.budget} value={fmt(dashboard.cost.budget)} />
              </div>
            </div>
          )}

          {dashboard && dashboard.labour && (
            <div className="card">
              <div className="card-header"><span className="card-title"><Users size={16} style={{ display: 'inline', marginRight: 6 }} />{L.labour}</span></div>
              <div style={{ padding: 16 }}>
                <StatRow label={L.totalPaid} value={fmt(dashboard.labour.total_paid)} />
                <StatRow label={L.manDays} value={fmt(dashboard.labour.man_days)} />
              </div>
            </div>
          )}

          {progress && progress.measurement_count === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
              <Camera size={32} style={{ marginBottom: 8 }} />
              <div>{L.measurements}: 0</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
