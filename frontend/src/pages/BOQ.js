import { formatNumber, localizedName } from '../utils/formatters';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import LoadMore from '../components/common/LoadMore';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { ArrowLeft, Plus, Edit, Trash2, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { errorMessage } from '../utils/errorMessage';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { const err = new Error(e.error || 'Request failed'); err.code = e.code; throw err; });
  return apiResponseJson(r);
});

const TYPE_LABELS = {
  en: { material: 'Material', labor: 'Labor', equipment: 'Equipment', subcontract: 'Subcontract' },
  ar: { material: 'مواد', labor: 'عمالة', equipment: 'معدات', subcontract: 'مقاول باطن' }
};

const TYPE_BADGE = {
  material: 'badge-info', labor: 'badge-warning', equipment: 'badge-success', subcontract: 'badge-info'
};

const UNIT_LABELS = {
  en: { ton: 'Ton', m3: 'm³', m2: 'm²', piece: 'Piece', linear_m: 'Linear Meter', bag: 'Bag', liter: 'Liter', set: 'Set', lot: 'Lot' },
  ar: { ton: 'طن', m3: 'م³', m2: 'م²', piece: 'قطعة', linear_m: 'متر طولي', bag: 'كيس', liter: 'لتر', set: 'طقم', lot: 'لوط' }
};

const UNITS = ['ton', 'm3', 'm2', 'piece', 'linear_m', 'bag', 'liter', 'set', 'lot'];
const ITEM_TYPES = ['material', 'labor', 'equipment', 'subcontract'];

// Phase 8: prefer the measurement-derived completion when present.
function itemCompletion(i) {
  return Number(
    i.completion_percentage_derived != null ? i.completion_percentage_derived : i.completion_percentage
  ) || 0;
}

