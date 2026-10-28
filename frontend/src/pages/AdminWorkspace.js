import { translateEnum } from '../i18n/enums';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import FormActions from '../components/common/FormActions';
import FormField from '../components/common/FormField';
import LoadMore from '../components/common/LoadMore';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { useManagedForm } from '../hooks/useManagedForm';
import { useApiClient } from '../hooks/useApiClient';
import { useLocale } from '../hooks/useLocale';
import { ApiError, apiUrl, parseTotalCount } from '../services/apiClient';
import { authService } from '../services/api';

const roleOptions = ['owner', 'admin', 'owner_ceo', 'coo', 'project_manager', 'engineer', 'site_engineer', 'hr_manager', 'accountant_ap', 'storekeeper', 'staff'];
const approvalActions = ['issue_purchase_order', 'issue_client_invoice', 'record_payment', 'approve_payment_certificate', 'release_retention', 'void_financial_record', 'approve_supplier_invoice'];
const field = (name, type = 'text', required = false, options) => ({ name, type, required, options });

export const ADMIN_AREAS = {
  organizations: {
    title: 'organizations', module: 'organizations', roles: ['owner', 'admin', 'owner_ceo', 'coo'],
    list: '/organizations', create: '/organizations', update: id => `/organizations/${id}`, deactivate: id => `/organizations/${id}/deactivate`, deactivateMethod: 'POST',
    fields: [field('code', 'text', true), field('org_type', 'select', true, ['client', 'supplier', 'subcontractor', 'consultant', 'other']), field('name_en', 'text', true), field('name_ar', 'text', true), field('contact_person'), field('email', 'email'), field('phone'), field('city')],
    columns: ['code', 'name_en', 'org_type', 'status'],
  },
  users: {
    title: 'users', module: 'users', roles: ['owner', 'admin'], list: '/users', update: id => `/users/${id}`, deactivate: id => `/users/${id}`, deactivateMethod: 'DELETE',
    fields: [field('name', 'text', true), field('role', 'select', true, roleOptions), field('department'), field('is_active', 'checkbox')],
    columns: ['name', 'email', 'role', 'is_active'],
  },
  delegations: {
    title: 'delegations', module: 'delegations', roles: ['owner', 'admin', 'owner_ceo', 'coo'], list: '/delegations', create: '/delegations', deactivate: id => `/delegations/${id}/deactivate`, deactivateMethod: 'POST',
    fields: [field('delegate_user_id', 'number', true), field('module_scope', 'text', true), field('max_amount', 'number'), field('valid_from', 'date'), field('valid_to', 'date', true), field('notes', 'textarea')],
    columns: ['delegate_from_name', 'delegate_name', 'module_scope', 'valid_to', 'is_active'],
  },
  'approval-limits': {
    title: 'approvalLimits', module: 'approvals', roles: ['owner', 'admin'], list: '/approval-limits', update: () => '/approval-limits', updateMethod: 'PUT',
    fields: [field('role', 'select', true, roleOptions), field('action', 'select', true, approvalActions), field('max_amount', 'number', true), field('currency', 'text', true), field('enabled', 'checkbox')],
    columns: ['role', 'action', 'max_amount', 'currency', 'enabled'],
  },
  'inventory-documents': {
    title: 'inventoryDocuments', module: 'inventory', roles: ['owner', 'admin', 'storekeeper', 'site_supervisor'],
    list: params => `/inventory/${params.get('type') || 'issues'}`, create: params => `/inventory/${params.get('type') || 'issues'}`, editDetail: (id, params) => `/inventory/${params.get('type') || 'issues'}/${id}`, update: (id, params) => `/inventory/${params.get('type') || 'issues'}/${id}`, post: (id, params) => `/inventory/${params.get('type') || 'issues'}/${id}/post`, void: (id, params) => `/inventory/${params.get('type') || 'issues'}/${id}/void`,
    fields: [field('project_id', 'number'), field('warehouse_id', 'number', true), field('reason'), field('notes', 'textarea'), field('lines_json', 'textarea', true)],
    columns: ['doc_number', 'doc_type', 'project_id', 'status', 'created_at'], projectScoped: true, documentLines: true,
  },
  variations: {
    title: 'variations', module: 'commercial', roles: ['owner', 'admin', 'project_manager', 'engineer'],
    list: params => `/commercial/variations/${encodeURIComponent(params.get('project_id') || '')}`, create: '/commercial/variations', update: id => `/commercial/variations/${id}`,
    fields: [field('project_id', 'number', true), field('title', 'text', true), field('description', 'textarea'), field('cause', 'select', false, ['client_instruction', 'design_change', 'site_condition', 'regulatory', 'omission', 'contractor_request', 'force_majeure', 'other']), field('responsibility', 'select', false, ['client', 'contractor', 'third_party', 'shared']), field('time_impact_days', 'number'), field('recommended_amount', 'number')],
    columns: ['variation_number', 'title', 'status', 'recommended_amount', 'created_at'], projectScoped: true,
  },
  sla: {
    title: 'sla', module: 'handover', roles: ['owner', 'admin', 'project_manager', 'consultant', 'client'],
    list: '/handover/claims', detail: row => `/handover/claims/${row.id}/sla`, fields: [], columns: ['claim_number', 'title', 'status', 'sla_days', 'due_date'], projectScoped: true,
  },
  webhooks: {
    title: 'webhooks', module: 'integrations', roles: ['owner', 'admin'], list: '/v1/webhooks', create: '/v1/webhooks', update: id => `/v1/webhooks/${id}`, deactivate: id => `/v1/webhooks/${id}`, deactivateMethod: 'DELETE', rotate: id => `/v1/webhooks/${id}/rotate-secret`,
    fields: [field('url', 'url', true), field('events_json', 'textarea', true), field('project_ids_json', 'textarea'), field('description', 'textarea')], columns: ['id', 'url', 'events', 'is_active'], secretOnce: true,
  },
  'api-tokens': {
    title: 'apiTokens', module: 'agents', roles: ['owner', 'admin'], list: '/agent/tokens', create: '/agent/tokens', deactivate: id => `/agent/tokens/${id}/revoke`, deactivateMethod: 'POST',
    fields: [field('name', 'text', true), field('scopes_text', 'textarea', true), field('expires_in_days', 'number', true)], columns: ['name', 'token_prefix', 'scopes', 'expires_at', 'revoked_at'], secretOnce: true, tokenOnce: true,
  },
  numbering: {
    title: 'numbering', module: 'doccontrol', roles: ['owner', 'admin', 'project_manager'],
    list: params => `/docs/numbering/${encodeURIComponent(params.get('project_id') || '')}`, update: (_id, params) => `/docs/numbering/${encodeURIComponent(params.get('project_id') || '')}`, updateMethod: 'PUT', single: true,
    fields: [field('project_id', 'number', true), field('doc_prefix'), field('include_discipline', 'checkbox'), field('include_type', 'checkbox'), field('seq_pad', 'number'), field('rev_prefix')], columns: ['project_id', 'doc_prefix', 'include_discipline', 'include_type', 'seq_pad', 'rev_prefix'], projectScoped: true,
  },
  replenishment: {
    title: 'replenishment', module: 'materials', roles: ['owner', 'admin', 'storekeeper', 'purchasing_mgr'], list: params => `/materials/replenishment/${params.get('view') === 'alerts' ? 'alerts' : 'policies'}`, create: '/materials/replenishment/policies', createMethod: 'PUT', update: () => '/materials/replenishment/policies', updateMethod: 'PUT', deactivate: () => '/materials/replenishment/policies', deactivateMethod: 'DELETE', sweep: '/materials/replenishment/sweep',
    fields: [field('scope', 'select', true, ['default', 'material', 'category']), field('ref'), field('mode', 'select', true, ['alert_only', 'auto_draft_pr', 'auto_draft_po', 'auto_issue_po'])], columns: ['rule_key', 'rule_value', 'is_active', 'updated_at'],
  },
  'materials-recipes': {
    title: 'materialsRecipes', module: 'materials', roles: ['owner', 'admin', 'storekeeper', 'purchasing_mgr', 'project_manager'],
    list: '/materials/recipes', create: '/materials/recipes', update: id => `/materials/recipes/${id}`,
    fields: [field('project_id', 'number'), field('boq_item_id', 'number'), field('activity_type', 'select', false, ['concrete_pour', 'blockwork', 'plastering', 'steel_fixing', 'formwork', 'finishing', 'earthworks', 'other']), field('code'), field('name', 'text', true), field('name_en'), field('name_ar'), field('output_description'), field('output_unit'), field('notes', 'textarea'), field('is_active', 'checkbox'), field('lines_json', 'textarea')],
    columns: ['code', 'name', 'activity_type', 'output_unit', 'is_active'], projectScoped: true,
  },
  maintenance: {
    title: 'maintenance', module: 'maintenance', roles: ['owner', 'admin', 'project_manager', 'site_engineer'],
    list: '/maintenance', create: '/maintenance', update: id => `/maintenance/${id}`,
    fields: [field('project_id', 'number', true), field('asset_id', 'number', true), field('title', 'text', true), field('description', 'textarea'), field('maintenance_type'), field('priority'), field('scheduled_date', 'date', true), field('next_due_date', 'date'), field('interval_value', 'number'), field('interval_unit'), field('estimated_hours', 'number'), field('estimated_cost', 'number'), field('assigned_tech'), field('status', 'select', false, ['scheduled', 'in_progress', 'completed', 'overdue', 'cancelled']), field('actual_hours', 'number'), field('actual_cost', 'number'), field('completion_date', 'date'), field('completion_notes', 'textarea')],
    columns: ['title', 'asset_id', 'status', 'scheduled_date', 'next_due_date'], projectScoped: true,
  },
  'cost-codes': {
    title: 'costCodes', module: 'costing', roles: ['owner', 'admin'],
    list: '/costing/codes', create: '/costing/codes', update: id => `/costing/codes/${id}`,
    fields: [field('code', 'text', true), field('name', 'text', true), field('name_en'), field('name_ar'), field('parent_id', 'number'), field('level', 'number'), field('type', 'select', false, ['material', 'labour', 'equipment', 'subcontract', 'overhead', 'other'])],
    columns: ['code', 'name', 'type', 'level'],
  },
};

