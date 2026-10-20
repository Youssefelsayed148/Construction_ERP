import { formatDateTime as sharedDateTime, formatDate as sharedDate } from '../utils/formatters';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { formatCurrency, localizedName } from '../utils/formatters';
import { useLocale } from '../hooks/useLocale';
import { errorMessage } from '../utils/errorMessage';
import TextEntryDialog from '../components/common/TextEntryDialog';
import { authService } from '../services/api';
import LoadMore from '../components/common/LoadMore';
import { ClipboardList, CheckCircle, XCircle, History, Inbox, Clock, Circle } from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
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

// request_type is free-form text set by the module that raised the request.
const REQUEST_TYPE_LABELS = {
  en: {
    expense: 'Expense', payroll: 'Payroll', payroll_period: 'Payroll Period', legal_document: 'Legal Document',
    purchase_order: 'Purchase Order', grn: 'Goods Receipt', budget: 'Budget', project_budget: 'Budget',
    sub_contract: 'Sub-Contract', asset: 'Asset', maintenance: 'Maintenance',
  },
  ar: {
    expense: 'مصروف', payroll: 'رواتب', payroll_period: 'فترة رواتب', legal_document: 'مستند قانوني',
    purchase_order: 'أمر شراء', grn: 'إشعار استلام', budget: 'ميزانية', project_budget: 'ميزانية',
    sub_contract: 'عقد من الباطن', asset: 'أصل', maintenance: 'صيانة',
  },
};

// Expense categories — mirror of frontend/src/pages/Expenses.js CATEGORY_LABELS.
const EXPENSE_CATEGORY_LABELS = {
  en: {
    materials: 'Materials', labor: 'Labor', equipment: 'Equipment', fuel: 'Fuel',
    maintenance: 'Maintenance', transport: 'Transport', utilities: 'Utilities',
    rent: 'Rent', office: 'Office', legal: 'Legal', insurance: 'Insurance', other: 'Other',
  },
  ar: {
    materials: 'مواد', labor: 'عمالة', equipment: 'معدات', fuel: 'وقود',
    maintenance: 'صيانة', transport: 'نقل', utilities: 'مرافق',
    rent: 'إيجار', office: 'مكتب', legal: 'قانوني', insurance: 'تأمين', other: 'أخرى',
  },
};

const ROLE_LABELS = {
  en: {
    owner: 'Owner', admin: 'Admin', finance_manager: 'Finance Manager', purchasing_mgr: 'Purchasing Manager',
    project_manager: 'Project Manager', legal_mgr: 'Legal Manager', maintenance_mgr: 'Maintenance Manager',
  },
  ar: {
    owner: 'المالك', admin: 'مدير النظام', finance_manager: 'المدير المالي', purchasing_mgr: 'مدير المشتريات',
    project_manager: 'مدير المشروع', legal_mgr: 'المدير القانوني', maintenance_mgr: 'مدير الصيانة',
  },
};

const RECORD_STATUS_LABELS = {
  en: {
    pending: 'Pending', approved: 'Approved', rejected: 'Rejected', verified: 'Verified',
    active: 'Active', draft: 'Draft', terminated: 'Terminated', paid: 'Paid', posted: 'Posted',
  },
  ar: {
    pending: 'معلق', approved: 'معتمد', rejected: 'مرفوض', verified: 'مُوثّق',
    active: 'نشط', draft: 'مسودة', terminated: 'منتهٍ', paid: 'مدفوع', posted: 'مُرحّل',
  },
};

const STATUS_LABELS = {
  en: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' },
  ar: { pending: 'معلق', approved: 'معتمد', rejected: 'مرفوض' },
};