function BOQ() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [sections, setSections] = useState([]);
  const sectionsLength = useRef(0); sectionsLength.current = sections.length;
  const [items, setItems] = useState([]);
  const itemsLength = useRef(0); itemsLength.current = items.length;
  const [sectionTotalCount, setSectionTotalCount] = useState(null);
  const [itemTotalCount, setItemTotalCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMoreSections, setLoadingMoreSections] = useState(false);
  const [loadingMoreItems, setLoadingMoreItems] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [masterItems, setMasterItems] = useState([]);
  const [itemSearch, setItemSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // { kind: 'item' | 'section', id }
  const [deleteError, setDeleteError] = useState('');
  const [loadError, setLoadError] = useState(null);
  const [masterItemsError, setMasterItemsError] = useState(null);

  const loadData = useCallback(async ({ appendSections = false, appendItems = false } = {}) => {
    if (appendSections) setLoadingMoreSections(true); else if (appendItems) setLoadingMoreItems(true); else setLoading(true);
    setLoadError(null);
    try {
      const sectionParams = new URLSearchParams({ limit: '200', offset: String(appendSections ? sectionsLength.current : 0) });
      const itemParams = new URLSearchParams({ limit: '200', offset: String(appendItems ? itemsLength.current : 0) });
      const [secRes, itemRes] = await Promise.all([
        fetchApi(`${API_URL}/boq/sections/${projectId}?${sectionParams}`),
        fetchApi(`${API_URL}/boq/items/${projectId}?${itemParams}`)
      ]);
      if (secRes.success) { setSections(current => appendSections ? [...current, ...(secRes.data || [])] : appendItems ? current : (secRes.data || [])); setSectionTotalCount(secRes.totalCount ?? null); }
      if (itemRes.success) { setItems(current => appendItems ? [...current, ...(itemRes.data || [])] : appendSections ? current : (itemRes.data || [])); setItemTotalCount(itemRes.totalCount ?? null); }
    } catch (e) {
      // Keep whatever sections/items are already on screen; only surface the error.
      // The user can retry (e.g. via LoadMore or navigating back) without losing state.
      setLoadError(e);
    }
    finally { setLoading(false); setLoadingMoreSections(false); setLoadingMoreItems(false); }
  }, [projectId]);

  const loadMasterItems = useCallback(async () => {
    setMasterItemsError(null);
    try {
      const res = await fetchApi(`${API_URL}/items?limit=500`);
      if (res.success) setMasterItems(res.data || []);
    } catch (e) {
      // The add/edit item dialog is already open (or about to open) by the time this
      // runs; leave it open on failure so the user can retry instead of losing the form.
      setMasterItemsError(e);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const getSectionItems = (sectionId) => items.filter(i => i.section_id === sectionId);
  const getRootSections = () => sections.filter(s => !s.parent_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const getChildSections = (parentId) => sections.filter(s => s.parent_id === parentId).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const typeLabel = (tp) => TYPE_LABELS[locale]?.[tp] || tp;
  const unitLabel = (u) => UNIT_LABELS[locale]?.[u] || u;
  const sectionName = (s) => localizedName(s, locale);
  const itemDesc = (it) => localizedName(it, locale, 'description');

  // Contractual rows: the server refuses (409 record_in_use) while measurements, allocations or recipes reference the entry.
  const confirmDelete = async () => {
    const { kind, id } = deleteTarget;
    setDeleteTarget(null);
    setDeleteError('');
    try {
      await fetchApi(`${API_URL}/boq/${kind === 'item' ? 'items' : 'sections'}/${id}`, { method: 'DELETE' });
      loadData();
    } catch (e) { setDeleteError(e.code === 'record_in_use' ? t('errors.recordInUse') : e.message); }
  };
  const handleDeleteItem = (itemId) => setDeleteTarget({ kind: 'item', id: itemId });
  const handleDeleteSection = (sectionId) => setDeleteTarget({ kind: 'section', id: sectionId });

  const totalsByType = ITEM_TYPES.reduce((acc, tp) => {
    const typeItems = items.filter(i => i.type === tp);
    acc[tp] = typeItems.reduce((sum, i) => sum + (Number(i.total_price) || 0), 0);
    return acc;
  }, {});
  const grandTotal = Object.values(totalsByType).reduce((s, v) => s + v, 0);
  const totalCompletion = items.length > 0
    ? items.reduce((sum, i) => sum + itemCompletion(i), 0) / items.length
    : 0;

  if (loading) {
    return (
      <div className="page-container">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <span className="spinner" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn" onClick={() => navigate(`/projects/${projectId}`)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1>{t('common.nav.boq')}</h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('boq.system.billOfQuantitiesForProject')}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-outline" onClick={() => { setEditingSection(null); setShowSectionModal(true); }}>
            <Plus size={16} />
            {t('boq.system.addSection')}
          </button>
          <button className="btn btn-primary" onClick={() => { setEditingItem(null); setShowItemModal(true); loadMasterItems(); }}>
            <Plus size={16} />
            {t('boq.system.addItem')}
          </button>
        </div>
      </div>

      <div className="level-line" />

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{sections.length}</div>
          <div className="stat-label">{t('boq.system.sections')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{items.length}</div>
          <div className="stat-label">{t('boq.system.items')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>{formatPercent(totalCompletion)}</div>
          <div className="stat-label">{t('boq.system.avgCompletion')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{formatCurrency(grandTotal)}</div>
          <div className="stat-label">{t('boq.system.grandTotal')}</div>
        </div>
      </div>

      {deleteError && <div className="alert alert-danger" role="alert">{deleteError}</div>}
      {loadError && <div className="alert alert-danger" role="alert">{errorMessage(loadError, t)}</div>}

      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header">
          <h3 className="card-title">{t('boq.system.boqSummaryByType')}</h3>
        </div>
        <div className="stats-grid" style={{ marginBottom: 0 }}>
          {ITEM_TYPES.map(tp => (
            <div className="stat-card" key={tp}>
              <span className={`badge ${TYPE_BADGE[tp] || 'badge-info'}`} style={{ marginBottom: '8px' }}>{typeLabel(tp)}</span>
              <div className="stat-value" style={{ fontSize: '18px' }}>{formatCurrency(totalsByType[tp] || 0)}</div>
            </div>
          ))}
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <FileText size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('boq.system.noBoqSectionsYetAddYourFirstSection')}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {getRootSections().map(section => (
            <BOQSectionTree
              key={section.id}
              section={section}
              depth={0}
              items={items}
              sections={sections}
              expandedSections={expandedSections}
              onToggle={toggleSection}
              onEditSection={(s) => { setEditingSection(s); setShowSectionModal(true); }}
              onDeleteSection={handleDeleteSection}
              onEditItem={(it) => { setEditingItem(it); setShowItemModal(true); loadMasterItems(); }}
              onDeleteItem={handleDeleteItem}
              onAddItem={(sectionId) => { setEditingItem(null); setShowItemModal(true); loadMasterItems(); setEditingSection({ id: sectionId }); }}
              locale={locale}
              t={t}
              getSectionItems={getSectionItems}
              getChildSections={getChildSections}
              sectionName={sectionName}
              itemDesc={itemDesc}
              typeLabel={typeLabel}
              unitLabel={unitLabel}
            />
          ))}
        </div>
      )}

      <LoadMore loadedCount={sections.length} totalCount={sectionTotalCount} loading={loadingMoreSections} t={t} onLoadMore={() => loadData({ appendSections: true })} />
      <LoadMore loadedCount={items.length} totalCount={itemTotalCount} loading={loadingMoreItems} t={t} onLoadMore={() => loadData({ appendItems: true })} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'section' ? t('boq.delete.sectionTitle') : t('boq.delete.itemTitle')}
        message={t('boq.delete.message')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {showSectionModal && (
        <SectionModal
          section={editingSection}
          sections={sections}
          projectId={projectId}
          locale={locale}
          t={t}
          onClose={() => { setShowSectionModal(false); setEditingSection(null); }}
          onSave={loadData}
        />
      )}

      {showItemModal && (
        <ItemModal
          item={editingItem}
          sections={sections}
          defaultSectionId={editingSection?.id}
          projectId={projectId}
          masterItems={masterItems}
          masterItemsError={masterItemsError}
          itemSearch={itemSearch}
          setItemSearch={setItemSearch}
          locale={locale}
          t={t}
          onClose={() => { setShowItemModal(false); setEditingItem(null); setEditingSection(null); }}
          onSave={loadData}
        />
      )}
    </div>
  );
}

function BOQSectionTree({
  section, depth, items, sections, expandedSections, onToggle, onEditSection, onDeleteSection,
  onEditItem, onDeleteItem, onAddItem, locale, t, getSectionItems, getChildSections,
  sectionName, itemDesc, typeLabel, unitLabel
}) {
  const isExpanded = !!expandedSections[section.id];
  const childSections = getChildSections(section.id);
  const sectionItems = getSectionItems(section.id);

  return (
    <div>
      <div
        className="card"
        style={{
          marginBottom: '0',
          borderRadius: depth === 0 ? 'var(--radius-lg)' : 'var(--radius-md)',
          borderLeft: depth > 0 ? `3px solid var(--color-accent)` : 'none',
          padding: '12px 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => onToggle(section.id)}
            style={{ background: 'none', border: 'none', color: 'var(--color-accent)', cursor: 'pointer', padding: '4px', display: 'flex' }}
          >
            {(childSections.length > 0 || sectionItems.length > 0) ? (
              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
            ) : (
              <span style={{ width: '16px' }} />
            )}
          </button>
          <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '13px', fontWeight: 600 }}>
            {section.code}
          </span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--color-text-primary)', flex: 1 }}>
            {sectionName(section)}
          </span>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
            {sectionItems.length} {t('boq.system.items2')}
          </span>
          <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => onAddItem(section.id)}>
            <Plus size={12} />
            {t('boq.system.item')}
          </button>
          <button className="btn" style={{ padding: '4px 8px' }} onClick={() => onEditSection(section)}>
            <Edit size={12} />
          </button>
          <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => onDeleteSection(section.id)}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginLeft: depth > 0 ? '28px' : '20px' }}>
          {sectionItems.length > 0 && (
            <div className="table-container" style={{ borderRadius: '0', marginBottom: '0' }}>
              <table className="table" style={{ fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th>{t('common.code')}</th>
                    <th>{t('common.description')}</th>
                    <th>{t('common.unit')}</th>
                    <th>{t('common.quantity')}</th>
                    <th>{t('boq.system.unitRate')}</th>
                    <th>{t('common.total')}</th>
                    <th>{t('common.type')}</th>
                    <th>{t('boq.system.completion')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionItems.map(it => (
                    <tr key={it.id}>
                      <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontSize: '12px' }}>{it.code}</td>
                      <td style={{ fontSize: '13px' }}>{itemDesc(it)}</td>
                      <td style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>{unitLabel(it.unit)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{it.quantity != null ? formatNumber(it.quantity, { locale, decimals: 2 }) : '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{formatCurrency(it.unit_rate)}</td>
                      <td style={{ fontFamily: 'monospace', color: 'var(--color-warning)', fontWeight: 600, fontSize: '12px' }}>{formatCurrency(it.total_price)}</td>
                      <td><span className={`badge ${TYPE_BADGE[it.type] || 'badge-info'}`} style={{ fontSize: '10px' }}>{typeLabel(it.type)}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ flex: 1, height: '4px', background: 'var(--color-surface-raised)', borderRadius: '2px', overflow: 'hidden', minWidth: '40px' }}>
                            <div style={{
                              height: '100%',
                              width: `${Math.min(100, Math.max(0, itemCompletion(it)))}%`,
                              background: 'var(--color-accent)',
                              borderRadius: '2px',
                            }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{formatPercent(itemCompletion(it))}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn" style={{ padding: '4px 8px' }} onClick={() => onEditItem(it)}>
                            <Edit size={11} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => onDeleteItem(it.id)}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {childSections.map(child => (
            <BOQSectionTree
              key={child.id}
              section={child}
              depth={depth + 1}
              items={items}
              sections={sections}
              expandedSections={expandedSections}
              onToggle={onToggle}
              onEditSection={onEditSection}
              onDeleteSection={onDeleteSection}
              onEditItem={onEditItem}
              onDeleteItem={onDeleteItem}
              onAddItem={onAddItem}
              locale={locale}
              t={t}
              getSectionItems={getSectionItems}
              getChildSections={getChildSections}
              sectionName={sectionName}
              itemDesc={itemDesc}
              typeLabel={typeLabel}
              unitLabel={unitLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionModal({ section, sections, projectId, locale, t, onClose, onSave }) {
  const isEdit = !!section && !!section.id;
  const [form, setForm] = useState({
    name_en: section?.name_en || '',
    name_ar: section?.name_ar || '',
    parent_id: section?.parent_id || '',
    sort_order: section?.sort_order ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit
        ? `${API_URL}/boq/sections/${section.id}`
        : `${API_URL}/boq/sections`;
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        name_en: form.name_en,
        name_ar: form.name_ar,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        sort_order: form.sort_order !== '' ? Number(form.sort_order) : null,
      };
      if (!isEdit) body.project_id = Number(projectId);
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const parentOptions = sections.filter(s => s.id !== section?.id);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit
              ? (t('boq.system.editSection'))
              : (t('boq.system.addNewSection'))}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('boq.system.englishName')}</label>
                  <input className="form-input" value={form.name_en} onChange={e => handleChange('name_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم العربي *</label>
                  <input className="form-input" value={form.name_ar} onChange={e => handleChange('name_ar', e.target.value)} required />
                </div>
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('boq.system.parentSection')}</label>
                  <select className="form-select" value={form.parent_id} onChange={e => handleChange('parent_id', e.target.value)}>
                    <option value="">{t('boq.system.rootSection')}</option>
                    {parentOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.code} - {localizedName(s, locale)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('boq.system.sortOrder')}</label>
                  <input className="form-input" type="number" min="0" value={form.sort_order} onChange={e => handleChange('sort_order', e.target.value)} />
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

function ItemModal({ item, sections, defaultSectionId, projectId, masterItems, masterItemsError, itemSearch, setItemSearch, locale, t, onClose, onSave }) {
  const isEdit = !!item && !!item.id;
  const [form, setForm] = useState({
    section_id: item?.section_id || defaultSectionId || '',
    description_en: item?.description_en || '',
    description_ar: item?.description_ar || '',
    unit: item?.unit || 'm3',
    quantity: item?.quantity != null ? item.quantity : '',
    unit_rate: item?.unit_rate != null ? item.unit_rate : '',
    item_master_id: item?.item_master_id || '',
    type: item?.type || 'material',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const filteredMasterItems = itemSearch
    ? masterItems.filter(mi => {
      const text = (mi.name_en + ' ' + mi.name_ar + ' ' + mi.code).toLowerCase();
      return text.includes(itemSearch.toLowerCase());
    }).slice(0, 30)
    : [];

  const selectedMasterItem = masterItems.find(mi => mi.id === Number(form.item_master_id));
  const itemMasterLabel = selectedMasterItem
    ? `${selectedMasterItem.code} - ${localizedName(selectedMasterItem, locale)}`
    : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/boq/items/${item.id}` : `${API_URL}/boq/items`;
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        section_id: Number(form.section_id),
        description_en: form.description_en,
        description_ar: form.description_ar,
        unit: form.unit,
        quantity: form.quantity ? Number(form.quantity) : null,
        unit_rate: form.unit_rate ? Number(form.unit_rate) : null,
        item_master_id: form.item_master_id ? Number(form.item_master_id) : null,
        type: form.type,
      };
      if (!isEdit) body.project_id = Number(projectId);
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
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
              ? (t('boq.system.editItem'))
              : (t('boq.system.addNewItem'))}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('boq.system.section')} *</label>
                  <select className="form-select" value={form.section_id} onChange={e => handleChange('section_id', e.target.value)} required>
                    <option value="">{t('boq.system.selectSection')}</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>{s.code} - {localizedName(s, locale)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.type')}</label>
                  <select className="form-select" value={form.type} onChange={e => handleChange('type', e.target.value)}>
                    {ITEM_TYPES.map(tp => (
                      <option key={tp} value={tp}>{TYPE_LABELS[locale]?.[tp] || tp}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('boq.system.englishDescription')}</label>
                  <input className="form-input" value={form.description_en} onChange={e => handleChange('description_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">الوصف العربي *</label>
                  <input className="form-input" value={form.description_ar} onChange={e => handleChange('description_ar', e.target.value)} required />
                </div>
              </div>
              <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('common.unit')}</label>
                  <select className="form-select" value={form.unit} onChange={e => handleChange('unit', e.target.value)}>
                    {UNITS.map(u => (
                      <option key={u} value={u}>{UNIT_LABELS[locale]?.[u] || u}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.quantity')}</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.quantity} onChange={e => handleChange('quantity', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('boq.system.unitRate')}</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.unit_rate} onChange={e => handleChange('unit_rate', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">{t('boq.system.masterItemOptional')}</label>
                {isEdit && selectedMasterItem ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input className="form-input" value={itemMasterLabel} disabled style={{ flex: 1 }} />
                    <button type="button" className="btn" style={{ padding: '6px 12px' }} onClick={() => handleChange('item_master_id', '')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        className="form-input"
                        value={itemSearch}
                        onChange={e => { setItemSearch(e.target.value); setShowItemDropdown(true); }}
                        onFocus={() => setShowItemDropdown(true)}
                        onBlur={() => setTimeout(() => setShowItemDropdown(false), 200)}
                        placeholder={t('boq.system.searchMasterItem')}
                      />
                      {form.item_master_id && (
                        <button type="button" className="btn" style={{ padding: '6px 12px', flexShrink: 0 }} onClick={() => handleChange('item_master_id', '')}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    {showItemDropdown && itemSearch && filteredMasterItems.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0,
                        background: 'var(--color-surface)', border: '1px solid var(--color-surface-raised)',
                        borderRadius: 'var(--radius-md)', maxHeight: '200px', overflowY: 'auto',
                        zIndex: 10, marginTop: '4px'
                      }}>
                        {filteredMasterItems.map(mi => (
                          <div
                            key={mi.id}
                            onMouseDown={() => { handleChange('item_master_id', String(mi.id)); setItemSearch(''); setShowItemDropdown(false); }}
                            style={{
                              padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                              color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-surface-raised)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-raised)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ fontFamily: 'monospace', color: 'var(--color-accent)', marginRight: '8px' }}>{mi.code}</span>
                            {localizedName(mi, locale)}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {masterItemsError && <div className="alert alert-danger" role="alert">{errorMessage(masterItemsError, t)}</div>}
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

export default BOQ;
