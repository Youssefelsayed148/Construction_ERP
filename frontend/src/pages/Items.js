import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { Search, Plus, Edit, Trash2, Package, X } from 'lucide-react';

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
    raw_material: 'Raw Materials', finished_material: 'Finished Materials',
    equipment_rental: 'Equipment Rental', consumable: 'Consumables',
    tool: 'Tools', safety: 'Safety', other: 'Other'
  },
  ar: {
    raw_material: 'مواد خام', finished_material: 'مواد مصنعة',
    equipment_rental: 'تأجير معدات', consumable: 'مواد استهلاكية',
    tool: 'أدوات', safety: 'سلامة', other: 'أخرى'
  }
};

const UNIT_LABELS = {
  en: { ton: 'Ton', m3: 'm³', m2: 'm²', piece: 'Piece', linear_m: 'Linear Meter', bag: 'Bag', liter: 'Liter', set: 'Set', lot: 'Lot' },
  ar: { ton: 'طن', m3: 'م³', m2: 'م²', piece: 'قطعة', linear_m: 'متر طولي', bag: 'كيس', liter: 'لتر', set: 'طقم', lot: 'لوط' }
};

const SUB_CATEGORY_LABELS = {
  en: {
    aggregate: 'Aggregate', cement: 'Cement', steel: 'Steel', concrete_premix: 'Ready-Mix Concrete',
    brick_block: 'Brick & Block', wood: 'Wood', piping: 'Piping', electrical: 'Electrical',
    plumbing: 'Plumbing', insulation: 'Insulation', paint_coating: 'Paint & Coating', glass: 'Glass',
    door: 'Door', window: 'Window', sanitary_fixture: 'Sanitary Fixture', lighting: 'Lighting',
    tile_flooring: 'Tile & Flooring', cabinetry: 'Cabinetry', precast: 'Precast',
    earthmoving: 'Earthmoving', lifting: 'Lifting', concrete: 'Concrete', compaction: 'Compaction',
    generator: 'Generator', scaffolding: 'Scaffolding',
    fuel: 'Fuel', lubricant: 'Lubricant', fastener: 'Fastener', adhesive_sealant: 'Adhesive & Sealant',
    protective_gear: 'Protective Gear', cleaning: 'Cleaning',
    hand_tool: 'Hand Tool', power_tool: 'Power Tool', measuring: 'Measuring', welding: 'Welding', cutting: 'Cutting',
    ppe: 'PPE', signage: 'Signage', barricade: 'Barricade', fire_safety: 'Fire Safety', first_aid: 'First Aid',
    other: 'Other',
  },
  ar: {
    aggregate: 'ركام', cement: 'أسمنت', steel: 'حديد', concrete_premix: 'خرسانة جاهزة',
    brick_block: 'طوب وبلوك', wood: 'خشب', piping: 'مواسير', electrical: 'كهرباء',
    plumbing: 'سباكة', insulation: 'عزل', paint_coating: 'دهانات', glass: 'زجاج',
    door: 'باب', window: 'نافذة', sanitary_fixture: 'أدوات صحية', lighting: 'إضاءة',
    tile_flooring: 'بلاط وأرضيات', cabinetry: 'خزائن', precast: 'خرسانة سابقة الصب',
    earthmoving: 'حفر وتحميل', lifting: 'رفع', concrete: 'خرسانة', compaction: 'دك وضغط',
    generator: 'مولدات', scaffolding: 'سقالات',
    fuel: 'وقود', lubricant: 'زيوت', fastener: 'مثبتات', adhesive_sealant: 'لواصق وعوازل',
    protective_gear: 'معدات وقاية', cleaning: 'تنظيف',
    hand_tool: 'أدوات يدوية', power_tool: 'أدوات كهربائية', measuring: 'قياس', welding: 'لحام', cutting: 'قطع',
    ppe: 'معدات وقاية شخصية', signage: 'لافتات', barricade: 'حواجز', fire_safety: 'سلامة من الحريق', first_aid: 'إسعافات أولية',
    other: 'أخرى',
  }
};

