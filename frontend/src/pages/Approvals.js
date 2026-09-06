import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { authService } from '../services/api';
import { ClipboardList, CheckCircle, XCircle, History, Inbox, Clock, Circle } from 'lucide-react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const PENDING_ALLOWED_ROLES = ['owner', 'admin', 'finance_manager', 'purchasing_mgr', 'project_manager', 'legal_mgr', 'maintenance_mgr'];

const MODULE_LABELS = {
  en: {
    purchase_orders: 'Purchase Orders', grn: 'Goods Receipt', expenses: 'Expenses', payroll: 'Payroll',
    legal: 'Legal', assets: 'Assets', maintenance: 'Maintenance', project_budgets: 'Project Budgets', sub_contracts: 'Sub-Contracts',
  },
  ar: {
    purchase_orders: 'أوامر الشراء', grn: 'إشعارات الاستلام', expenses: 'المصروفات', payroll: 'الرواتب',
    legal: 'الشؤون القانونية', assets: 'الأصول', maintenance: 'الصيانة', project_budgets: 'ميزانيات المشاريع', sub_contracts: 'العقود من الباطن',
  },
};

const STAGE_LABELS = {
  en: { submitted: 'Submitted', manager_review: 'Pending Manager Review', owner_review: 'Pending Owner Review' },
  ar: { submitted: 'تم التقديم', manager_review: 'بانتظار مراجعة المدير', owner_review: 'بانتظار مراجعة المالك' },
};

const STEP_TITLES = {
  en: { submitted: 'Submitted', manager_review: 'Manager Review', owner_review: 'Owner Review' },
  ar: { submitted: 'تقديم الطلب', manager_review: 'مراجعة المدير', owner_review: 'مراجعة المالك' },
};

const STATUS_LABELS = {
  en: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' },
  ar: { pending: 'معلق', approved: 'معتمد', rejected: 'مرفوض' },
};

