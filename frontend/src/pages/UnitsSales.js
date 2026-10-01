import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { ArrowLeft, Plus, Building2, LayoutGrid, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const UNIT_TYPES = ['apartment', 'villa', 'penthouse', 'studio', 'townhouse', 'duplex', 'commercial', 'plot', 'office'];
const UNIT_TYPE_LABELS = {
  en: { apartment: 'Apartment', villa: 'Villa', penthouse: 'Penthouse', studio: 'Studio', townhouse: 'Townhouse', duplex: 'Duplex', commercial: 'Commercial', plot: 'Plot', office: 'Office' },
  ar: { apartment: 'شقة', villa: 'فيلا', penthouse: 'بنتهاوس', studio: 'استوديو', townhouse: 'تاون هاوس', duplex: 'دوبلكس', commercial: 'تجاري', plot: 'قطعة أرض', office: 'مكتب' }
};

const FINISHING_LABELS = {
  en: { finished: 'Finished', semi_finished: 'Semi-finished', core_shell: 'Core & Shell', land_only: 'Land Only' },
  ar: { finished: 'متشطب', semi_finished: 'نصف تشطيب', core_shell: 'هيكل خرساني', land_only: 'أرض فقط' }
};

const UNIT_STATUS_LABELS = {
  en: { available: 'Available', reserved: 'Reserved', contracted: 'Contracted', delivered: 'Delivered', blocked: 'Blocked', closed: 'Closed' },
  ar: { available: 'متاح', reserved: 'محجوز', contracted: 'متعاقد', delivered: 'مسلّم', blocked: 'موقوف', closed: 'مغلق' }
};
const UNIT_STATUS_BADGE = { available: 'badge-success', reserved: 'badge-warning', contracted: 'badge-info', delivered: 'badge-info', blocked: 'badge-danger', closed: 'badge-info' };
const UNIT_STATUS_COLOR = {
  available: 'var(--color-success)', reserved: 'var(--color-warning)',
  contracted: 'var(--color-accent)', delivered: 'var(--color-accent)',
  blocked: 'var(--color-danger, #e5534b)', closed: 'var(--color-text-secondary)',
};
const UNIT_TRANSITIONS = {
  available: ['reserved', 'blocked'],
  reserved: ['contracted', 'available'],
  contracted: ['delivered', 'reserved'],
  delivered: ['closed'],
  blocked: ['available'],
};

const BUILDING_STATUS_LABELS = {
  en: { planning: 'Planning', under_construction: 'Under Construction', completed: 'Completed' },
  ar: { planning: 'تخطيط', under_construction: 'تحت الإنشاء', completed: 'مكتمل' }
};

function UnitsSales() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [buildings, setBuildings] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [buildingModal, setBuildingModal] = useState(false);
  const [bulkModal, setBulkModal] = useState(null);
  const [unitModal, setUnitModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, sRes] = await Promise.all([
        fetchApi(`${API_URL}/sales/buildings?project_id=${id}`),
        fetchApi(`${API_URL}/sales/summary?project_id=${id}`),
      ]);
      if (bRes.success) {
        setBuildings(bRes.data || []);
        setSelectedBuilding(prev => prev ? (bRes.data.find(b => b.id === prev.id) || bRes.data[0] || null) : (bRes.data[0] || null));
      }
      if (sRes.success) setSummary(sRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const statusCounts = summary?.by_status || {};
  const summaryCards = [
    { label: locale === 'ar' ? 'إجمالي الوحدات' : 'Total Units', value: summary?.total_units || 0 },
    { label: UNIT_STATUS_LABELS[locale].available, value: statusCounts.available?.count || 0, color: 'var(--color-success)' },
    { label: UNIT_STATUS_LABELS[locale].reserved, value: statusCounts.reserved?.count || 0, color: 'var(--color-warning)' },
    { label: locale === 'ar' ? 'مبيعات' : 'Sold Value', value: formatCurrency(summary?.total_sold_amount || 0), color: 'var(--color-accent)' },
  ];

  return (
    <div className="page-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <button className="btn" onClick={() => navigate(`/projects/${id}`)}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <h1>{locale === 'ar' ? 'الوحدات والمبيعات' : 'Units & Sales'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'المباني والوحدات وحالة البيع' : 'Buildings, unit inventory & sales status'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setBuildingModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة مبنى' : 'Add Building'}
        </button>
      </div>

      <div className="level-line" />

      <div className="stats-grid">
        {summaryCards.map((c, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-label">{c.label}</div>
            <div className="stat-value" style={c.color ? { color: c.color } : {}}>{c.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
      ) : buildings.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Building2 size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد مبانٍ. أضف أول مبنى.' : 'No buildings yet. Add your first building.'}
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {buildings.map(b => (
              <button key={b.id} className={`btn ${selectedBuilding?.id === b.id ? 'btn-primary' : ''}`}
                style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => setSelectedBuilding(b)}>
                <Building2 size={14} />
                {b.code} — {b.name}
                <span className="badge badge-info" style={{ marginLeft: '6px' }}>{b.units_count}</span>
              </button>
            ))}
          </div>

          {selectedBuilding && (
            <BuildingPanel key={selectedBuilding.id} building={selectedBuilding} locale={locale} t={t}
              onBulk={() => setBulkModal(selectedBuilding)}
              onAddUnit={() => setUnitModal(selectedBuilding)}
              onChanged={load} />
          )}
        </>
      )}

      {buildingModal && <BuildingModal projectId={id} locale={locale} t={t} onClose={() => setBuildingModal(false)} onSave={load} />}
      {bulkModal && <BulkUnitsModal building={bulkModal} locale={locale} t={t} onClose={() => setBulkModal(null)} onSave={load} />}
      {unitModal && <UnitModal building={unitModal} locale={locale} t={t} onClose={() => setUnitModal(null)} onSave={load} />}
    </div>
  );
}

function BuildingPanel({ building, locale, t, onBulk, onAddUnit, onChanged }) {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/sales/buildings/${building.id}/units`);
      if (res.success) setUnits(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [building.id]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (unit, status) => {
    let extra = {};
    if (status === 'contracted') {
      const amount = prompt(locale === 'ar' ? 'قيمة البيع:' : 'Sold amount:', unit.price || '');
      if (amount === null) return;
      if (amount) extra.sold_amount = Number(amount);
    }
    if (status === 'delivered') {
      extra.handover_date = new Date().toISOString().slice(0, 10);
    }
    try {
      await fetchApi(`${API_URL}/sales/units/${unit.id}/status`, {
        method: 'POST', body: JSON.stringify({ status, ...extra }),
      });
      load(); onChanged();
    } catch (e) { alert(e.message); }
  };

  const deleteUnit = async (unit) => {
    if (!window.confirm(locale === 'ar' ? `حذف الوحدة ${unit.code}؟` : `Delete unit ${unit.code}?`)) return;
    try {
      await fetchApi(`${API_URL}/sales/units/${unit.id}`, { method: 'DELETE' });
      load(); onChanged();
    } catch (e) { alert(e.message); }
  };

  const filtered = statusFilter === 'all' ? units : units.filter(u => u.status === statusFilter);

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h3 className="card-title">{building.code} — {building.name}</h3>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {BUILDING_STATUS_LABELS[locale]?.[building.status] || building.status} · {Number(building.floor_count) || 0} {locale === 'ar' ? 'طوابق' : 'floors'} · {Number(building.completion_percentage) || 0}% {locale === 'ar' ? 'إنجاز' : 'complete'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={onAddUnit}>
            <Plus size={14} />
            {locale === 'ar' ? 'وحدة' : 'Unit'}
          </button>
          <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={onBulk}>
            <LayoutGrid size={14} />
            {locale === 'ar' ? 'توليد وحدات' : 'Bulk Generate'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {['all', 'available', 'reserved', 'contracted', 'delivered', 'blocked', 'closed'].map(s => (
          <button key={s} className={`btn ${statusFilter === s ? 'btn-primary' : ''}`} style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setStatusFilter(s)}>
            {s === 'all' ? (locale === 'ar' ? 'الكل' : 'All') : (UNIT_STATUS_LABELS[locale]?.[s] || s)}
            {s !== 'all' && <span style={{ marginLeft: '4px', opacity: 0.7 }}>({units.filter(u => u.status === s).length})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}><span className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px 0' }}>
          {locale === 'ar' ? 'لا توجد وحدات.' : 'No units.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px' }}>
          {filtered.map(u => (
            <div key={u.id} style={{
              border: '1px solid var(--color-surface-raised)',
              borderLeft: `3px solid ${UNIT_STATUS_COLOR[u.status]}`,
              borderRadius: 'var(--radius-md)', padding: '12px',
              background: 'var(--color-surface)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.code}</span>
                <span className={`badge ${UNIT_STATUS_BADGE[u.status]}`}>{UNIT_STATUS_LABELS[locale]?.[u.status] || u.status}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span>{UNIT_TYPE_LABELS[locale]?.[u.type] || u.type} · {locale === 'ar' ? 'طابق' : 'Floor'} {u.floor_no ?? '-'}</span>
                <span>{u.area ? `${u.area} m²` : '-'} {u.bedrooms != null ? `· ${u.bedrooms}BR` : ''} {u.bathrooms != null ? `· ${u.bathrooms}BA` : ''}</span>
                <span>{FINISHING_LABELS[locale]?.[u.finishing_type] || u.finishing_type}</span>
                {u.price && <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{formatCurrency(u.price)}</span>}
                {u.sold_amount && <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{locale === 'ar' ? 'بيعت بـ' : 'Sold'}: {formatCurrency(u.sold_amount)}</span>}
              </div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '10px', flexWrap: 'wrap' }}>
                {(UNIT_TRANSITIONS[u.status] || []).map(next => (
                  <button key={next} className="btn" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => changeStatus(u, next)}>
                    → {UNIT_STATUS_LABELS[locale]?.[next] || next}
                  </button>
                ))}
                {['available', 'blocked'].includes(u.status) && (
                  <button className="btn btn-danger" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => deleteUnit(u)}>
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildingModal({ projectId, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({ code: '', name: '', floors: 1, status: 'planning', completion_percentage: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = {
        ...form, project_id: Number(projectId),
        floors: Number(form.floors) || 1,
        completion_percentage: Number(form.completion_percentage) || 0,
      };
      const res = await fetchApi(`${API_URL}/sales/buildings`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'إضافة مبنى' : 'Add Building'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الكود' : 'Code'} *</label>
                  <input className="form-input" value={form.code} onChange={e => handleChange('code', e.target.value)} placeholder="B1" required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الاسم' : 'Name'} *</label>
                  <input className="form-input" value={form.name} onChange={e => handleChange('name', e.target.value)} required />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الطوابق' : 'Floors'}</label>
                  <input className="form-input" type="number" min="1" value={form.floors} onChange={e => handleChange('floors', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.status')}</label>
                  <select className="form-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                    {['planning', 'under_construction', 'completed'].map(s => <option key={s} value={s}>{BUILDING_STATUS_LABELS[locale]?.[s] || s}</option>)}
                  </select>
                </div>
              </div>
              {error && <div className="alert alert-danger">{error}</div>}
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

function BulkUnitsModal({ building, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({
    floors: Number(building.floor_count) || 1, units_per_floor: 1,
    start_floor: 1, prefix: '', type: 'apartment', area: '', bedrooms: '', bathrooms: '',
    finishing_type: 'semi_finished', price: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = {
        floors: Number(form.floors), units_per_floor: Number(form.units_per_floor),
        start_floor: Number(form.start_floor) || 1, prefix: form.prefix,
        type: form.type, finishing_type: form.finishing_type,
      };
      if (form.area) body.area = Number(form.area);
      if (form.bedrooms) body.bedrooms = Number(form.bedrooms);
      if (form.bathrooms) body.bathrooms = Number(form.bathrooms);
      if (form.price) body.price = Number(form.price);
      const res = await fetchApi(`${API_URL}/sales/buildings/${building.id}/bulk-units`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const count = (Number(form.floors) || 0) * (Number(form.units_per_floor) || 0);
  const exampleCode = `${form.prefix}${form.start_floor}01`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? `توليد وحدات — ${building.code}` : `Bulk Generate Units — ${building.code}`}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الطوابق' : 'Floors'} *</label>
                  <input className="form-input" type="number" min="1" value={form.floors} onChange={e => handleChange('floors', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'وحدات/طابق' : 'Units/Floor'} *</label>
                  <input className="form-input" type="number" min="1" value={form.units_per_floor} onChange={e => handleChange('units_per_floor', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'أول طابق' : 'Start Floor'}</label>
                  <input className="form-input" type="number" value={form.start_floor} onChange={e => handleChange('start_floor', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'بادئة' : 'Prefix'}</label>
                  <input className="form-input" value={form.prefix} onChange={e => handleChange('prefix', e.target.value)} placeholder="A-" />
                </div>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {locale === 'ar'
                  ? `سيتم إنشاء ${count} وحدة (مثال: ${exampleCode})`
                  : `Will create ${count} units (e.g. ${exampleCode})`}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'النوع' : 'Type'}</label>
                  <select className="form-select" value={form.type} onChange={e => handleChange('type', e.target.value)}>
                    {UNIT_TYPES.map(ut => <option key={ut} value={ut}>{UNIT_TYPE_LABELS[locale]?.[ut] || ut}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التشطيب' : 'Finishing'}</label>
                  <select className="form-select" value={form.finishing_type} onChange={e => handleChange('finishing_type', e.target.value)}>
                    {Object.keys(FINISHING_LABELS.en).map(ft => <option key={ft} value={ft}>{FINISHING_LABELS[locale]?.[ft] || ft}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المساحة م²' : 'Area m²'}</label>
                  <input className="form-input" type="number" min="0" value={form.area} onChange={e => handleChange('area', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'غرف' : 'Beds'}</label>
                  <input className="form-input" type="number" min="0" value={form.bedrooms} onChange={e => handleChange('bedrooms', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'حمامات' : 'Baths'}</label>
                  <input className="form-input" type="number" min="0" value={form.bathrooms} onChange={e => handleChange('bathrooms', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'السعر' : 'Price'}</label>
                  <input className="form-input" type="number" min="0" value={form.price} onChange={e => handleChange('price', e.target.value)} />
                </div>
              </div>
              {error && <div className="alert alert-danger">{error}</div>}
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

function UnitModal({ building, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({
    code: '', type: 'apartment', area: '', bedrooms: '', bathrooms: '',
    floor_no: '', finishing_type: 'semi_finished', price: '', view: '', facing: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const body = { code: form.code, type: form.type, finishing_type: form.finishing_type, view: form.view, facing: form.facing };
      if (form.area) body.area = Number(form.area);
      if (form.bedrooms) body.bedrooms = Number(form.bedrooms);
      if (form.bathrooms) body.bathrooms = Number(form.bathrooms);
      if (form.floor_no) body.floor_no = Number(form.floor_no);
      if (form.price) body.price = Number(form.price);
      const res = await fetchApi(`${API_URL}/sales/buildings/${building.id}/units`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else setError(res.error || 'Save failed');
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? `إضافة وحدة — ${building.code}` : `Add Unit — ${building.code}`}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الكود' : 'Code'} *</label>
                  <input className="form-input" value={form.code} onChange={e => handleChange('code', e.target.value)} placeholder="101" required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'النوع' : 'Type'}</label>
                  <select className="form-select" value={form.type} onChange={e => handleChange('type', e.target.value)}>
                    {UNIT_TYPES.map(ut => <option key={ut} value={ut}>{UNIT_TYPE_LABELS[locale]?.[ut] || ut}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الطابق' : 'Floor'}</label>
                  <input className="form-input" type="number" value={form.floor_no} onChange={e => handleChange('floor_no', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المساحة م²' : 'Area m²'}</label>
                  <input className="form-input" type="number" min="0" value={form.area} onChange={e => handleChange('area', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'غرف' : 'Beds'}</label>
                  <input className="form-input" type="number" min="0" value={form.bedrooms} onChange={e => handleChange('bedrooms', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'حمامات' : 'Baths'}</label>
                  <input className="form-input" type="number" min="0" value={form.bathrooms} onChange={e => handleChange('bathrooms', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'السعر' : 'Price'}</label>
                  <input className="form-input" type="number" min="0" value={form.price} onChange={e => handleChange('price', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التشطيب' : 'Finishing'}</label>
                  <select className="form-select" value={form.finishing_type} onChange={e => handleChange('finishing_type', e.target.value)}>
                    {Object.keys(FINISHING_LABELS.en).map(ft => <option key={ft} value={ft}>{FINISHING_LABELS[locale]?.[ft] || ft}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الإطلالة' : 'View'}</label>
                  <input className="form-input" value={form.view} onChange={e => handleChange('view', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الاتجاه' : 'Facing'}</label>
                  <input className="form-input" value={form.facing} onChange={e => handleChange('facing', e.target.value)} />
                </div>
              </div>
              {error && <div className="alert alert-danger">{error}</div>}
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

export default UnitsSales;
