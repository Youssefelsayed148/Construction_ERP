import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import ReasonDialog from '../components/common/ReasonDialog';
import LoadMore from '../components/common/LoadMore';
import { ArrowLeft, Plus, Edit, Trash2, ClipboardList, CheckCircle, XCircle, Package, Wrench, Users, Calendar } from 'lucide-react';
import { formatCurrency, formatDate, formatPercent, localizedName } from '../utils/formatters';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
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
  const workOrdersLength = useRef(0);
  workOrdersLength.current = workOrders.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
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

  const loadWorkOrders = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      params.append('limit', '200');
      params.append('offset', String(append ? workOrdersLength.current : 0));
      const res = await fetchApi(`${API_URL}/work-orders/project/${projectId}?${params}`);
      if (res.success) {
        setWorkOrders(current => append ? [...current, ...(res.data || [])] : (res.data || []));
        setTotalCount(res.totalCount ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
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
  const woTitle = (wo) => localizedName(wo, locale, 'title');
  const phaseName = (wo) => {
    if (!wo.phase_name && !wo.phase_name_ar && !wo.phase_name_en) return '—';
    return localizedName(wo, locale, 'phase_name');
  };
  const boqSectionName = (wo) => {
    if (!wo.boq_section_name_ar && !wo.boq_section_name_en) return '—';
    return localizedName(wo, locale, 'boq_section_name');
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
              {t('workorders.system.workOrdersForProject')}
            </p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingWO(null); setShowCreateModal(true); loadRefData(); }}>
          <Plus size={16} />
          {t('workorders.system.newWorkOrder')}
        </button>
      </div>

      <div className="level-line" />

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{counts.total}</div>
          <div className="stat-label">{t('workorders.system.totalOrders')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>{counts.planned}</div>
          <div className="stat-label">{STATUS_LABELS[locale]?.planned || t('workorders.system.planned')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-text-secondary)' }}>{counts.inProgress}</div>
          <div className="stat-label">{STATUS_LABELS[locale]?.in_progress || t('workorders.system.inProgress')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>{counts.completed}</div>
          <div className="stat-label">{STATUS_LABELS[locale]?.completed || t('workorders.system.completed')}</div>
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
            {t('workorders.system.noWorkOrdersFoundCreateYourFirst')}
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
                      <span>{t('workorders.system.phase')}: <span style={{ color: 'var(--color-text-primary)' }}>{phaseName(wo)}</span></span>
                      <span>{t('workorders.system.boqSection')}: <span style={{ color: 'var(--color-text-primary)' }}>{boqSectionName(wo)}</span></span>
                      {wo.assigned_to_name && (
                        <span>{t('workorders.system.assigned')}: <span style={{ color: 'var(--color-text-primary)' }}>{wo.assigned_to_name}</span></span>
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
                        ? (t('workorders.system.collapse'))
                        : (t('workorders.system.details'))}
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

      <LoadMore loadedCount={workOrders.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => loadWorkOrders({ append: true })} />
      <ReasonDialog
        open={Boolean(cancelTarget)}
        title={t('workorders.cancel.title')}
        message={cancelTarget ? t('workorders.cancel.message', { title: (localizedName(cancelTarget, locale, 'title')) || cancelTarget.title || cancelTarget.title_ar || '' }) : ''}
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
              <span>{localizedName(tab, locale, 'label')}</span>
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

  const itemLabel = (it) => localizedName(it, locale, 'item_name') || localizedName(it.item, locale);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => { setShowForm(true); loadRefData(); }}>
          <Plus size={14} />
          {t('workorders.system.issueMaterial')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : materials.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px' }}>
          {t('workorders.system.noMaterialsIssuedYet')}
        </p>
      ) : (
        <div className="table-container">
          <table className="table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>{t('workorders.system.item')}</th>
                <th>{t('workorders.system.plannedQty')}</th>
                <th>{t('workorders.system.actualQty')}</th>
                <th>{t('workorders.system.unitCost')}</th>
                <th>{t('common.total')}</th>
                <th>{t('workorders.system.warehouse')}</th>
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

  const itemLabel = (it) => `${it.code || ''} - ${localizedName(it, locale)} (${it.unit || '—'})`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('workorders.system.issueMaterial')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('workorders.system.item')} *</label>
                <select className="form-select" value={form.item_id} onChange={e => handleChange('item_id', e.target.value)} required>
                  <option value="">{t('workorders.system.selectItem')}</option>
                  {items.map(it => (
                    <option key={it.id} value={it.id}>{itemLabel(it)}</option>
                  ))}
                </select>
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.plannedQty')}</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.planned_quantity} onChange={e => handleChange('planned_quantity', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.actualQty')}</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.actual_quantity} onChange={e => handleChange('actual_quantity', e.target.value)} />
                </div>
              </div>
              <div className="responsive-grid responsive-grid--one" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.warehouse')}</label>
                  <select className="form-select" value={form.warehouse_id} onChange={e => handleChange('warehouse_id', e.target.value)}>
                    <option value="">{t('workorders.system.select')}</option>
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
          {t('workorders.system.recordLabor')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px' }}>
          {t('workorders.system.noLaborEntriesRecorded')}
        </p>
      ) : (
        <div className="table-container">
          <table className="table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>{t('workorders.system.skill')}</th>
                <th>{t('workorders.system.workers')}</th>
                <th>{t('workorders.system.hours')}</th>
                <th>{t('workorders.system.date')}</th>
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
          <h3 className="modal-title">{t('workorders.system.recordLabor')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('workorders.system.skillCategory')}</label>
                <select className="form-select" value={form.skill_category} onChange={e => handleChange('skill_category', e.target.value)}>
                  {SKILLS.map(s => (
                    <option key={s} value={s}>{SKILL_LABELS[locale]?.[s] || s}</option>
                  ))}
                </select>
              </div>
              <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.workerCount')} *</label>
                  <input className="form-input" type="number" min="0" value={form.worker_count} onChange={e => handleChange('worker_count', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.hours')} *</label>
                  <input className="form-input" type="number" step="0.5" min="0" value={form.hours} onChange={e => handleChange('hours', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.date')} *</label>
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

  const eqLabel = (eq) => localizedName(eq, locale, 'equipment_name') || localizedName(eq.equipment, locale);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => { setShowForm(true); loadEquipment(); }}>
          <Plus size={14} />
          {t('workorders.system.recordEquipment')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : entries.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px' }}>
          {t('workorders.system.noEquipmentEntriesRecorded')}
        </p>
      ) : (
        <div className="table-container">
          <table className="table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>{t('workorders.system.equipment')}</th>
                <th>{t('workorders.system.hours')}</th>
                <th>{t('workorders.system.hourlyCost')}</th>
                <th>{t('common.total')}</th>
                <th>{t('workorders.system.date')}</th>
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

  const eqLabel = (eq) => `${eq.code || ''} - ${localizedName(eq, locale)}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('workorders.system.recordEquipment')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('workorders.system.equipment')} *</label>
                <select className="form-select" value={form.equipment_id} onChange={e => handleChange('equipment_id', e.target.value)} required>
                  <option value="">{t('workorders.system.selectEquipment')}</option>
                  {equipment.map(eq => (
                    <option key={eq.id} value={eq.id}>{eqLabel(eq)}</option>
                  ))}
                </select>
              </div>
              <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.hours')} *</label>
                  <input className="form-input" type="number" step="0.5" min="0" value={form.hours} onChange={e => handleChange('hours', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.hourlyCost')}</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.hourly_cost} onChange={e => handleChange('hourly_cost', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.date')} *</label>
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

  const boqItemDesc = (c) => localizedName(c, locale, 'boq_item_description');

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
          {t('workorders.system.recordCompletion')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : completions.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', padding: '20px' }}>
          {t('workorders.system.noCompletionsRecordedYet')}
        </p>
      ) : (
        <div className="table-container">
          <table className="table" style={{ fontSize: '13px' }}>
            <thead>
              <tr>
                <th>{t('workorders.system.boqItem')}</th>
                <th>{t('workorders.system.quantity')}</th>
                <th>{t('workorders.system.date')}</th>
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
                        ? (t('workorders.system.verified'))
                        : comp.status === 'rejected'
                          ? (t('workorders.system.rejected'))
                          : (t('workorders.system.pending'))}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {comp.status === 'pending' && (
                        <>
                          <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleVerify(comp.id)}>
                            <CheckCircle size={12} />
                            {t('workorders.system.verify')}
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => handleReject(comp.id)}>
                            <XCircle size={12} />
                            {t('workorders.system.reject')}
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
    const desc = localizedName(it, locale, 'description');
    const unit = it.unit || '';
    return `${code} - ${desc} (${unit})`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('workorders.system.recordCompletion')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('workorders.system.boqItem2')} *</label>
                <select className="form-select" value={form.boq_item_id} onChange={e => handleChange('boq_item_id', e.target.value)} required>
                  <option value="">{t('workorders.system.selectBoqItem')}</option>
                  {boqItems.map(it => (
                    <option key={it.id} value={it.id}>{itemLabel(it)}</option>
                  ))}
                </select>
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.quantityCompleted')} *</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.quantity_completed} onChange={e => handleChange('quantity_completed', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.date')} *</label>
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

  const phaseLabel = (p) => `${p.code || ''} - ${localizedName(p, locale)}`;
  const userLabel = (u) => u.name || u.username;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit
              ? (t('workorders.system.editWorkOrder'))
              : (t('workorders.system.newWorkOrder'))}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.englishTitle')}</label>
                  <input className="form-input" value={form.title_en} onChange={e => handleChange('title_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">العنوان العربي *</label>
                  <input className="form-input" value={form.title_ar} onChange={e => handleChange('title_ar', e.target.value)} required />
                </div>
              </div>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.phase')}</label>
                  <select className="form-select" value={form.phase_id} onChange={e => handleChange('phase_id', e.target.value)}>
                    <option value="">{t('workorders.system.select')}</option>
                    {phases.map(p => (
                      <option key={p.id} value={p.id}>{phaseLabel(p)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.boqSection')}</label>
                  <select className="form-select" value={form.boq_section_id} onChange={e => handleChange('boq_section_id', e.target.value)}>
                    <option value="">{t('workorders.system.select')}</option>
                    {boqSections.map(s => (
                      <option key={s.id} value={s.id}>{s.code || ''} - {localizedName(s, locale)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="responsive-grid responsive-grid--three" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.plannedStart')}</label>
                  <input className="form-input" type="date" value={form.planned_start_date} onChange={e => handleChange('planned_start_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.plannedEnd')}</label>
                  <input className="form-input" type="date" value={form.planned_end_date} onChange={e => handleChange('planned_end_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('workorders.system.assignedTo')}</label>
                  <select className="form-select" value={form.assigned_to} onChange={e => handleChange('assigned_to', e.target.value)}>
                    <option value="">{t('workorders.system.select')}</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{userLabel(u)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('workorders.system.description')}</label>
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
