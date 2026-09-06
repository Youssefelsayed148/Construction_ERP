import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { Search, Plus, Edit, Trash2, Truck, X } from 'lucide-react';
import EGYPT_CITIES from '../constants/egyptCities';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const SPECIALTY_LABELS = {
  en: {
    concrete: 'Concrete', steel: 'Steel', electrical: 'Electrical', plumbing: 'Plumbing',
    wood: 'Wood', paint_coating: 'Paint & Coating', aggregate: 'Aggregate',
    equipment: 'Equipment', safety: 'Safety', general: 'General', other: 'Other'
  },
  ar: {
    concrete: 'خرسانة', steel: 'حديد', electrical: 'كهرباء', plumbing: 'سباكة',
    wood: 'خشب', paint_coating: 'دهانات', aggregate: 'ركام',
    equipment: 'معدات', safety: 'سلامة', general: 'عام', other: 'أخرى'
  }
};

const specialties = ['concrete', 'steel', 'electrical', 'plumbing', 'wood', 'paint_coating', 'aggregate', 'equipment', 'safety', 'general', 'other'];

function Suppliers() {
  const { t, locale } = useLocale();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedSpecialty) params.append('specialty', selectedSpecialty);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/suppliers?${params}`);
      if (res.success) setSuppliers(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedSpecialty, searchQuery]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  const handleDelete = async (id) => {
    if (locale === 'ar') {
      const name = prompt('اكتب اسم المورد للحذف:');
      const supplier = suppliers.find(i => i.id === id);
      if (name !== supplier?.name_en && name !== supplier?.name_ar) return;
    } else {
      const name = prompt('Type supplier name to confirm delete:');
      const supplier = suppliers.find(i => i.id === id);
      if (name !== supplier?.name_en && name !== supplier?.name_ar) return;
    }
    try {
      await fetchApi(`${API_URL}/suppliers/${id}`, { method: 'DELETE' });
      loadSuppliers();
    } catch (e) { alert(e.message); }
  };

  const specialtyLabel = (s) => SPECIALTY_LABELS[locale]?.[s] || s;
  const supplierName = (s) => locale === 'ar' ? s.name_ar : s.name_en;
  const cityDisplay = (city) => {
    if (!city) return '-';
    const match = EGYPT_CITIES.find(c => c.en === city);
    return match ? (locale === 'ar' ? match.ar : match.en) : city;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{locale === 'ar' ? 'الموردين' : 'Suppliers'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'قاعدة بيانات الموردين' : 'Supplier Database'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingSupplier(null); setShowModal(true); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة مورد' : 'Add Supplier'}
        </button>
      </div>

      <div className="level-line" />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${!selectedSpecialty ? 'btn-primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setSelectedSpecialty('')}
        >
          {t('common.all')}
        </button>
        {specialties.map(s => (
          <button
            key={s}
            className={`btn ${selectedSpecialty === s ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px' }}
            onClick={() => setSelectedSpecialty(s)}
          >
            {specialtyLabel(s)}
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
            placeholder={locale === 'ar' ? 'بحث عن موردين...' : 'Search suppliers...'}
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
      ) : suppliers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Truck size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا يوجد موردين. أضف أول مورد.' : 'No suppliers found. Add your first supplier.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{t('common.name')}</th>
                <th>{locale === 'ar' ? 'الشخص المسؤول' : 'Contact Person'}</th>
                <th>{locale === 'ar' ? 'الهاتف' : 'Phone'}</th>
                <th>{locale === 'ar' ? 'المدينة' : 'City'}</th>
                <th>{t('common.category')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => (
                <tr key={s.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{s.code}</td>
                  <td>{supplierName(s)}</td>
                  <td>{s.contact_person || '-'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{s.phone || '-'}</td>
                  <td>{cityDisplay(s.city)}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    {specialtyLabel(s.specialty)}
                  </td>
                  <td>
                    <span className={`badge ${s.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {s.is_active ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'غير نشط' : 'Inactive')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingSupplier(s); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(s.id)}>
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

      {showModal && <SupplierModal
        supplier={editingSupplier}
        locale={locale}
        t={t}
        onClose={() => setShowModal(false)}
        onSave={loadSuppliers}
      />}
    </div>
  );
}

function SupplierModal({ supplier, locale, t, onClose, onSave }) {
  const isEdit = !!supplier;
  const [form, setForm] = useState({
    name_en: supplier?.name_en || '',
    name_ar: supplier?.name_ar || '',
    contact_person: supplier?.contact_person || '',
    phone: supplier?.phone || '',
    email: supplier?.email || '',
    address: supplier?.address || '',
    city: supplier?.city || '',
    specialty: supplier?.specialty || 'general',
    tax_id: supplier?.tax_id || '',
    payment_terms: supplier?.payment_terms || '',
    is_active: supplier?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/suppliers/${supplier.id}` : `${API_URL}/suppliers`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetchApi(url, { method, body: JSON.stringify(form) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit
              ? (locale === 'ar' ? `تعديل: ${supplier.code}` : `Edit: ${supplier.code}`)
              : (locale === 'ar' ? 'إضافة مورد جديد' : 'Add New Supplier')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                  <label className="form-label">{locale === 'ar' ? 'الشخص المسؤول' : 'Contact Person'}</label>
                  <input className="form-input" value={form.contact_person} onChange={e => handleChange('contact_person', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الهاتف' : 'Phone'}</label>
                  <input className="form-input" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.category')}</label>
                  <select className="form-select" value={form.specialty} onChange={e => handleChange('specialty', e.target.value)}>
                    {specialties.map(s => <option key={s} value={s}>{SPECIALTY_LABELS[locale]?.[s] || s}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'العنوان' : 'Address'}</label>
                  <input className="form-input" value={form.address} onChange={e => handleChange('address', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المدينة' : 'City'}</label>
                  <select className="form-select" value={form.city} onChange={e => handleChange('city', e.target.value)}>
                    <option value="">-- {locale === 'ar' ? 'اختر المدينة' : 'Select City'} --</option>
                    {!EGYPT_CITIES.some(c => c.en === form.city) && form.city && (
                      <option value={form.city} disabled>{form.city}</option>
                    )}
                    {EGYPT_CITIES.map(c => (
                      <option key={c.en} value={c.en}>
                        {locale === 'ar' ? c.ar : c.en}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الرقم الضريبي' : 'Tax ID'}</label>
                  <input className="form-input" value={form.tax_id} onChange={e => handleChange('tax_id', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'شروط الدفع' : 'Payment Terms'}</label>
                  <input className="form-input" value={form.payment_terms} onChange={e => handleChange('payment_terms', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => handleChange('is_active', e.target.checked)} />
                  <span className="form-label" style={{ margin: 0 }}>{locale === 'ar' ? 'نشط' : 'Active'}</span>
                </label>
              </div>

              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>

          {isEdit && <SuppliedMaterials supplierId={supplier.id} locale={locale} />}
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

function SuppliedMaterials({ supplierId, locale }) {
  const [links, setLinks] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ material_id: '', unit_price: '', lead_time_days: '', notes: '' });
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [linksRes, itemsRes] = await Promise.all([
        fetchApi(`${API_URL}/suppliers/${supplierId}/materials`),
        fetchApi(`${API_URL}/items?limit=500&is_active=true`),
      ]);
      if (linksRes.success) setLinks(linksRes.data || []);
      if (itemsRes.success) setItems(itemsRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [supplierId]);

  useEffect(() => { load(); }, [load]);

  const itemName = (i) => locale === 'ar' ? i.name_ar : (i.name_en || i.name_ar);
  const linkedIds = new Set(links.map(l => l.material_id));
  const availableItems = items.filter(i => !linkedIds.has(i.id));

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.material_id) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetchApi(`${API_URL}/suppliers/${supplierId}/materials`, {
        method: 'POST',
        body: JSON.stringify({
          material_id: Number(form.material_id),
          unit_price: form.unit_price ? Number(form.unit_price) : null,
          lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : null,
          notes: form.notes || '',
        }),
      });
      if (res.success) {
        setForm({ material_id: '', unit_price: '', lead_time_days: '', notes: '' });
        load();
      } else { setError(res.error || 'Failed to link material'); }
    } catch (e) { setError(e.message); }
    finally { setAdding(false); }
  };

  const handleRemove = async (materialId) => {
    try {
      await fetchApi(`${API_URL}/suppliers/${supplierId}/materials/${materialId}`, { method: 'DELETE' });
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--color-surface-raised)' }}>
      <h4 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 600 }}>
        {locale === 'ar' ? 'المواد الموردة' : 'Supplied Materials'}
      </h4>

      {loading ? (
        <span className="spinner" />
      ) : (
        <>
          {links.length === 0 ? (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '12px' }}>
              {locale === 'ar' ? 'لا توجد مواد مرتبطة بعد.' : 'No materials linked yet.'}
            </p>
          ) : (
            <div className="table-container" style={{ marginBottom: '12px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{locale === 'ar' ? 'المادة' : 'Material'}</th>
                    <th>{locale === 'ar' ? 'سعر الوحدة' : 'Unit Price'}</th>
                    <th>{locale === 'ar' ? 'مدة التوريد (يوم)' : 'Lead Time (days)'}</th>
                    <th>{locale === 'ar' ? 'ملاحظات' : 'Notes'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {links.map(l => (
                    <tr key={l.id}>
                      <td>{locale === 'ar' ? l.material_name_ar : (l.material_name_en || l.material_name_ar)} <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>({l.material_code})</span></td>
                      <td style={{ fontFamily: 'monospace' }}>{l.unit_price != null ? Number(l.unit_price).toFixed(2) : '-'}</td>
                      <td style={{ fontFamily: 'monospace' }}>{l.lead_time_days != null ? l.lead_time_days : '-'}</td>
                      <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{l.notes || '-'}</td>
                      <td>
                        <button type="button" className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleRemove(l.material_id)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{locale === 'ar' ? 'إضافة مادة' : 'Add Material'}</label>
              <select className="form-select" value={form.material_id} onChange={e => setForm(f => ({ ...f, material_id: e.target.value }))}>
                <option value="">-- {locale === 'ar' ? 'اختر مادة' : 'Select material'} --</option>
                {availableItems.map(i => (
                  <option key={i.id} value={i.id}>{itemName(i)} ({i.code})</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{locale === 'ar' ? 'السعر' : 'Price'}</label>
              <input className="form-input" type="number" step="0.01" min="0" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{locale === 'ar' ? 'مدة التوريد' : 'Lead Time'}</label>
              <input className="form-input" type="number" min="0" value={form.lead_time_days} onChange={e => setForm(f => ({ ...f, lead_time_days: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</label>
              <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <button type="button" className="btn btn-primary" disabled={!form.material_id || adding} onClick={handleAdd}>
              <Plus size={14} />
            </button>
          </div>
          {error && <div className="alert alert-danger" style={{ marginTop: '8px' }}>{error}</div>}
        </>
      )}
    </div>
  );
}

export default Suppliers;