// Module-aware field maps for the detail modal. `project_label` is computed from joined columns.
const SOURCE_FIELD_MAP = {
  expenses: [
    { k: 'category', en: 'Category', ar: 'الفئة' },
    { k: 'description', en: 'Description', ar: 'الوصف' },
    { k: 'amount', en: 'Amount', ar: 'المبلغ', type: 'currency' },
    { k: 'date', en: 'Date', ar: 'التاريخ', type: 'date' },
    { k: 'project_label', en: 'Project', ar: 'المشروع' },
    { k: 'paid_by', en: 'Paid By', ar: 'مدفوع بواسطة' },
    { k: 'status', en: 'Record Status', ar: 'حالة السجل', type: 'status' },
    { k: 'created_by_name', en: 'Created By', ar: 'أنشئ بواسطة' },
    { k: 'notes', en: 'Notes', ar: 'ملاحظات' },
  ],
  payroll: [
    { k: 'period_name', en: 'Period', ar: 'الفترة' },
    { k: 'month', en: 'Month', ar: 'الشهر' },
    { k: 'year', en: 'Year', ar: 'السنة' },
    { k: 'total_employees', en: 'Employees', ar: 'عدد الموظفين' },
    { k: 'employee_lines', en: 'Payroll Lines', ar: 'بنود الرواتب' },
    { k: 'total_basic_salary', en: 'Total Basic Salary', ar: 'إجمالي الراتب الأساسي', type: 'currency' },
    { k: 'total_net_salary', en: 'Total Net Salary', ar: 'إجمالي صافي الراتب', type: 'currency' },
    { k: 'status', en: 'Record Status', ar: 'حالة السجل', type: 'status' },
    { k: 'created_by_name', en: 'Created By', ar: 'أنشئ بواسطة' },
  ],
  legal: [
    { k: 'title', en: 'Title', ar: 'العنوان' },
    { k: 'document_type', en: 'Document Type', ar: 'نوع المستند' },
    { k: 'description', en: 'Description', ar: 'الوصف' },
    { k: 'status', en: 'Record Status', ar: 'حالة السجل', type: 'status' },
    { k: 'submitted_by', en: 'Submitted By', ar: 'قدمه' },
  ],
  project_budgets: [
    { k: 'project_label', en: 'Project', ar: 'المشروع' },
    { k: 'cost_code', en: 'Cost Code', ar: 'كود التكلفة' },
    { k: 'cost_code_name', en: 'Cost Code Name', ar: 'اسم كود التكلفة' },
    { k: 'budget_amount', en: 'Budget Amount', ar: 'مبلغ الميزانية', type: 'currency' },
    { k: 'revised_amount', en: 'Revised Amount', ar: 'المبلغ المعدل', type: 'currency' },
    { k: 'status', en: 'Record Status', ar: 'حالة السجل', type: 'status' },
  ],
  sub_contracts: [
    { k: 'contract_number', en: 'Contract Number', ar: 'رقم العقد' },
    { k: 'project_label', en: 'Project', ar: 'المشروع' },
    { k: 'subcontractor_name', en: 'Subcontractor', ar: 'مقاول الباطن' },
    { k: 'scope', en: 'Scope', ar: 'نطاق العمل' },
    { k: 'contract_value', en: 'Contract Value', ar: 'قيمة العقد', type: 'currency' },
    { k: 'start_date', en: 'Start Date', ar: 'تاريخ البداية', type: 'date' },
    { k: 'end_date', en: 'End Date', ar: 'تاريخ النهاية', type: 'date' },
    { k: 'retention_percent', en: 'Retention %', ar: 'نسبة الاحتجاز %' },
    { k: 'status', en: 'Record Status', ar: 'حالة السجل', type: 'status' },
  ],
  assets: [
    { k: 'name', en: 'Name', ar: 'الاسم' },
    { k: 'code', en: 'Code', ar: 'الكود' },
    { k: 'asset_type', en: 'Asset Type', ar: 'نوع الأصل' },
    { k: 'category', en: 'Category', ar: 'الفئة' },
    { k: 'manufacturer', en: 'Manufacturer', ar: 'الشركة المصنعة' },
    { k: 'model', en: 'Model', ar: 'الموديل' },
    { k: 'serial_number', en: 'Serial Number', ar: 'الرقم التسلسلي' },
    { k: 'purchase_date', en: 'Purchase Date', ar: 'تاريخ الشراء', type: 'date' },
    { k: 'purchase_cost', en: 'Purchase Cost', ar: 'تكلفة الشراء', type: 'currency' },
    { k: 'status', en: 'Record Status', ar: 'حالة السجل', type: 'status' },
  ],
  maintenance: [
    { k: 'title', en: 'Title', ar: 'العنوان' },
    { k: 'asset_name', en: 'Asset', ar: 'الأصل' },
    { k: 'maintenance_type', en: 'Maintenance Type', ar: 'نوع الصيانة' },
    { k: 'priority', en: 'Priority', ar: 'الأولوية' },
    { k: 'scheduled_date', en: 'Scheduled Date', ar: 'التاريخ المجدول', type: 'date' },
    { k: 'next_due_date', en: 'Next Due', ar: 'الاستحقاق التالي', type: 'date' },
    { k: 'estimated_cost', en: 'Estimated Cost', ar: 'التكلفة المقدرة', type: 'currency' },
    { k: 'status', en: 'Record Status', ar: 'حالة السجل', type: 'status' },
  ],
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${formatDate(dateStr)} ${hh}:${mm}`;
}

function statusBadgeClass(status) {
  if (status === 'approved') return 'badge-success';
  if (status === 'rejected') return 'badge-danger';
  return 'badge-warning';
}

function sourceFieldValue(field, source, locale) {
  let v;
  if (field.k === 'project_label') {
    v = source.project_name_ar || source.project_name_en || null;
    if (v && source.project_code) v = `${v} (${source.project_code})`;
    else if (!v && source.project_code) v = source.project_code;
  } else {
    v = source[field.k];
  }
  if (v === null || v === undefined || v === '') return '-';
  if (field.type === 'currency') {
    const n = Number(v);
    if (isNaN(n)) return String(v);
    return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${locale === 'ar' ? 'ج.م' : 'EGP'}`;
  }
  if (field.type === 'date') return formatDate(v);
  return String(v);
}

