import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { Search, Plus, Edit, Trash2, Wrench, X } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const CATEGORY_LABELS = {
  en: {
    earthmoving: 'Earthmoving', lifting: 'Lifting', concrete: 'Concrete',
    compaction: 'Compaction', transport: 'Transport', generator: 'Generator',
    tool: 'Tool', other: 'Other'
  },
  ar: {
    earthmoving: 'حفر وتحميل', lifting: 'رفع', concrete: 'خرسانة',
    compaction: 'دك وضغط', transport: 'نقل', generator: 'مولدات',
    tool: 'أدوات', other: 'أخرى'
  }
};

const EQUIPMENT_TYPE_LABELS = {
  en: { owned: 'Owned', rented: 'Rented' },
  ar: { owned: 'مملوكة', rented: 'مستأجرة' }
};

function Assets() {
  const { t, locale } = useLocale();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [projects, setProjects] = useState([]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/projects?status=active&limit=200`);
      if (res.success) setProjects(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/assets?${params}`);
      if (res.success) setAssets(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedCategory, searchQuery]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const handleDelete = async (id) => {
    if (locale === 'ar') {
      const name = prompt('اكتب اسم المعدة للحذف:');
      const asset = assets.find(i => i.id === id);
      if (name !== asset?.name_en && name !== asset?.name_ar) return;
    } else {
      const name = prompt('Type equipment name to confirm delete:');
      const asset = assets.find(i => i.id === id);
      if (name !== asset?.name_en && name !== asset?.name_ar) return;
    }
    try {
      await fetchApi(`${API_URL}/assets/${id}`, { method: 'DELETE' });
      loadAssets();
    } catch (e) { alert(e.message); }
  };

  const categoryLabel = (cat) => CATEGORY_LABELS[locale]?.[cat] || cat;
  const typeLabel = (t) => EQUIPMENT_TYPE_LABELS[locale]?.[t] || t;
  const assetName = (asset) => locale === 'ar' ? asset.name_ar : asset.name_en;

  const categories = ['earthmoving', 'lifting', 'concrete', 'compaction', 'transport', 'generator', 'tool', 'other'];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('assets.title') || (locale === 'ar' ? 'المعدات' : 'Equipment')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'إدارة معدات وأصول المشروع' : 'Project Equipment & Asset Management'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingAsset(null); loadProjects(); setShowModal(true); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة معدة' : 'Add Equipment'}
        </button>
      </div>

      <div className="level-line" />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${!selectedCategory ? 'btn-primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setSelectedCategory('')}
        >
          {t('common.all')}
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            className={`btn ${selectedCategory === cat ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px' }}
            onClick={() => setSelectedCategory(cat)}
          >
            {categoryLabel(cat)}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', maxWidth: '400px' }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن معدة...' : 'Search equipment...'}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : assets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Wrench size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد معدات. أضف أول معدة.' : 'No equipment found. Add your first equipment.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{t('common.name')}</th>
                <th>{t('common.category')}</th>
                <th>{locale === 'ar' ? 'النوع' : 'Type'}</th>
                <th>{locale === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</th>
                <th>{locale === 'ar' ? 'سعر اليوم' : 'Daily Rate'}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{asset.code}</td>
                  <td>{assetName(asset)}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>{categoryLabel(asset.category)}</td>
                  <td style={{ fontSize: '13px' }}>{typeLabel(asset.equipment_type)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{asset.hourly_rate != null ? Number(asset.hourly_rate).toFixed(2) : '-'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{asset.daily_rate != null ? Number(asset.daily_rate).toFixed(2) : '-'}</td>
                  <td>
                    <span className={`badge ${asset.status === 'available' ? 'badge-success' : asset.status === 'in_use' ? 'badge-warning' : asset.status === 'maintenance' ? 'badge-danger' : 'badge-info'}`}>
                      {asset.status === 'available' ? (locale === 'ar' ? 'متاحة' : 'Available')
                        : asset.status === 'in_use' ? (locale === 'ar' ? 'قيد الاستخدام' : 'In Use')
                        : asset.status === 'maintenance' ? (locale === 'ar' ? 'صيانة' : 'Maintenance')
                        : asset.status || '—'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingAsset(asset); loadProjects(); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(asset.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <AssetModal
        asset={editingAsset}
        locale={locale}
        t={t}
        projects={projects}
        onClose={() => setShowModal(false)}
        onSave={loadAssets}
      />}
    </div>
  );
}

function AssetModal({ asset, locale, t, projects, onClose, onSave }) {
  const isEdit = !!asset;
  const [form, setForm] = useState({
    name_en: asset?.name_en || '',
    name_ar: asset?.name_ar || '',
    category: asset?.category || '',
    equipment_type: asset?.equipment_type || '',
    manufacturer: asset?.manufacturer || '',
    model: asset?.model || '',
    serial_number: asset?.serial_number || '',
    purchase_date: asset?.purchase_date ? asset.purchase_date.slice(0, 10) : '',
    purchase_cost: asset?.purchase_cost || '',
    hourly_rate: asset?.hourly_rate || '',
    daily_rate: asset?.daily_rate || '',
    operator_required: asset?.operator_required || false,
    current_project_id: asset?.current_project_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/assets/${asset.id}` : `${API_URL}/assets`;
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        ...form,
        purchase_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        daily_rate: form.daily_rate ? Number(form.daily_rate) : null,
        current_project_id: form.current_project_id ? Number(form.current_project_id) : null,
      };
      const res = await fetchApi(url, { method, body: JSON.stringify(payload) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const CATEGORIES = ['earthmoving', 'lifting', 'concrete', 'compaction', 'transport', 'generator', 'tool', 'other'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit
              ? (locale === 'ar' ? `تعديل: ${asset.code}` : `Edit: ${asset.code}`)
              : (locale === 'ar' ? 'إضافة معدة جديدة' : 'Add New Equipment')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isEdit && (
                <div className="form-group">
                  <label className="form-label">{t('common.code')}</label>
                  <input className="form-input" value={asset.code} disabled />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">English Name *</label>
                  <input className="form-input" value={form.name_en} onChange={e => handleChange('name_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم العربي *</label>
                  <input className="form-input" value={form.name_ar} onChange={e => handleChange('name_ar', e.target.value)} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('common.category')} *</label>
                  <select className="form-select" value={form.category} onChange={e => handleChange('category', e.target.value)} required>
                    <option value="">-- {locale === 'ar' ? 'اختر الفئة' : 'Select Category'} --</option>
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{CATEGORY_LABELS[locale]?.[c] || c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'نوع المعدة' : 'Equipment Type'} *</label>
                  <select className="form-select" value={form.equipment_type} onChange={e => handleChange('equipment_type', e.target.value)} required>
                    <option value="">-- {locale === 'ar' ? 'اختر النوع' : 'Select Type'} --</option>
                    <option value="owned">{locale === 'ar' ? 'مملوكة' : 'Owned'}</option>
                    <option value="rented">{locale === 'ar' ? 'مستأجرة' : 'Rented'}</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الشركة المصنعة' : 'Manufacturer'}</label>
                  <input className="form-input" value={form.manufacturer} onChange={e => handleChange('manufacturer', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الموديل' : 'Model'}</label>
                  <input className="form-input" value={form.model} onChange={e => handleChange('model', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الرقم التسلسلي' : 'Serial Number'}</label>
                  <input className="form-input" value={form.serial_number} onChange={e => handleChange('serial_number', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ الشراء' : 'Purchase Date'}</label>
                  <input className="form-input" type="date" value={form.purchase_date} onChange={e => handleChange('purchase_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تكلفة الشراء' : 'Purchase Cost'}</label>
                  <input className="form-input" type="number" step="0.01" value={form.purchase_cost} onChange={e => handleChange('purchase_cost', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'سعر الساعة' : 'Hourly Rate'}</label>
                  <input className="form-input" type="number" step="0.01" value={form.hourly_rate} onChange={e => handleChange('hourly_rate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'سعر اليوم' : 'Daily Rate'}</label>
                  <input className="form-input" type="number" step="0.01" value={form.daily_rate} onChange={e => handleChange('daily_rate', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الموقع' : 'Location'}</label>
                <select className="form-select" value={form.current_project_id} onChange={e => handleChange('current_project_id', e.target.value)}>
                  <option value="">{locale === 'ar' ? 'في المخزن (غير مخصصة)' : 'In Yard (Unassigned)'}</option>
                  {form.current_project_id && !projects.some(p => String(p.id) === String(form.current_project_id)) && (
                    <option value={form.current_project_id} disabled>
                      {locale === 'ar' ? (asset?.current_project_name_ar || 'مشروع غير نشط') : (asset?.current_project_name_en || asset?.current_project_name_ar || 'Inactive project')}
                    </option>
                  )}
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{locale === 'ar' ? p.name_ar : (p.name_en || p.name_ar)} ({p.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.operator_required} onChange={e => handleChange('operator_required', e.target.checked)} />
                  <span className="form-label" style={{ margin: 0 }}>{locale === 'ar' ? 'تحتاج مشغل' : 'Operator Required'}</span>
                </label>
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

export default Assets;