// Module-aware field maps for the detail modal. `project_label` is computed from joined columns.
const SOURCE_FIELD_MAP = {
  expenses: [
    { k: 'category', label_en: 'Category', label_ar: 'الفئة' },
    { k: 'description', label_en: 'Description', label_ar: 'الوصف' },
    { k: 'amount', label_en: 'Amount', label_ar: 'المبلغ', type: 'currency' },
    { k: 'date', label_en: 'Date', label_ar: 'التاريخ', type: 'date' },
    { k: 'project_label', label_en: 'Project', label_ar: 'المشروع' },
    { k: 'paid_by', label_en: 'Paid By', label_ar: 'مدفوع بواسطة' },
    { k: 'status', label_en: 'Record Status', label_ar: 'حالة السجل', type: 'status' },
    { k: 'created_by_name', label_en: 'Created By', label_ar: 'أنشئ بواسطة' },
    { k: 'notes', label_en: 'Notes', label_ar: 'ملاحظات' },
  ],
  payroll: [
    { k: 'period_name', label_en: 'Period', label_ar: 'الفترة' },
    { k: 'month', label_en: 'Month', label_ar: 'الشهر' },
    { k: 'year', label_en: 'Year', label_ar: 'السنة' },
    { k: 'total_employees', label_en: 'Employees', label_ar: 'عدد الموظفين' },
    { k: 'employee_lines', label_en: 'Payroll Lines', label_ar: 'بنود الرواتب' },
    { k: 'total_basic_salary', label_en: 'Total Basic Salary', label_ar: 'إجمالي الراتب الأساسي', type: 'currency' },
    { k: 'total_net_salary', label_en: 'Total Net Salary', label_ar: 'إجمالي صافي الراتب', type: 'currency' },
    { k: 'status', label_en: 'Record Status', label_ar: 'حالة السجل', type: 'status' },
    { k: 'created_by_name', label_en: 'Created By', label_ar: 'أنشئ بواسطة' },
  ],
  legal: [
    { k: 'title', label_en: 'Title', label_ar: 'العنوان' },
    { k: 'document_type', label_en: 'Document Type', label_ar: 'نوع المستند' },
    { k: 'description', label_en: 'Description', label_ar: 'الوصف' },
    { k: 'status', label_en: 'Record Status', label_ar: 'حالة السجل', type: 'status' },
    { k: 'submitted_by', label_en: 'Submitted By', label_ar: 'قدمه' },
  ],
  project_budgets: [
    { k: 'project_label', label_en: 'Project', label_ar: 'المشروع' },
    { k: 'cost_code', label_en: 'Cost Code', label_ar: 'كود التكلفة' },
    { k: 'cost_code_name', label_en: 'Cost Code Name', label_ar: 'اسم كود التكلفة' },
    { k: 'budget_amount', label_en: 'Budget Amount', label_ar: 'مبلغ الميزانية', type: 'currency' },
    { k: 'revised_amount', label_en: 'Revised Amount', label_ar: 'المبلغ المعدل', type: 'currency' },
    { k: 'status', label_en: 'Record Status', label_ar: 'حالة السجل', type: 'status' },
  ],
  sub_contracts: [
    { k: 'contract_number', label_en: 'Contract Number', label_ar: 'رقم العقد' },
    { k: 'project_label', label_en: 'Project', label_ar: 'المشروع' },
    { k: 'subcontractor_name', label_en: 'Subcontractor', label_ar: 'مقاول الباطن' },
    { k: 'scope', label_en: 'Scope', label_ar: 'نطاق العمل' },
    { k: 'contract_value', label_en: 'Contract Value', label_ar: 'قيمة العقد', type: 'currency' },
    { k: 'start_date', label_en: 'Start Date', label_ar: 'تاريخ البداية', type: 'date' },
    { k: 'end_date', label_en: 'End Date', label_ar: 'تاريخ النهاية', type: 'date' },
    { k: 'retention_percent', label_en: 'Retention %', label_ar: 'نسبة الاحتجاز %' },
    { k: 'status', label_en: 'Record Status', label_ar: 'حالة السجل', type: 'status' },
  ],
  assets: [
    { k: 'name', label_en: 'Name', label_ar: 'الاسم' },
    { k: 'code', label_en: 'Code', label_ar: 'الكود' },
    { k: 'asset_type', label_en: 'Asset Type', label_ar: 'نوع الأصل' },
    { k: 'category', label_en: 'Category', label_ar: 'الفئة' },
    { k: 'manufacturer', label_en: 'Manufacturer', label_ar: 'الشركة المصنعة' },
    { k: 'model', label_en: 'Model', label_ar: 'الموديل' },
    { k: 'serial_number', label_en: 'Serial Number', label_ar: 'الرقم التسلسلي' },
    { k: 'purchase_date', label_en: 'Purchase Date', label_ar: 'تاريخ الشراء', type: 'date' },
    { k: 'purchase_cost', label_en: 'Purchase Cost', label_ar: 'تكلفة الشراء', type: 'currency' },
    { k: 'status', label_en: 'Record Status', label_ar: 'حالة السجل', type: 'status' },
  ],
  maintenance: [
    { k: 'title', label_en: 'Title', label_ar: 'العنوان' },
    { k: 'asset_name', label_en: 'Asset', label_ar: 'الأصل' },
    { k: 'maintenance_type', label_en: 'Maintenance Type', label_ar: 'نوع الصيانة' },
    { k: 'priority', label_en: 'Priority', label_ar: 'الأولوية' },
    { k: 'scheduled_date', label_en: 'Scheduled Date', label_ar: 'التاريخ المجدول', type: 'date' },
    { k: 'next_due_date', label_en: 'Next Due', label_ar: 'الاستحقاق التالي', type: 'date' },
    { k: 'estimated_cost', label_en: 'Estimated Cost', label_ar: 'التكلفة المقدرة', type: 'currency' },
    { k: 'status', label_en: 'Record Status', label_ar: 'حالة السجل', type: 'status' },
  ],
};

