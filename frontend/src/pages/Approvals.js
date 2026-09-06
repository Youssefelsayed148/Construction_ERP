import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { authService } from '../services/api';
import { ClipboardList, CheckCircle, XCircle, History, Inbox } from 'lucide-react';

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
  en: { manager_review: 'Pending Manager Review', owner_review: 'Pending Owner Review' },
  ar: { manager_review: 'بانتظار مراجعة المدير', owner_review: 'بانتظار مراجعة المالك' },
};

const STATUS_LABELS = {
  en: { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' },
  ar: { pending: 'معلق', approved: 'معتمد', rejected: 'مرفوض' },
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}/${d.getFullYear()}`;
}

function statusBadgeClass(status) {
  if (status === 'approved') return 'badge-success';
  if (status === 'rejected') return 'badge-danger';
  return 'badge-warning';
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

  const handleDecision = async (id, action) => {
    const notes = window.prompt(locale === 'ar' ? 'ملاحظات (اختياري):' : 'Notes (optional):');
    if (notes === null) return;
    try {
      await fetchApi(`${API_URL}/approvals/${id}/${action}`, {
        method: 'PUT',
        body: JSON.stringify({ notes }),
      });
      load();
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
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{moduleLabel(r.module_name)}</td>
                    <td>{r.request_type} #{r.request_id}</td>
                    <td>{r.requester_name || '-'}</td>
                    <td><span className="badge badge-warning">{stageLabel(r.stage)}</span></td>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(r.created_at)}</td>
                    <td>
                      {r.read_only ? (
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                          {locale === 'ar' ? 'للعرض فقط' : 'View only'}
                        </span>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button className="btn btn-success" style={{ padding: '6px 10px' }}
                            onClick={() => handleDecision(r.id, 'approve')}
                            title={locale === 'ar' ? 'اعتماد' : 'Approve'}>
                            <CheckCircle size={14} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '6px 10px' }}
                            onClick={() => handleDecision(r.id, 'reject')}
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
                  <tr key={r.id}>
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
                  <tr key={r.id}>
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