async function parseResponse(response) {
  let body;
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const error = body.error && typeof body.error === 'object' ? body.error : {};
    throw new ApiError({
      status: response.status,
      code: body.error_code || error.error_code || error.code,
      message: typeof body.error === 'string' ? body.error : error.message,
      params: body.error_params || error.error_params,
      data: body,
    });
  }
  return { body, totalCount: parseTotalCount(response.headers) };
}

function emptyValues(config) {
  return Object.fromEntries(config.fields.map(item => [item.name, item.type === 'checkbox' ? false : '']));
}

export function canAccessAdminArea(user, area) {
  const config = ADMIN_AREAS[area];
  if (!config || !user || !config.roles.includes(user.role)) return false;
  const modules = Array.isArray(user.policy_modules) ? user.policy_modules : user.module_permissions;
  if (Array.isArray(modules) && !modules.includes('*') && !modules.includes('all') && !modules.includes(config.module)) return false;
  const grants = user.policy_permissions;
  if (Array.isArray(grants) && !grants.some(grant => (grant.module === '*' || grant.module === config.module) && (grant.action === '*' || grant.action === 'view'))) return false;
  return true;
}

export default function AdminWorkspace() {
  const { area } = useParams();
  const config = ADMIN_AREAS[area];
  const { t, dir } = useLocale();
  const user = useMemo(() => authService.getCurrentUser(), []);
  const request = useApiClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(null);
  const paging = useRef({ offset: 0, total: null });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [availableRoles, setAvailableRoles] = useState([]);
  const [oneTimeSecret, setOneTimeSecret] = useState('');
  const [slaDetails, setSlaDetails] = useState(null);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [projectId, setProjectId] = useState(() => new URLSearchParams(location.search).get('project_id') || '');
  const pageSize = 200;

  const refresh = useCallback(async ({ append = false } = {}) => {
    if (!config || !canAccessAdminArea(user, area)) return;
    setLoading(true); setLoadError(null);
    const nextOffset = append ? paging.current.offset : 0;
    const params = new URLSearchParams(location.search);
    if (config.projectScoped && area === 'inventory-documents' && !params.has('project_id')) {
      params.set('project_id', '');
    }
    params.set('limit', String(pageSize)); params.set('offset', String(nextOffset));
    try {
      if (config.projectScoped && ['variations', 'sla', 'numbering'].includes(area) && !params.get('project_id')) {
        setRows([]); setTotalCount(0); setLoadError(new ApiError({ code: 'validation_error' })); return;
      }
      const listPath = typeof config.list === 'function' ? config.list(params) : config.list;
      const { body, totalCount: count } = await parseResponse(await request(apiUrl(`${listPath}?${params}`)));
      if (area === 'users' || area === 'approval-limits') {
        const rolesResult = await parseResponse(await request(apiUrl('/users/preview/roles')));
        setAvailableRoles((rolesResult.body.data || []).map(role => role.key));
      }
      const data = body.data ?? body;
      const page = config.single ? (data ? [data] : []) : Array.isArray(data) ? data : data?.rows || [];
      setRows(previous => append ? [...previous, ...page] : page);
      paging.current.offset = nextOffset + page.length;
      paging.current.total = count ?? (append ? paging.current.total : page.length);
      setTotalCount(paging.current.total);
    } catch (error) {
      if (error.name !== 'AbortError') setLoadError(error);
    } finally { setLoading(false); }
  }, [area, config, location.search, request, user]);

  useEffect(() => { paging.current = { offset: 0, total: null }; setRows([]); refresh(); }, [refresh]);
  useEffect(() => { setOneTimeSecret(''); setSlaDetails(null); setVoidTarget(null); }, [area]);

  const save = useCallback(async values => {
    const payload = { ...values };
    ['lines_json', 'events_json', 'project_ids_json'].forEach(key => {
      if (payload[key] != null && payload[key] !== '') {
        const target = key.replace('_json', '').replace('_text', '');
        payload[target] = key === 'project_ids_json'
          ? JSON.parse(payload[key]).map(Number)
          : key === 'events_json'
            ? JSON.parse(payload[key])
            : key === 'lines_json'
              ? JSON.parse(payload[key])
              : payload[key].split(',').map(item => item.trim()).filter(Boolean);
        delete payload[key];
      } else delete payload[key];
    });
    config.fields.forEach(item => {
      if (item.type === 'number' && payload[item.name] !== '') payload[item.name] = Number(payload[item.name]);
      if (item.type === 'checkbox') payload[item.name] = Boolean(payload[item.name]);
      if (payload[item.name] === '') {
        if (item.required) payload[item.name] = null;
        else delete payload[item.name];
      }
    });
    if (payload.project_id !== undefined) payload.project_id = Number(payload.project_id);
    if (area === 'numbering' || (area === 'variations' && editing)) delete payload.project_id;
    if (area === 'maintenance' && editing) { delete payload.project_id; delete payload.asset_id; }
    const params = new URLSearchParams(location.search);
    const path = editing ? (typeof config.update === 'function' ? config.update(editing.id, params) : config.update) : (typeof config.create === 'function' ? config.create(params) : config.create);
    const method = editing ? (config.updateMethod || 'PUT') : (config.createMethod || 'POST');
    const { body } = await parseResponse(await request(apiUrl(path), { method, body: JSON.stringify(payload) }));
    if (config.secretOnce && (body.data?.secret || body.data?.token)) setOneTimeSecret(body.data.secret || body.data.token);
    setNotice(body.message || t('admin.messages.saved'));
    setEditing(null);
    await refresh();
  }, [area, config, editing, location.search, refresh, request, t]);

  const initialFormValues = useMemo(() => editing ? Object.fromEntries(config?.fields?.map(item => [item.name, editing[item.name] ?? '']) || []) : emptyValues(config || { fields: [] }), [config, editing]);
  const validationRules = useMemo(() => Object.fromEntries(config?.fields?.map(item => [item.name, { required: item.required }]) || []), [config]);
  const form = useManagedForm({ initialValues: initialFormValues, rules: validationRules, onSubmit: save });
  const resetForm = form.reset;

  useEffect(() => { if (config) resetForm(editing ? Object.fromEntries(config.fields.map(item => [item.name, editing[item.name] ?? ''])) : emptyValues(config)); }, [editing, config, resetForm]);

  const editRow = async row => {
    if (config.editDetail) {
      try {
        const params = new URLSearchParams(location.search);
        const { body } = await parseResponse(await request(apiUrl(config.editDetail(row.id, params))));
        row = body.data || row;
      } catch (error) { setLoadError(error); return; }
    }
    if (area === 'inventory-documents') row = { ...row, lines_json: JSON.stringify(row.lines || []) };
    if (area === 'webhooks') row = { ...row, events_json: JSON.stringify(row.events || []), project_ids_json: JSON.stringify(row.project_ids || []) };
    if (area === 'replenishment') {
      const parts = String(row.rule_key || '').split(':');
      const scope = parts[1] === 'default' ? 'default' : (parts[1] || 'default');
      const ref = scope === 'default' ? '' : parts.slice(2).join(':');
      let policy = {};
      try { policy = typeof row.rule_value === 'string' ? JSON.parse(row.rule_value) : row.rule_value || {}; } catch { /* keep an editable empty policy */ }
      row = { ...row, scope, ref, mode: policy.mode || 'alert_only' };
    }
    setEditing(row);
  };

  const deactivate = async row => {
    try {
      const params = new URLSearchParams(location.search);
      const endpoint = typeof config.deactivate === 'function' ? config.deactivate(row.id, params) : config.deactivate;
      let query = '';
      if (config.deactivateMethod === 'DELETE' && area === 'replenishment') {
        const parts = String(row.rule_key || '').split(':');
        const scope = parts[1] === 'default' ? 'default' : parts[1];
        const ref = scope === 'default' ? '' : parts.slice(2).join(':');
        query = `?scope=${encodeURIComponent(scope)}&ref=${encodeURIComponent(ref)}`;
      }
      await parseResponse(await request(apiUrl(`${endpoint}${query}`), { method: config.deactivateMethod || 'POST', body: '{}' }));
      setNotice(t('admin.messages.deactivated'));
      refresh();
    } catch (error) { setLoadError(error); }
  };

  const documentAction = async (row, action) => {
    const params = new URLSearchParams(location.search);
    try {
      await parseResponse(await request(apiUrl(config[action](row.id, params)), {
        method: 'POST', body: action === 'void' ? JSON.stringify({ reason: voidReason.trim() }) : '{}',
      }));
      setNotice(t(action === 'post' ? 'admin.messages.posted' : 'admin.messages.voided'));
      setVoidTarget(null); setVoidReason('');
      refresh();
    } catch (error) { setLoadError(error); }
  };

  const showSla = async row => {
    try { const { body } = await parseResponse(await request(apiUrl(config.detail(row)))); setSlaDetails(body.data || body); }
    catch (error) { setLoadError(error); }
  };

  const rotateSecret = async row => {
    try { const { body } = await parseResponse(await request(apiUrl(config.rotate(row.id)), { method: 'POST', body: '{}' })); setOneTimeSecret(body.data.secret); }
    catch (error) { setLoadError(error); }
  };

  const runSweep = async () => {
    try { await parseResponse(await request(apiUrl(config.sweep), { method: 'POST', body: '{}' })); setNotice(t('admin.messages.sweepComplete')); refresh(); }
    catch (error) { setLoadError(error); }
  };

  const columns = useMemo(() => config?.columns || [], [config]);
  const paramsForView = new URLSearchParams(location.search);
  const showingAlerts = area === 'replenishment' && paramsForView.get('view') === 'alerts';
  const formTitleKey = editing ? 'admin.actions.edit' : config?.create ? 'admin.actions.create' : 'admin.actions.edit';
  const applyProjectScope = event => {
    event.preventDefault();
    const params = new URLSearchParams(location.search);
    if (projectId) params.set('project_id', projectId); else params.delete('project_id');
    navigate({ search: params.toString() ? `?${params.toString()}` : '' });
  };
  if (!config) return <ErrorState message={t('admin.messages.unknownArea')} />;
  if (!canAccessAdminArea(user, area)) return <ErrorState message={t('admin.messages.permissionDenied')} />;

  return (
    <main className="page-container admin-workspace" dir={dir}>
      <header className="page-header"><h1>{t(`admin.${config.title}.title`)}</h1>
        <nav aria-label={t('admin.nav.areas')} className="admin-area-nav">
          {Object.entries(ADMIN_AREAS).filter(([key]) => canAccessAdminArea(user, key)).map(([key, item]) => <button key={key} type="button" className="btn" aria-current={key === area ? 'page' : undefined} onClick={() => navigate(`/admin/${key}`)}>{t(`admin.${item.title}.title`)}</button>)}
        </nav>
      </header>
      {notice && <div role="status" className="alert alert-success">{notice}</div>}
      {config.projectScoped && <form className="card admin-project-scope" onSubmit={applyProjectScope}>
        <FormField id="admin-project-scope-id" label={t('admin.fields.project_id')} type="number" required value={projectId} onChange={event => setProjectId(event.target.value)} />
        <button className="btn" type="submit">{t('admin.actions.loadProject')}</button>
      </form>}
      {area === 'inventory-documents' && <div className="admin-area-nav" aria-label={t('admin.inventoryDocuments.types')}>{['issues', 'returns', 'adjustments'].map(type => <button key={type} className="btn" type="button" aria-pressed={paramsForView.get('type') === type || (!paramsForView.has('type') && type === 'issues')} onClick={() => navigate({ search: `?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(location.search)), type }).toString()}` })}>{t(`admin.options.${type}`)}</button>)}</div>}
      {area === 'replenishment' && <div className="admin-area-nav" aria-label={t('admin.replenishment.views')}>
        <button className="btn" type="button" onClick={() => navigate({ search: '?view=policies' })}>{t('admin.actions.policies')}</button>
        <button className="btn" type="button" onClick={() => navigate({ search: '?view=alerts' })}>{t('admin.actions.alerts')}</button>
      </div>}
      {oneTimeSecret && <div role="alert" className="alert alert-warning admin-secret"><strong>{t(config.tokenOnce ? 'admin.messages.tokenShownOnce' : 'admin.messages.secretShownOnce')}</strong><code>{oneTimeSecret}</code><button className="btn" type="button" onClick={() => setOneTimeSecret('')}>{t('common.close')}</button></div>}
      {slaDetails && <section className="card" role="dialog" aria-modal="true" aria-label={t('admin.sla.title')}><dl>{Object.entries(slaDetails).map(([key, value]) => <React.Fragment key={key}><dt>{t(`admin.fields.${key}`, key)}</dt><dd>{String(value ?? '—')}</dd></React.Fragment>)}</dl><button className="btn" type="button" onClick={() => setSlaDetails(null)}>{t('common.close')}</button></section>}
      {voidTarget && <form className="card" onSubmit={event => { event.preventDefault(); if (voidReason.trim()) documentAction(voidTarget, 'void'); }}>
        <FormField id="admin-void-reason" label={t('admin.fields.reason')} required value={voidReason} onChange={event => setVoidReason(event.target.value)} />
        <div className="form-actions"><button type="button" className="btn" onClick={() => setVoidTarget(null)}>{t('common.cancel')}</button><button type="submit" className="btn btn-primary" disabled={!voidReason.trim()}>{t('admin.actions.confirmVoid')}</button></div>
      </form>}
      {config.fields.length > 0 && !showingAlerts && (config.create || (editing && config.update)) && <form onSubmit={form.submit} className="card admin-form">
        <h2>{t(formTitleKey)}</h2>
        {config.fields.map(item => {
          const options = item.name === 'role' && availableRoles.length ? availableRoles : (item.options || []);
          return <FormField key={item.name} id={`admin-${item.name}`} label={t(`admin.fields.${item.name}`)} required={item.required} as={item.type === 'textarea' ? 'textarea' : item.type === 'select' ? 'select' : 'input'} type={item.type === 'checkbox' ? 'checkbox' : ['textarea', 'select'].includes(item.type) ? undefined : item.type} checked={item.type === 'checkbox' ? !!form.values[item.name] : undefined} value={item.type === 'checkbox' ? undefined : form.values[item.name]} error={form.errors[item.name]} onChange={event => form.change(item.name, item.type === 'checkbox' ? event.target.checked : event.target.value)}>
            {item.type === 'select' && <><option key="empty" value="">{t('common.select', 'Select')}</option>{options.map(option => <option key={option} value={option}>{item.name === 'role' ? translateEnum(t, 'role', option) : t(`admin.options.${option}`, option)}</option>)}</>}
          </FormField>;
        })}
        <FormActions saving={form.saving} error={form.submitError} onCancel={editing ? () => setEditing(null) : undefined} submitLabel={t('common.save')} />
      </form>}
      {loadError && <ErrorState message={t(loadError.translationKey || 'common.states.error')} onRetry={() => refresh()} />}
      {config.sweep && <button type="button" className="btn" onClick={runSweep} disabled={loading}>{t('admin.actions.runSweep')}</button>}
      {loading && rows.length === 0 ? <LoadingState /> : rows.length === 0 ? <EmptyState /> : <div className="table-responsive"><table className="data-table"><thead><tr>{columns.map(key => <th key={key}>{t(`admin.fields.${key}`)}</th>)}<th>{t('common.actions')}</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}>{columns.map(key => <td key={key}>{row[key] == null ? '—' : ['status', 'role'].includes(key) ? translateEnum(t, key, row[key]) : typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key])}</td>)}<td className="admin-row-actions">
          {config.detail && <button type="button" className="btn btn-sm" onClick={() => showSla(row)}>{t('admin.actions.viewSla')}</button>}
          {config.update && !showingAlerts && <button type="button" className="btn btn-sm" onClick={() => editRow(row)}>{t('common.edit')}</button>}
          {config.post && row.status === 'draft' && <button type="button" className="btn btn-sm" onClick={() => documentAction(row, 'post')}>{t('admin.actions.post')}</button>}
          {config.void && row.status !== 'voided' && row.status !== 'posted' && <button type="button" className="btn btn-sm" onClick={() => setVoidTarget(row)}>{t('admin.actions.void')}</button>}
          {config.rotate && <button type="button" className="btn btn-sm" onClick={() => rotateSecret(row)}>{t('admin.actions.rotateSecret')}</button>}
          {config.deactivate && !showingAlerts && !(area === 'replenishment' && row.rule_key === 'replenishment_policy:default') && row.is_active !== false && row.status !== 'inactive' && !row.revoked_at && <button type="button" className="btn btn-sm" onClick={() => deactivate(row)}>{t('admin.actions.deactivate')}</button>}
        </td></tr>)}
      </tbody></table></div>}
      <LoadMore loadedCount={rows.length} totalCount={totalCount} loading={loading} t={t} onLoadMore={() => refresh({ append: true })} />
    </main>
  );
}