function Items() {
  const { t, locale } = useLocale();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/items?${params}`);
      if (res.success) setItems(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedCategory, searchQuery]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleDelete = async (id) => {
    if (locale === 'ar') {
      const name = prompt('اكتب اسم العنصر للحذف:');
      const item = items.find(i => i.id === id);
      if (name !== item?.name_en && name !== item?.name_ar) return;
    } else {
      const name = prompt('Type item name to confirm delete:');
      const item = items.find(i => i.id === id);
      if (name !== item?.name_en && name !== item?.name_ar) return;
    }
    try {
      await fetchApi(`${API_URL}/items/${id}`, { method: 'DELETE' });
      loadItems();
    } catch (e) { alert(e.message); }
  };

  const categoryLabel = (cat) => CATEGORY_LABELS[locale]?.[cat] || cat;
  const unitLabel = (unit) => UNIT_LABELS[locale]?.[unit] || unit;
  const itemName = (item) => locale === 'ar' ? item.name_ar : item.name_en;

  const categories = ['raw_material', 'finished_material', 'equipment_rental', 'consumable', 'tool', 'safety', 'other'];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('common.nav.inventory')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'كتالوج مواد الإنشاءات' : 'Construction Materials Catalog'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowModal(true); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة مادة' : 'Add Item'}
        </button>
      </div>

      <div className="level-line" />

      {/* Category tabs */}
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

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', maxWidth: '400px' }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن مواد...' : 'Search items...'}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Items table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Package size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد مواد. أضف أول مادة.' : 'No items found. Add your first item.'}
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
                <th>{t('common.unit')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{item.code}</td>
                  <td>{itemName(item)}</td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    {categoryLabel(item.category)}{item.sub_category ? ` → ${SUB_CATEGORY_LABELS[locale]?.[item.sub_category] || item.sub_category}` : ''}
                  </td>
                  <td>{unitLabel(item.unit)}</td>
                  <td>
                    <span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {item.is_active ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'غير نشط' : 'Inactive')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingItem(item); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(item.id)}>
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

      {/* Create/Edit Modal */}
      {showModal && <ItemModal
        item={editingItem}
        locale={locale}
        t={t}
        onClose={() => setShowModal(false)}
        onSave={loadItems}
      />}
    </div>
  );
}

function ItemModal({ item, locale, t, onClose, onSave }) {
  const isEdit = !!item;
  const [form, setForm] = useState({
    category: item?.category || 'raw_material',
    sub_category: item?.sub_category || '',
    unit: item?.unit || 'piece',
    name_en: item?.name_en || '',
    name_ar: item?.name_ar || '',
    description: item?.description || '',
    is_active: item?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [subCategoriesByCategory, setSubCategoriesByCategory] = useState({});

  useEffect(() => {
    fetchApi(`${API_URL}/items/categories`)
      .then(res => { if (res.success) setSubCategoriesByCategory(res.data.sub_categories || {}); })
      .catch(() => {});
  }, []);

  const handleChange = (field, value) => setForm(f => {
    const next = { ...f, [field]: value };
    if (field === 'category') next.sub_category = '';
    return next;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/items/${item.id}` : `${API_URL}/items`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetchApi(url, { method, body: JSON.stringify(form) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const CATEGORIES = ['raw_material', 'finished_material', 'equipment_rental', 'consumable', 'tool', 'safety', 'other'];
  const subCategoryOptions = subCategoriesByCategory[form.category] || [];
  const ALL_UNITS = ['ton', 'm3', 'm2', 'piece', 'linear_m', 'bag', 'liter', 'set', 'lot'];
  const UNIT_LABELS = {
    en: { ton: 'Ton', m3: 'm³', m2: 'm²', piece: 'Piece', linear_m: 'Linear Meter', bag: 'Bag', liter: 'Liter', set: 'Set', lot: 'Lot' },
    ar: { ton: 'طن', m3: 'م³', m2: 'م²', piece: 'قطعة', linear_m: 'متر طولي', bag: 'كيس', liter: 'لتر', set: 'طقم', lot: 'لوط' }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit ? (locale === 'ar' ? `تعديل: ${item.code}` : `Edit: ${item.code}`) : (locale === 'ar' ? 'إضافة مادة جديدة' : 'Add New Item')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الكود' : 'Code'}</label>
                  <input
                    className="form-input"
                    value={isEdit ? item.code : (locale === 'ar' ? '(سيتم توليده تلقائياً)' : '(auto-generated)')}
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الوحدة' : 'Unit'}</label>
                  <select className="form-select" value={form.unit} onChange={e => handleChange('unit', e.target.value)}>
                    {ALL_UNITS.map(u => <option key={u} value={u}>{UNIT_LABELS[locale]?.[u] || u}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الفئة الرئيسية' : 'Category'}</label>
                  <select className="form-select" value={form.category} onChange={e => handleChange('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS_EN_AR[c] || c}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الفئة الفرعية' : 'Sub Category'}</label>
                  <select className="form-select" value={form.sub_category} onChange={e => handleChange('sub_category', e.target.value)}>
                    <option value="">-- {locale === 'ar' ? 'اختر الفئة الفرعية' : 'Select Sub Category'} --</option>
                    {form.sub_category && !subCategoryOptions.includes(form.sub_category) && (
                      <option value={form.sub_category} disabled>{form.sub_category}</option>
                    )}
                    {subCategoryOptions.map(sc => (
                      <option key={sc} value={sc}>{SUB_CATEGORY_LABELS[locale]?.[sc] || sc}</option>
                    ))}
                  </select>
                </div>
              </div>

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

              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} />
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

const CATEGORY_LABELS_EN_AR = {
  raw_material: 'Raw Materials / مواد خام',
  finished_material: 'Finished Materials / مواد مصنعة',
  equipment_rental: 'Equipment Rental / تأجير معدات',
  consumable: 'Consumables / مواد استهلاكية',
  tool: 'Tools / أدوات',
  safety: 'Safety / سلامة',
  other: 'Other / أخرى',
};

export default Items;