const formatDate = sharedDate;

const formatDateTime = sharedDateTime;

function statusBadgeClass(status) {
  if (status === 'approved') return 'badge-success';
  if (status === 'rejected') return 'badge-danger';
  return 'badge-warning';
}

function formatMoney(v, locale) {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || isNaN(n)) return null;
  return formatCurrency(n, 'EGP', locale);
}

const requestTypeLabel = (type, locale) => REQUEST_TYPE_LABELS[locale]?.[type] || type;

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
  if (field.type === 'currency') return formatMoney(v, locale) || String(v);
  if (field.type === 'date') return formatDate(v);
  if (field.type === 'status') return RECORD_STATUS_LABELS[locale]?.[v] || v;
  if (field.k === 'category') return EXPENSE_CATEGORY_LABELS[locale]?.[v] || v;
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
  const pendingLength = useRef(0); pendingLength.current = pending.length;
  const [mine, setMine] = useState([]);
  const mineLength = useRef(0); mineLength.current = mine.length;
  const [audit, setAudit] = useState([]);
  const auditLength = useRef(0); auditLength.current = audit.length;
  const [totalCounts, setTotalCounts] = useState({ pending: null, mine: null, audit: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [auditFilters, setAuditFilters] = useState({ module_name: 'all', status: 'all' });
  const [detail, setDetail] = useState(null); // { id, row }
  const [inlineDecision, setInlineDecision] = useState(null);

  const load = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      if (tab === 'pending') {
        const res = await fetchApi(`${API_URL}/approvals/pending?limit=200&offset=${append ? pendingLength.current : 0}`);
        if (res.success) { setPending(current => append ? [...current, ...(res.requests || [])] : (res.requests || [])); setTotalCounts(current => ({ ...current, pending: res.totalCount ?? null })); }
      } else if (tab === 'mine') {
        const res = await fetchApi(`${API_URL}/approvals/my-requests?limit=200&offset=${append ? mineLength.current : 0}`);
        if (res.success) { setMine(current => append ? [...current, ...(res.requests || [])] : (res.requests || [])); setTotalCounts(current => ({ ...current, mine: res.totalCount ?? null })); }
      } else if (tab === 'audit') {
        const params = new URLSearchParams();
        if (auditFilters.module_name !== 'all') params.append('module_name', auditFilters.module_name);
        if (auditFilters.status !== 'all') params.append('status', auditFilters.status);
        params.append('limit', '200');
        params.append('offset', String(append ? auditLength.current : 0));
        const res = await fetchApi(`${API_URL}/approvals/audit?${params}`);
        if (res.success) { setAudit(current => append ? [...current, ...(res.records || [])] : (res.records || [])); setTotalCounts(current => ({ ...current, audit: res.totalCount ?? null })); }
      }
    } catch (e) { setError(e); }
    finally { setLoading(false); setLoadingMore(false); }
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

  const handleInlineDecision = (id, action) => setInlineDecision({ id, action });

  const confirmInlineDecision = async (notes) => {
    await submitDecision(inlineDecision.id, inlineDecision.action, notes);
    setInlineDecision(null);
  };

  const moduleLabel = (m) => MODULE_LABELS[locale]?.[m] || m;
  const stageLabel = (s) => STAGE_LABELS[locale]?.[s] || s;
  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;

  const tabs = [
    canSeePending && { key: 'pending', label: t('approvals.system.pendingApprovals'), icon: Inbox },
    { key: 'mine', label: t('approvals.system.myRequests'), icon: ClipboardList },
    isOwnerAdmin && { key: 'audit', label: t('approvals.system.auditLog'), icon: History },
  ].filter(Boolean);

  const openDetail = (row) => setDetail({ id: row.id, row });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('approvals.title')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('approvals.system.reviewAndApprovePendingRequests')}
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
            <option value="all">{t('approvals.system.allModules')}</option>
            {Object.keys(MODULE_LABELS.en).map(m => <option key={m} value={m}>{moduleLabel(m)}</option>)}
          </select>
          <select className="form-select" style={{ maxWidth: '180px' }}
            value={auditFilters.status}
            onChange={e => setAuditFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="all">{t('approvals.system.allStatuses')}</option>
            <option value="approved">{statusLabel('approved')}</option>
            <option value="rejected">{statusLabel('rejected')}</option>
          </select>
        </div>
      )}

      {error && <div className="alert alert-danger" style={{ marginBottom: '16px' }}>{errorMessage(error, t)}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <EmptyState locale={locale} text={t('approvals.system.noPendingRequests')} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('approvals.system.module')}</th>
                  <th>{t('approvals.system.type')}</th>
                  <th>{t('approvals.system.requester')}</th>
                  <th>{t('approvals.system.stage')}</th>
                  <th>{t('approvals.system.date')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                    <td style={{ fontWeight: 500 }}>{moduleLabel(r.module_name)}</td>
                    <td><RequestTypeCell r={r} locale={locale} t={t} /></td>
                    <td>{r.requester_name || '-'}</td>
                    <td><span className="badge badge-warning">{stageLabel(r.stage)}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(r.created_at)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {r.read_only ? (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                          {t('approvals.system.viewOnly')}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-success" style={{ padding: '6px 10px' }}
                            onClick={() => handleInlineDecision(r.id, 'approve')}
                            title={t('approvals.system.approve')}>
                            <CheckCircle size={14} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '6px 10px' }}
                            onClick={() => handleInlineDecision(r.id, 'reject')}
                            title={t('approvals.system.reject')}>
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
          <EmptyState locale={locale} text={t('approvals.system.noRequestsSubmitted')} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('approvals.system.module')}</th>
                  <th>{t('approvals.system.type')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('approvals.system.manager')}</th>
                  <th>{t('approvals.system.approver')}</th>
                  <th>{t('approvals.system.date')}</th>
                </tr>
              </thead>
              <tbody>
                {mine.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                    <td style={{ fontWeight: 500 }}>{moduleLabel(r.module_name)}</td>
                    <td><RequestTypeCell r={r} locale={locale} t={t} /></td>
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
          <EmptyState locale={locale} text={t('approvals.system.noRecordsFound')} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('approvals.system.module')}</th>
                  <th>{t('approvals.system.type')}</th>
                  <th>{t('approvals.system.requester')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('approvals.system.manager')}</th>
                  <th>{t('approvals.system.approver')}</th>
                  <th>{t('approvals.system.updated')}</th>
                </tr>
              </thead>
              <tbody>
                {audit.map(r => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                    <td style={{ fontWeight: 500 }}>{moduleLabel(r.module_name)}</td>
                    <td><RequestTypeCell r={r} locale={locale} t={t} /></td>
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

      <LoadMore
        loadedCount={tab === 'pending' ? pending.length : tab === 'mine' ? mine.length : audit.length}
        totalCount={totalCounts[tab]}
        loading={loadingMore}
        t={t}
        onLoadMore={() => load({ append: true })}
      />
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
      <TextEntryDialog open={Boolean(inlineDecision)} title={t('common.dialogs.approvalNotesTitle')} label={t('common.dialogs.approvalNotesLabel')} required={false} onSubmit={confirmInlineDecision} onCancel={() => setInlineDecision(null)} />
    </div>
  );
}

