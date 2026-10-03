import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import ReasonDialog from '../components/common/ReasonDialog';
import { ArrowLeft, Plus, Edit, Trash2, ClipboardList, CheckCircle, XCircle, Package, Wrench, Users, Calendar } from 'lucide-react';
import { formatCurrency, formatDate, formatPercent } from '../utils/formatters';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const STATUS_LABELS = {
  en: { planned: 'Planned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' },
  ar: { planned: 'مخطط', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' }
};

const STATUS_BADGE = {
  planned: 'badge-warning', in_progress: 'badge-info', completed: 'badge-success', cancelled: 'badge-danger'
};

const STATUSES = ['', 'planned', 'in_progress', 'completed', 'cancelled'];

const SKILL_LABELS = {
  en: { mason: 'Mason', carpenter: 'Carpenter', electrician: 'Electrician', steel_fixer: 'Steel Fixer', plumber: 'Plumber', painter: 'Painter', tiler: 'Tiler', general: 'General' },
  ar: { mason: 'بناء', carpenter: 'نجار', electrician: 'كهربائي', steel_fixer: 'حداد', plumber: 'سباك', painter: 'دهان', tiler: 'مبلط', general: 'عام' }
};

const SKILLS = ['mason', 'carpenter', 'electrician', 'steel_fixer', 'plumber', 'painter', 'tiler', 'general'];

const DETAIL_TABS = [
  { key: 'materials', icon: Package, label_en: 'Issued Materials', label_ar: 'المواد المصروفة' },
  { key: 'labor', icon: Users, label_en: 'Labor', label_ar: 'العمالة' },
  { key: 'equipment', icon: Wrench, label_en: 'Equipment', label_ar: 'المعدات' },
  { key: 'completions', icon: CheckCircle, label_en: 'Completions', label_ar: 'نسب الإنجاز' },
];

function WorkOrders() {
  const { id: projectId } = useParams();
  const navigate = useNavigate();
  const { t, locale } = useLocale();
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWO, setEditingWO] = useState(null);
  const [expandedWO, setExpandedWO] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState('materials');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelError, setCancelError] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  const [phases, setPhases] = useState([]);
  const [boqSections, setBoqSections] = useState([]);
  const [users, setUsers] = useState([]);

  const loadWorkOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/work-orders/project/${projectId}?${params}`);
      if (res.success) setWorkOrders(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [projectId, statusFilter]);

  const loadRefData = useCallback(async () => {
    try {
      const [phRes, boqRes, usrRes] = await Promise.all([
        fetchApi(`${API_URL}/projects/${projectId}`),
        fetchApi(`${API_URL}/boq/sections/${projectId}`),
        fetchApi(`${API_URL}/users?limit=200`)
      ]);
      if (phRes.success) setPhases(phRes.data?.phases || phRes.phases || []);
      if (boqRes.success) setBoqSections(boqRes.data || []);
      if (usrRes.success) setUsers(usrRes.data || []);
    } catch (e) { console.error(e); }
  }, [projectId]);

  useEffect(() => { loadWorkOrders(); }, [loadWorkOrders]);

  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;
  const woTitle = (wo) => locale === 'ar' ? (wo.title_ar || wo.title_en) : (wo.title_en || wo.title_ar);
  const phaseName = (wo) => {
    if (!wo.phase_name && !wo.phase_name_ar && !wo.phase_name_en) return '—';
    return locale === 'ar' ? (wo.phase_name_ar || wo.phase_name) : (wo.phase_name_en || wo.phase_name);
  };
  const boqSectionName = (wo) => {
    if (!wo.boq_section_name_ar && !wo.boq_section_name_en) return '—';
    return locale === 'ar' ? (wo.boq_section_name_ar || wo.boq_section_name_en) : (wo.boq_section_name_en || wo.boq_section_name_ar);
  };

  // A work order carries cost records, so DELETE cancels it (the server keeps the row and its children).
  const confirmCancel = async (reason) => {
    setCancelBusy(true); setCancelError('');
    try {
      await fetchApi(`${API_URL}/work-orders/${cancelTarget.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      if (expandedWO === cancelTarget.id) setExpandedWO(null);
      setCancelTarget(null);
      loadWorkOrders();
    } catch (e) { setCancelError(e.message); }
    finally { setCancelBusy(false); }
  };

  const toggleExpand = (woId) => {
    setExpandedWO(prev => prev === woId ? null : woId);
    setActiveDetailTab('materials');
  };

  const counts = {
    total: workOrders.length,
    planned: workOrders.filter(w => w.status === 'planned').length,
    inProgress: workOrders.filter(w => w.status === 'in_progress').length,
    completed: workOrders.filter(w => w.status === 'completed').length,
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn" onClick={() => navigate(`/projects/${projectId}`)}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1>{t('common.nav.workOrders')}</h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {locale === 'ar' ? 'أوامر العمل للمشروع' : 'Work Orders for Project'}
            </p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingWO(null); setShowCreateModal(true); loadRefData(); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'أمر عمل جديد' : 'New Work Order'}
        </button>
      </div>

      <div className="level-line" />

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{counts.total}</div>
          <div className="stat-label">{locale === 'ar' ? 'إجمالي الأوامر' : 'Total Orders'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{counts.planned}</div>
          <div className="stat-label">{STATUS_LABELS[locale]?.planned || 'Planned'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-text-secondary)' }}>{counts.inProgress}</div>
          <div className="stat-label">{STATUS_LABELS[locale]?.in_progress || 'In Progress'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>{counts.completed}</div>
          <div className="stat-label">{STATUS_LABELS[locale]?.completed || 'Completed'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {STATUSES.map(s => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px' }}
            onClick={() => setStatusFilter(s)}
          >
            {s === '' ? t('common.all') : statusLabel(s)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <span className="spinner" />
        </div>
      ) : workOrders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <ClipboardList size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد أوامر عمل. أنشئ أول أمر.' : 'No work orders found. Create your first.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {workOrders.map(wo => (
            <div key={wo.id}>
              <div className="card" style={{ marginBottom: '0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <ClipboardList size={18} style={{ color: 'var(--color-accent)' }} />
                      <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-text-primary)', cursor: 'pointer' }} onClick={() => toggleExpand(wo.id)}>
                        {woTitle(wo)}
                      </span>
                      <span className={`badge ${STATUS_BADGE[wo.status] || 'badge-info'}`}>
                        {statusLabel(wo.status)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      <span><Calendar size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />{formatDate(wo.planned_start_date)} — {formatDate(wo.planned_end_date)}</span>
                      <span>{locale === 'ar' ? 'المرحلة' : 'Phase'}: <span style={{ color: 'var(--color-text-primary)' }}>{phaseName(wo)}</span></span>
                      <span>{locale === 'ar' ? 'قسم الحصر' : 'BOQ Section'}: <span style={{ color: 'var(--color-text-primary)' }}>{boqSectionName(wo)}</span></span>
                      {wo.assigned_to_name && (
                        <span>{locale === 'ar' ? 'مسند إلى' : 'Assigned'}: <span style={{ color: 'var(--color-text-primary)' }}>{wo.assigned_to_name}</span></span>
                      )}
                    </div>
                    {wo.description && (
                      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px', maxWidth: '600px', whiteSpace: 'pre-wrap' }}>
                        {wo.description}
                      </p>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '300px' }}>
                      <div style={{ flex: 1, height: '5px', background: 'var(--color-surface-raised)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(0, Number(wo.completion_percentage) || 0))}%`,
                          background: 'var(--color-accent)',
                          borderRadius: '3px',
                          transition: 'width 0.5s ease'
                        }} />
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--color-accent)', fontWeight: 600 }}>
                        {formatPercent(wo.completion_percentage)}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button className="btn" style={{ padding: '6px 12px' }} onClick={() => { setEditingWO(wo); setShowCreateModal(true); loadRefData(); }}>
                      <Edit size={14} />
                    </button>
                    {wo.status !== 'cancelled' && (
                      <button className="btn btn-danger" style={{ padding: '6px 12px' }} title={t('workorders.cancel.action')} aria-label={t('workorders.cancel.action')} onClick={() => { setCancelError(''); setCancelTarget(wo); }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button className="btn" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => toggleExpand(wo.id)}>
                      {expandedWO === wo.id
                        ? (locale === 'ar' ? 'طي' : 'Collapse')
                        : (locale === 'ar' ? 'تفاصيل' : 'Details')}
                    </button>
                  </div>
                </div>
              </div>

              {expandedWO === wo.id && (
                <WODetail
                  wo={wo}
                  projectId={projectId}
                  locale={locale}
                  t={t}
                  activeTab={activeDetailTab}
                  setActiveTab={setActiveDetailTab}
                  loadWorkOrders={loadWorkOrders}
                  users={users}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <ReasonDialog
        open={Boolean(cancelTarget)}
        title={t('workorders.cancel.title')}
        message={cancelTarget ? t('workorders.cancel.message', { title: (locale === 'ar' ? cancelTarget.title_ar : cancelTarget.title_en) || cancelTarget.title || cancelTarget.title_ar || '' }) : ''}
        confirmLabel={t('workorders.cancel.confirm')}
        busy={cancelBusy}
        error={cancelError}
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      {showCreateModal && (
        <WorkOrderModal
          wo={editingWO}
          projectId={projectId}
          phases={phases}
          boqSections={boqSections}
          users={users}
          locale={locale}
          t={t}
          onClose={() => { setShowCreateModal(false); setEditingWO(null); }}
          onSave={loadWorkOrders}
        />
      )}
    </div>
  );
}

function WODetail({ wo, projectId, locale, t, activeTab, setActiveTab, loadWorkOrders, users }) {
  return (
    <div className="card" style={{ borderTop: '2px solid var(--color-accent)', marginTop: '0', borderTopLeftRadius: '0', borderTopRightRadius: '0' }}>
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid var(--color-surface-raised)', flexWrap: 'wrap' }}>
        {DETAIL_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 16px', fontSize: '13px', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                background: 'none', border: 'none', borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                cursor: 'pointer', transition: 'all var(--transition-fast)',
              }}
            >
              <Icon size={14} />
              <span>{locale === 'ar' ? tab.label_ar : tab.label_en}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'materials' && <WOMaterialsTab wo={wo} projectId={projectId} locale={locale} t={t} />}
      {activeTab === 'labor' && <WOLaborTab wo={wo} projectId={projectId} locale={locale} t={t} />}
      {activeTab === 'equipment' && <WOEquipmentTab wo={wo} projectId={projectId} locale={locale} t={t} />}
      {activeTab === 'completions' && <WOCompletionsTab wo={wo} projectId={projectId} locale={locale} t={t} loadWorkOrders={loadWorkOrders} />}
    </div>
  );
}

function WOMaterialsTab({ wo, projectId, locale, t }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/work-orders/${wo.id}/materials`);
      if (res.success) setMaterials(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [wo.id]);

  const loadRefData = useCallback(async () => {
    try {
      const [itRes, whRes] = await Promise.all([
        fetchApi(`${API_URL}/items?limit=500`),
        fetchApi(`${API_URL}/warehouses?limit=200`)
      ]);
      if (itRes.success) setItems(itRes.data || []);
      if (whRes.success) setWarehouses(whRes.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  const itemLabel = (it) => locale === 'ar' ? (it.item_name_ar || it.item_name_en || it.item?.name_ar || it.item?.name_en) : (it.item_name_en || it.item_name_ar || it.item?.name_en || it.item?.name_ar);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => { setShowForm(true); loadRefData(); }}>
          <Plus size={14} />
          {locale === 'ar' ? 'صرف مادة' : 'Issue Material'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : materials.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px' }}>
          {locale === 'ar' ? 'لا توجد مواد مصروفة.' : 'No materials issued yet.'}
        </p>
      ) : (
        <div className="table-container">
          <table className="table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'المادة' : 'Item'}</th>
                <th>{locale === 'ar' ? 'الكمية المخطط' : 'Planned Qty'}</th>
                <th>{locale === 'ar' ? 'الكمية الفعلية' : 'Actual Qty'}</th>
                <th>{locale === 'ar' ? 'تكلفة الوحدة' : 'Unit Cost'}</th>
                <th>{t('common.total')}</th>
                <th>{locale === 'ar' ? 'المستودع' : 'Warehouse'}</th>
              </tr>
            </thead>
            <tbody>
              {materials.map(m => (
                <tr key={m.id}>
                  <td>{itemLabel(m)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{m.planned_quantity ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{m.actual_quantity ?? '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{m.unit_cost ? formatCurrency(m.unit_cost) : '—'}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-warning)', fontWeight: 600 }}>{m.total_cost ? formatCurrency(m.total_cost) : '—'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{m.warehouse?.name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <WOMaterialFormModal
          wo={wo}
          items={items}
          warehouses={warehouses}
          locale={locale}
          t={t}
          onClose={() => setShowForm(false)}
          onSave={loadMaterials}
        />
      )}
    </div>
  );
}

export function WOMaterialFormModal({ wo, items, warehouses, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({
    item_id: '',
    planned_quantity: '',
    actual_quantity: '',
    warehouse_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        item_id: Number(form.item_id),
        planned_quantity: form.planned_quantity ? Number(form.planned_quantity) : null,
        actual_quantity: form.actual_quantity ? Number(form.actual_quantity) : null,
        warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null,
      };
      const res = await fetchApi(`${API_URL}/work-orders/${wo.id}/materials`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const itemLabel = (it) => `${it.code || ''} - ${locale === 'ar' ? (it.name_ar || it.name_en) : (it.name_en || it.name_ar)} (${it.unit || '—'})`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'صرف مادة' : 'Issue Material'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'المادة' : 'Item'} *</label>
                <select className="form-select" value={form.item_id} onChange={e => handleChange('item_id', e.target.value)} required>
                  <option value="">{locale === 'ar' ? '— اختر المادة —' : '— Select Item —'}</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>{itemLabel(it)}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الكمية المخطط' : 'Planned Qty'}</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.planned_quantity} onChange={e => handleChange('planned_quantity', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الكمية الفعلية' : 'Actual Qty'}</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.actual_quantity} onChange={e => handleChange('actual_quantity', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المستودع' : 'Warehouse'}</label>
                  <select className="form-select" value={form.warehouse_id} onChange={e => handleChange('warehouse_id', e.target.value)}>
                    <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
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

function WOLaborTab({ wo, projectId, locale, t }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/work-orders/${wo.id}/labor`);
      if (res.success) setEntries(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [wo.id]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const skillLabel = (s) => SKILL_LABELS[locale]?.[s] || s;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => setShowForm(true)}>
          <Plus size={14} />
          {locale === 'ar' ? 'تسجيل عمالة' : 'Record Labor'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px' }}>
          {locale === 'ar' ? 'لا توجد تسجيلات عمالة.' : 'No labor entries recorded.'}
        </p>
      ) : (
        <div className="table-container">
          <table className="table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'المهارة' : 'Skill'}</th>
                <th>{locale === 'ar' ? 'عدد العمال' : 'Workers'}</th>
                <th>{locale === 'ar' ? 'الساعات' : 'Hours'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td><span className="badge badge-info">{skillLabel(entry.skill_category)}</span></td>
                  <td style={{ fontFamily: 'monospace' }}>{entry.worker_count || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{entry.hours || '—'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(entry.work_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <WOLaborFormModal
          wo={wo}
          locale={locale}
          t={t}
          onClose={() => setShowForm(false)}
          onSave={loadEntries}
        />
      )}
    </div>
  );
}

function WOLaborFormModal({ wo, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({
    skill_category: 'general',
    worker_count: '',
    hours: '',
    work_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        skill_category: form.skill_category,
        worker_count: Number(form.worker_count),
        hours: Number(form.hours),
        work_date: form.work_date,
      };
      const res = await fetchApi(`${API_URL}/work-orders/${wo.id}/labor`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'تسجيل عمالة' : 'Record Labor'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'المهارة' : 'Skill Category'}</label>
                <select className="form-select" value={form.skill_category} onChange={e => handleChange('skill_category', e.target.value)}>
                  {SKILLS.map(s => (
                    <option key={s} value={s}>{SKILL_LABELS[locale]?.[s] || s}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'عدد العمال' : 'Worker Count'} *</label>
                  <input className="form-input" type="number" min="0" value={form.worker_count} onChange={e => handleChange('worker_count', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الساعات' : 'Hours'} *</label>
                  <input className="form-input" type="number" step="0.5" min="0" value={form.hours} onChange={e => handleChange('hours', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'} *</label>
                  <input className="form-input" type="date" value={form.work_date} onChange={e => handleChange('work_date', e.target.value)} required />
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

function WOEquipmentTab({ wo, projectId, locale, t }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [equipment, setEquipment] = useState([]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/work-orders/${wo.id}/equipment`);
      if (res.success) setEntries(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [wo.id]);

  const loadEquipment = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/assets?limit=200`);
      if (res.success) setEquipment(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const eqLabel = (eq) => locale === 'ar' ? (eq.equipment_name_ar || eq.equipment_name_en || eq.equipment?.name_ar || eq.equipment?.name_en) : (eq.equipment_name_en || eq.equipment_name_ar || eq.equipment?.name_en || eq.equipment?.name_ar);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => { setShowForm(true); loadEquipment(); }}>
          <Plus size={14} />
          {locale === 'ar' ? 'تسجيل معدة' : 'Record Equipment'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px' }}>
          {locale === 'ar' ? 'لا توجد تسجيلات معدات.' : 'No equipment entries recorded.'}
        </p>
      ) : (
        <div className="table-container">
          <table className="table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'المعدة' : 'Equipment'}</th>
                <th>{locale === 'ar' ? 'الساعات' : 'Hours'}</th>
                <th>{locale === 'ar' ? 'تكلفة الساعة' : 'Hourly Cost'}</th>
                <th>{t('common.total')}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id}>
                  <td>{eqLabel(entry)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{entry.hours || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{entry.hourly_cost ? formatCurrency(entry.hourly_cost) : '—'}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-warning)', fontWeight: 600 }}>{entry.total_cost ? formatCurrency(entry.total_cost) : '—'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(entry.work_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <WOEquipmentFormModal
          wo={wo}
          equipment={equipment}
          locale={locale}
          t={t}
          onClose={() => setShowForm(false)}
          onSave={loadEntries}
        />
      )}
    </div>
  );
}

function WOEquipmentFormModal({ wo, equipment, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({
    equipment_id: '',
    hours: '',
    hourly_cost: '',
    work_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        equipment_id: Number(form.equipment_id),
        hours: Number(form.hours),
        hourly_cost: form.hourly_cost ? Number(form.hourly_cost) : null,
        work_date: form.work_date,
      };
      const res = await fetchApi(`${API_URL}/work-orders/${wo.id}/equipment`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const eqLabel = (eq) => `${eq.code || ''} - ${locale === 'ar' ? (eq.name_ar || eq.name_en) : (eq.name_en || eq.name_ar)}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'تسجيل معدة' : 'Record Equipment'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'المعدة' : 'Equipment'} *</label>
                <select className="form-select" value={form.equipment_id} onChange={e => handleChange('equipment_id', e.target.value)} required>
                  <option value="">{locale === 'ar' ? '— اختر المعدة —' : '— Select Equipment —'}</option>
                  {equipment.map(eq => (
                    <option key={eq.id} value={eq.id}>{eqLabel(eq)}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الساعات' : 'Hours'} *</label>
                  <input className="form-input" type="number" step="0.5" min="0" value={form.hours} onChange={e => handleChange('hours', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تكلفة الساعة' : 'Hourly Cost'}</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.hourly_cost} onChange={e => handleChange('hourly_cost', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'} *</label>
                  <input className="form-input" type="date" value={form.work_date} onChange={e => handleChange('work_date', e.target.value)} required />
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

function WOCompletionsTab({ wo, projectId, locale, t, loadWorkOrders }) {
  const [completions, setCompletions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [boqItems, setBoqItems] = useState([]);

  const loadCompletions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/work-orders/${wo.id}/completions`);
      if (res.success) setCompletions(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [wo.id]);

  const loadBoqItems = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/boq/items/${projectId}`);
      if (res.success) setBoqItems(res.data || []);
    } catch (e) { console.error(e); }
  }, [projectId]);

  useEffect(() => { loadCompletions(); }, [loadCompletions]);

  const boqItemDesc = (c) => locale === 'ar' ? (c.boq_item_description_ar || c.boq_item_description_en) : (c.boq_item_description_en || c.boq_item_description_ar);

  const handleVerify = async (compId) => {
    try {
      await fetchApi(`${API_URL}/work-orders/${wo.id}/completions/${compId}/verify`, { method: 'PUT', body: JSON.stringify({ status: 'verified' }) });
      loadCompletions();
      loadWorkOrders();
    } catch (e) { alert(e.message); }
  };

  const handleReject = async (compId) => {
    try {
      await fetchApi(`${API_URL}/work-orders/${wo.id}/completions/${compId}/verify`, { method: 'PUT', body: JSON.stringify({ status: 'rejected' }) });
      loadCompletions();
      loadWorkOrders();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => { setShowForm(true); loadBoqItems(); }}>
          <Plus size={14} />
          {locale === 'ar' ? 'تسجيل إنجاز' : 'Record Completion'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : completions.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px' }}>
          {locale === 'ar' ? 'لا توجد تسجيلات إنجاز.' : 'No completions recorded yet.'}
        </p>
      ) : (
        <div className="table-container">
          <table className="table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'البند' : 'BOQ Item'}</th>
                <th>{locale === 'ar' ? 'الكمية' : 'Quantity'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {completions.map(comp => (
                <tr key={comp.id}>
                  <td style={{ fontSize: '12px' }}>{boqItemDesc(comp)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{comp.quantity_completed ?? '—'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(comp.completion_date)}</td>
                  <td>
                    <span className={`badge ${comp.status === 'verified' ? 'badge-success' : comp.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                      {comp.status === 'verified'
                        ? (locale === 'ar' ? 'معتمد' : 'Verified')
                        : comp.status === 'rejected'
                          ? (locale === 'ar' ? 'مرفوض' : 'Rejected')
                          : (locale === 'ar' ? 'معلق' : 'Pending')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {comp.status === 'pending' && (
                        <>
                          <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleVerify(comp.id)}>
                            <CheckCircle size={12} />
                            {locale === 'ar' ? 'اعتماد' : 'Verify'}
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleReject(comp.id)}>
                            <XCircle size={12} />
                            {locale === 'ar' ? 'رفض' : 'Reject'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <WOCompletionFormModal
          wo={wo}
          boqItems={boqItems}
          locale={locale}
          t={t}
          onClose={() => setShowForm(false)}
          onSave={() => { loadCompletions(); loadWorkOrders(); }}
        />
      )}
    </div>
  );
}

function WOCompletionFormModal({ wo, boqItems, locale, t, onClose, onSave }) {
  const [form, setForm] = useState({
    boq_item_id: '',
    quantity_completed: '',
    completion_date: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        boq_item_id: Number(form.boq_item_id),
        quantity_completed: Number(form.quantity_completed),
        completion_date: form.completion_date,
      };
      const res = await fetchApi(`${API_URL}/work-orders/${wo.id}/completions`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const itemLabel = (it) => {
    const code = it.code || '';
    const desc = locale === 'ar' ? (it.description_ar || it.description_en) : (it.description_en || it.description_ar);
    const unit = it.unit || '';
    return `${code} - ${desc} (${unit})`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'تسجيل إنجاز' : 'Record Completion'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'بند الحصر' : 'BOQ Item'} *</label>
                <select className="form-select" value={form.boq_item_id} onChange={e => handleChange('boq_item_id', e.target.value)} required>
                  <option value="">{locale === 'ar' ? '— اختر البند —' : '— Select BOQ Item —'}</option>
                  {boqItems.map(it => (
                    <option key={it.id} value={it.id}>{itemLabel(it)}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الكمية المنجزة' : 'Quantity Completed'} *</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.quantity_completed} onChange={e => handleChange('quantity_completed', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'} *</label>
                  <input className="form-input" type="date" value={form.completion_date} onChange={e => handleChange('completion_date', e.target.value)} required />
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

function WorkOrderModal({ wo, projectId, phases, boqSections, users, locale, t, onClose, onSave }) {
  const isEdit = !!wo && !!wo.id;
  const [form, setForm] = useState({
    title_en: wo?.title_en || '',
    title_ar: wo?.title_ar || '',
    phase_id: wo?.phase_id || '',
    boq_section_id: wo?.boq_section_id || '',
    planned_start_date: wo?.planned_start_date ? wo.planned_start_date.slice(0, 10) : '',
    planned_end_date: wo?.planned_end_date ? wo.planned_end_date.slice(0, 10) : '',
    assigned_to: wo?.assigned_to || '',
    description: wo?.description || '',
    notes: wo?.notes || '',
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
        ? `${API_URL}/work-orders/${wo.id}`
        : `${API_URL}/work-orders`;
      const method = isEdit ? 'PUT' : 'POST';
      const body = {
        title_en: form.title_en,
        title_ar: form.title_ar,
        phase_id: form.phase_id ? Number(form.phase_id) : null,
        boq_section_id: form.boq_section_id ? Number(form.boq_section_id) : null,
        planned_start_date: form.planned_start_date || null,
        planned_end_date: form.planned_end_date || null,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
        description: form.description,
        notes: form.notes,
      };
      if (!isEdit) body.project_id = Number(projectId);
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const phaseLabel = (p) => `${p.code || ''} - ${locale === 'ar' ? (p.name_ar || p.name) : (p.name_en || p.name)}`;
  const userLabel = (u) => u.name || u.username;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit
              ? (locale === 'ar' ? 'تعديل أمر العمل' : 'Edit Work Order')
              : (locale === 'ar' ? 'أمر عمل جديد' : 'New Work Order')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">English Title *</label>
                  <input className="form-input" value={form.title_en} onChange={e => handleChange('title_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">العنوان العربي *</label>
                  <input className="form-input" value={form.title_ar} onChange={e => handleChange('title_ar', e.target.value)} required />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المرحلة' : 'Phase'}</label>
                  <select className="form-select" value={form.phase_id} onChange={e => handleChange('phase_id', e.target.value)}>
                    <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
                    {phases.map(p => (
                      <option key={p.id} value={p.id}>{phaseLabel(p)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'قسم الحصر' : 'BOQ Section'}</label>
                  <select className="form-select" value={form.boq_section_id} onChange={e => handleChange('boq_section_id', e.target.value)}>
                    <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
                    {boqSections.map(s => (
                      <option key={s.id} value={s.id}>{s.code || ''} - {locale === 'ar' ? (s.name_ar || s.name_en) : (s.name_en || s.name_ar)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ البدء المخطط' : 'Planned Start'}</label>
                  <input className="form-input" type="date" value={form.planned_start_date} onChange={e => handleChange('planned_start_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ الانتهاء المخطط' : 'Planned End'}</label>
                  <input className="form-input" type="date" value={form.planned_end_date} onChange={e => handleChange('planned_end_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'مسند إلى' : 'Assigned To'}</label>
                  <select className="form-select" value={form.assigned_to} onChange={e => handleChange('assigned_to', e.target.value)}>
                    <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{userLabel(u)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الوصف' : 'Description'}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{t('common.notes')}</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
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

export default WorkOrders;