function Approvals() {
  const { t, locale } = useLocale();
  const user = authService.getCurrentUser();
  const canSeePending = user && PENDING_ALLOWED_ROLES.includes(user.role);
  const isOwnerAdmin = user && (user.role === 'owner' || user.role === 'admin');

  const [tab, setTab] = useState(canSeePending ? 'pending' : 'mine');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [pending, setPending] = useState([]);
  const [mine, setMine] = useState([]);
  const [audit, setAudit] = useState([]);
  const [auditFilters, setAuditFilters] = useState({ module_name: 'all', status: 'all' });
  const [detail, setDetail] = useState(null); // { id, row }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'pending') {
        const res = await fetchApi(`${API_URL}/approvals/pending`);
        if (res.success) setPending(res.requests || []);
      } else if (tab === 'mine') {
        const res = await fetchApi(`${API_URL}/approvals/my-requests?limit=200`);
        if (res.success) setMine(res.requests || []);
      } else if (tab === 'audit') {
        const params = new URLSearchParams();
        if (auditFilters.module_name !== 'all') params.append('module_name', auditFilters.module_name);
        if (auditFilters.status !== 'all') params.append('status', auditFilters.status);
        params.append('limit', '200');
        const res = await fetchApi(`${API_URL}/approvals/audit?${params}`);
        if (res.success) setAudit(res.records || []);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [tab, auditFilters]);

  useEffect(() => { load(); }, [load]);

  // Core decision submitter — throws on failure so callers can react.
  const submitDecision = async (id, action, notes) => {
    await fetchApi(`${API_URL}/approvals/${id}/${action}`, {
      method: 'PUT',
      body: JSON.stringify({ notes: notes || null }),
    });
    await load();
  };

  const handleInlineDecision = async (id, action) => {
    const notes = window.prompt(locale === 'ar' ? 'ملاحظات (اختياري):' : 'Notes (optional):');
    if (notes === null) return;
    try {
      await submitDecision(id, action, notes);
    } catch (e) { alert(e.message); }
  };

  const moduleLabel = (m) => MODULE_LABELS[locale]?.[m] || m;
  const stageLabel = (s) => STAGE_LABELS[locale]?.[s] || s;
  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;

  const tabs = [
    canSeePending && { key: 'pending', label: locale === 'ar' ? 'الموافقات المعلقة' : 'Pending Approvals', icon: Inbox },
    { key: 'mine', label: locale === 'ar' ? 'طلباتي' : 'My Requests', icon: ClipboardList },
    isOwnerAdmin && { key: 'audit', label: locale === 'ar' ? 'سجل الموافقات' : 'Audit Log', icon: History },
  ].filter(Boolean);

  const openDetail = (row) => setDetail({ id: row.id, row });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{locale === 'ar' ? 'الموافقات' : 'Approvals'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'مراجعة واعتماد الطلبات المعلقة' : 'Review and approve pending requests'}
          </p>
        </div>
      </div>

      <div className="level-line" />

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {tabs.map(tb => (
          <button
            key={tb.key}
            className={`btn ${tab === tb.key ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => setTab(tb.key)}
          >
            <tb.icon size={14} />
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'audit' && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <select className="form-select" style={{ maxWidth: '220px' }}
            value={auditFilters.module_name}
            onChange={e => setAuditFilters(f => ({ ...f, module_name: e.target.value }))}>
            <option value="all">{locale === 'ar' ? 'كل الوحدات' : 'All Modules'}</option>
            {Object.keys(MODULE_LABELS.en).map(m => <option key={m} value={m}>{moduleLabel(m)}</option>)}
          </select>
          <select className="form-select" style={{ maxWidth: '180px' }}
            value={auditFilters.status}
            onChange={e => setAuditFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="all">{locale === 'ar' ? 'كل الحالات' : 'All Statuses'}</option>
            <option value="approved">{statusLabel('approved')}</option>
            <option value="rejected">{statusLabel('rejected')}</option>
          </select>
        </div>
      )}

      {error && <div className="alert alert-danger" style={{ marginBottom: '16px' }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <EmptyState locale={locale} text={locale === 'ar' ? 'لا توجد طلبات معلقة' : 'No pending requests'} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{locale === 'ar' ? 'الوحدة' : 'Module'}</th>
                  <th>{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  <th>{locale === 'ar' ? 'مقدم الطلب' : 'Requester'}</th>
                  <th>{locale === 'ar' ? 'المرحلة' : 'Stage'}</th>
                  <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                    <td style={{ fontWeight: 500 }}>{moduleLabel(r.module_name)}</td>
                    <td>{r.request_type} #{r.request_id}</td>
                    <td>{r.requester_name || '-'}</td>
                    <td><span className="badge badge-warning">{stageLabel(r.stage)}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(r.created_at)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {r.read_only ? (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                          {locale === 'ar' ? 'للعرض فقط' : 'View only'}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-success" style={{ padding: '6px 10px' }}
                            onClick={() => handleInlineDecision(r.id, 'approve')}
                            title={locale === 'ar' ? 'اعتماد' : 'Approve'}>
                            <CheckCircle size={14} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '6px 10px' }}
                            onClick={() => handleInlineDecision(r.id, 'reject')}
                            title={locale === 'ar' ? 'رفض' : 'Reject'}>
                            <XCircle size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === 'mine' ? (
        mine.length === 0 ? (
          <EmptyState locale={locale} text={locale === 'ar' ? 'لا توجد طلبات مقدمة' : 'No requests submitted'} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{locale === 'ar' ? 'الوحدة' : 'Module'}</th>
                  <th>{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  <th>{t('common.status')}</th>
                  <th>{locale === 'ar' ? 'المدير' : 'Manager'}</th>
                  <th>{locale === 'ar' ? 'المعتمد' : 'Approver'}</th>
                  <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                </tr>
              </thead>
              <tbody>
                {mine.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                    <td style={{ fontWeight: 500 }}>{moduleLabel(r.module_name)}</td>
                    <td>{r.request_type} #{r.request_id}</td>
                    <td>
                      <span className={`badge ${statusBadgeClass(r.status)}`}>
                        {r.status === 'pending' ? stageLabel(r.stage) : statusLabel(r.status)}
                      </span>
                    </td>
                    <td>{r.manager_name || '-'}</td>
                    <td>{r.approver_name || '-'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        audit.length === 0 ? (
          <EmptyState locale={locale} text={locale === 'ar' ? 'لا توجد سجلات' : 'No records found'} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{locale === 'ar' ? 'الوحدة' : 'Module'}</th>
                  <th>{locale === 'ar' ? 'النوع' : 'Type'}</th>
                  <th>{locale === 'ar' ? 'مقدم الطلب' : 'Requester'}</th>
                  <th>{t('common.status')}</th>
                  <th>{locale === 'ar' ? 'المدير' : 'Manager'}</th>
                  <th>{locale === 'ar' ? 'المعتمد' : 'Approver'}</th>
                  <th>{locale === 'ar' ? 'آخر تحديث' : 'Updated'}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                    <td style={{ fontWeight: 500 }}>{moduleLabel(r.module_name)}</td>
                    <td>{r.request_type} #{r.request_id}</td>
                    <td>{r.requester_name || '-'}</td>
                    <td><span className={`badge ${statusBadgeClass(r.status)}`}>{statusLabel(r.status)}</span></td>
                    <td>{r.manager_name || '-'}</td>
                    <td>{r.approver_name || '-'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {detail && (
        <ApprovalDetailModal
          detail={detail}
          tab={tab}
          locale={locale}
          t={t}
          moduleLabel={moduleLabel}
          statusLabel={statusLabel}
          onClose={() => setDetail(null)}
          onDecision={submitDecision}
        />
      )}
    </div>
  );
}

function TimelineStep({ step, locale }) {
  const title = STEP_TITLES[locale]?.[step.stage] || step.stage;
  const stateMeta = {
    done: { color: 'var(--color-success, #16a34a)', Icon: CheckCircle, label: locale === 'ar' ? 'تم' : 'Done' },
    rejected: { color: 'var(--color-danger, #dc2626)', Icon: XCircle, label: locale === 'ar' ? 'مرفوض' : 'Rejected' },
    current: { color: 'var(--color-warning, #d97706)', Icon: Clock, label: locale === 'ar' ? 'قيد الانتظار' : 'Awaiting' },
    upcoming: { color: 'var(--color-text-secondary)', Icon: Circle, label: locale === 'ar' ? 'لاحقاً' : 'Upcoming' },
  }[step.state] || {};
  const Icon = stateMeta.Icon || Circle;
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
      <Icon size={18} style={{ color: stateMeta.color, flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '13px' }}>{title}</strong>
          <span style={{ fontSize: '12px', color: stateMeta.color }}>{stateMeta.label}</span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
          {step.actor_name ? step.actor_name : (step.state === 'current' ? (locale === 'ar' ? '—' : '—') : '')}
          {step.actor_role ? ` · ${step.actor_role}` : ''}
          {step.at ? `  ·  ${formatDateTime(step.at)}` : ''}
        </div>
        {step.notes ? (
          <div style={{ fontSize: '12px', marginTop: '4px', fontStyle: 'italic' }}>
            “{step.notes}”
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ApprovalDetailModal({ detail, tab, locale, t, moduleLabel, statusLabel, onClose, onDecision }) {
  const { id, row } = detail;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [notes, setNotes] = useState('');
  const [acting, setActing] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    fetchApi(`${API_URL}/approvals/${id}/details`)
      .then(res => { if (alive && res.success) setData(res); })
      .catch(e => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const req = data?.request || row || {};
  const source = data?.source || null;
  const moduleName = req.module_name || row?.module_name;
  const canAct = tab === 'pending' && row && !row.read_only && req.status === 'pending';

  const fields = SOURCE_FIELD_MAP[moduleName];
  const genericEntries = (!fields && source)
    ? Object.entries(source).filter(([k, v]) =>
        v !== null && v !== '' && typeof v !== 'object' &&
        k !== 'id' && !k.endsWith('_id') && k !== 'created_at' && k !== 'updated_at')
    : [];

  const act = async (action) => {
    setActing(action);
    setErr('');
    try {
      await onDecision(id, action, notes);
      onClose();
    } catch (e) {
      setErr(e.message);
      setActing('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '100%' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {moduleLabel(moduleName)} — {req.request_type} #{req.request_id}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>
          ) : (
            <>
              {err && <div className="alert alert-danger" style={{ marginBottom: '14px' }}>{err}</div>}

              {/* Summary */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                <span className={`badge ${statusBadgeClass(req.status)}`}>
                  {req.status === 'pending'
                    ? (STAGE_LABELS[locale]?.[req.stage] || req.stage)
                    : statusLabel(req.status)}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {locale === 'ar' ? 'مقدم الطلب:' : 'Requester:'} {req.requester_name || '-'}
                  {req.requester_email ? ` (${req.requester_email})` : ''}
                </span>
              </div>

              {req.notes && (
                <div style={{ fontSize: '13px', marginBottom: '16px' }}>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                    {locale === 'ar' ? 'ملاحظة الطلب' : 'Request note'}
                  </div>
                  {req.notes}
                </div>
              )}

              {/* Timeline */}
              <h4 style={{ fontSize: '13px', margin: '0 0 4px', color: 'var(--color-text-secondary)' }}>
                {locale === 'ar' ? 'مسار الاعتماد' : 'Approval timeline'}
              </h4>
              <div style={{ marginBottom: '18px' }}>
                {(data?.timeline || []).map((step, i) => (
                  <TimelineStep key={i} step={step} locale={locale} />
                ))}
              </div>

              {/* Source record details */}
              <h4 style={{ fontSize: '13px', margin: '0 0 8px', color: 'var(--color-text-secondary)' }}>
                {locale === 'ar' ? 'تفاصيل الطلب' : 'Request details'}
              </h4>
              {!source ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {locale === 'ar'
                    ? 'تعذّر العثور على السجل الأصلي لهذا النوع من الطلبات.'
                    : 'The underlying record could not be loaded for this request type.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 40%) 1fr', gap: '6px 12px', fontSize: '13px' }}>
                  {fields
                    ? fields.map(f => (
                        <React.Fragment key={f.k}>
                          <div style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? f.ar : f.en}</div>
                          <div style={{ wordBreak: 'break-word' }}>{sourceFieldValue(f, source, locale)}</div>
                        </React.Fragment>
                      ))
                    : genericEntries.map(([k, v]) => (
                        <React.Fragment key={k}>
                          <div style={{ color: 'var(--color-text-secondary)' }}>{k}</div>
                          <div style={{ wordBreak: 'break-word' }}>{String(v)}</div>
                        </React.Fragment>
                      ))}
                </div>
              )}

              {canAct && (
                <div style={{ marginTop: '18px' }}>
                  <label className="form-label" style={{ fontSize: '12px' }}>
                    {locale === 'ar' ? 'ملاحظات القرار (اختياري)' : 'Decision notes (optional)'}
                  </label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={locale === 'ar' ? 'سبب الاعتماد أو الرفض…' : 'Reason for approval or rejection…'}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.close') || (locale === 'ar' ? 'إغلاق' : 'Close')}</button>
          {canAct && !loading && (
            <>
              <button className="btn btn-danger" disabled={!!acting} onClick={() => act('reject')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {acting === 'reject' ? <span className="spinner" /> : <XCircle size={14} />}
                {locale === 'ar' ? 'رفض' : 'Reject'}
              </button>
              <button className="btn btn-success" disabled={!!acting} onClick={() => act('approve')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {acting === 'approve' ? <span className="spinner" /> : <CheckCircle size={14} />}
                {locale === 'ar' ? 'اعتماد' : 'Approve'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ locale, text }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
      <ClipboardList size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
      <p style={{ color: 'var(--color-text-secondary)' }}>{text}</p>
    </div>
  );
}

export default Approvals;