function TimelineStep({ step, locale, t }) {
  const title = STEP_TITLES[locale]?.[step.stage] || step.stage;
  const stateMeta = {
    done: { color: 'var(--color-success, #16a34a)', Icon: CheckCircle, label: t('approvals.system.done') },
    rejected: { color: 'var(--color-danger, #dc2626)', Icon: XCircle, label: t('approvals.system.rejected') },
    current: { color: 'var(--color-warning, #d97706)', Icon: Clock, label: t('approvals.system.awaiting') },
    upcoming: { color: 'var(--color-text-secondary)', Icon: Circle, label: t('approvals.system.upcoming') },
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
          {step.actor_name ? step.actor_name : (step.state === 'current' ? '—' : '')}
          {step.actor_role ? ` · ${ROLE_LABELS[locale]?.[step.actor_role] || step.actor_role}` : ''}
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
            {moduleLabel(moduleName)} — {requestTypeLabel(req.request_type, locale)} #{req.request_id}
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
                  {t('approvals.system.requester2')} {req.requester_name || '-'}
                  {req.requester_email ? ` (${req.requester_email})` : ''}
                </span>
              </div>

              {req.notes && (
                <div style={{ fontSize: '13px', marginBottom: '16px' }}>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                    {t('approvals.system.requestNote')}
                  </div>
                  {req.notes}
                </div>
              )}

              {/* Timeline */}
              <h4 style={{ fontSize: '13px', margin: '0 0 4px', color: 'var(--color-text-secondary)' }}>
                {t('approvals.system.approvalTimeline')}
              </h4>
              <div style={{ marginBottom: '18px' }}>
                {(data?.timeline || []).map((step, i) => (
                  <TimelineStep key={i} step={step} locale={locale} t={t} />
                ))}
              </div>

              {/* Source record details */}
              <h4 style={{ fontSize: '13px', margin: '0 0 8px', color: 'var(--color-text-secondary)' }}>
                {t('approvals.system.requestDetails')}
              </h4>
              {!source ? (
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  {t('approvals.system.theUnderlyingRecordCouldNotBeLoadedForThisRequest')}
                </div>
              ) : (
                <div className="responsive-grid responsive-grid--two-minmax" style={{ gap: '6px 12px', fontSize: '13px' }}>
                  {fields
                    ? fields.map(f => (
                        <React.Fragment key={f.k}>
                          <div style={{ color: 'var(--color-text-secondary)' }}>{localizedName(f, locale, ['label'])}</div>
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
                    {t('approvals.system.decisionNotesOptional')}
                  </label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={t('approvals.system.reasonForApprovalOrRejection')}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>{t('common.close') || (t('approvals.system.close'))}</button>
          {canAct && !loading && (
            <>
              <button className="btn btn-danger" disabled={!!acting} onClick={() => act('reject')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {acting === 'reject' ? <span className="spinner" /> : <XCircle size={14} />}
                {t('approvals.system.reject')}
              </button>
              <button className="btn btn-success" disabled={!!acting} onClick={() => act('approve')}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {acting === 'approve' ? <span className="spinner" /> : <CheckCircle size={14} />}
                {t('approvals.system.approve')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestTypeCell({ r, locale, t }) {
  const typeLabel = requestTypeLabel(r.request_type, locale);
  const ref = `${typeLabel} #${r.request_id}`;
  const s = r.summary;

  // Known module whose source record was deleted.
  if (s && s.missing) {
    return (
      <div>
        <div>{ref}</div>
        <div style={{ fontSize: '11px', color: 'var(--color-danger, #dc2626)' }}>
          {t('approvals.system.sourceRecordDeleted')}
        </div>
      </div>
    );
  }

  // Module with no summary mapping — just the localized pointer.
  if (!s) return <span>{ref}</span>;

  const parts = [];
  const money = formatMoney(s.amount, locale);
  if (money) parts.push(money);
  if (s.category) parts.push(EXPENSE_CATEGORY_LABELS[locale]?.[s.category] || s.category);
  if (s.text) parts.push(s.text);

  return (
    <div>
      <div style={{ fontWeight: 500 }}>{parts.length ? parts.join(' · ') : ref}</div>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', fontFamily: 'monospace', direction: 'ltr' }}>{ref}</div>
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
