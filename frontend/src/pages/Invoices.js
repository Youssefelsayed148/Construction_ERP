import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from '../hooks/useLocale';
import ReasonDialog from '../components/common/ReasonDialog';
import LoadMore from '../components/common/LoadMore';
import { Search, Plus, Edit, Trash2, FileText, Receipt, Eye, X, CreditCard } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';

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
  en: { all: 'All', draft: 'Draft', sent: 'Sent', partially_paid: 'Partially Paid', paid: 'Paid', overdue: 'Overdue', void: 'Void' },
  ar: { all: 'الكل', draft: 'مسودة', sent: 'مرسلة', partially_paid: 'مدفوعة جزئياً', paid: 'مدفوعة بالكامل', overdue: 'متأخرة', void: 'ملغاة' }
};

const STATUS_BADGE = {
  draft: 'badge-info', sent: 'badge-warning', partially_paid: 'badge-warning', paid: 'badge-success', overdue: 'badge-danger', void: 'badge-danger'
};

const PAYMENT_METHOD_LABELS = {
  en: { cash: 'Cash', bank_transfer: 'Bank Transfer', check: 'Check', other: 'Other' },
  ar: { cash: 'نقدي', bank_transfer: 'تحويل بنكي', check: 'شيك', other: 'أخرى' }
};

const PAYMENT_METHODS = ['cash', 'bank_transfer', 'check', 'other'];
const ALL_STATUSES = ['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void'];

function Invoices() {
  const { t, locale } = useLocale();
  const [invoices, setInvoices] = useState([]);
  const invoicesLength = useRef(0);
  invoicesLength.current = invoices.length;
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [voidTarget, setVoidTarget] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/projects?limit=200`);
      if (res.success) setProjects(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/clients?limit=200`);
      if (res.success) setClients(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/finance/summary`);
      if (res.success) setSummary(res.data || {});
    } catch (e) { console.error(e); }
  }, []);

  const loadInvoices = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      params.append('offset', String(append ? invoicesLength.current : 0));
      const res = await fetchApi(`${API_URL}/invoices?${params}`);
      if (res.success) {
        setInvoices(current => append ? [...current, ...(res.data || [])] : (res.data || []));
        setTotalCount(res.totalCount ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [statusFilter, searchQuery]);

  useEffect(() => { loadInvoices(); loadSummary(); }, [loadInvoices, loadSummary]);

  // Void with a reason, never delete: the invoice stays in the register with status void.
  const confirmVoid = async (reason) => {
    setBusy(true); setDialogError('');
    try {
      await fetchApi(`${API_URL}/invoices/${voidTarget.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      setVoidTarget(null);
      loadInvoices();
      loadSummary();
    } catch (e) { setDialogError(e.message); }
    finally { setBusy(false); }
  };

  const openDetail = async (inv) => {
    try {
      const res = await fetchApi(`${API_URL}/invoices/${inv.id}`);
      if (res.success) setShowDetailModal(res.data || res);
    } catch (e) { alert(e.message); }
  };

  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;

  const totalCollected = summary?.total_revenue_collected || 0;
  const totalOutstanding = summary?.total_outstanding || 0;
  const overdueCount = summary?.overdue_count || 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('finance.system.invoicesPayments')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('finance.system.invoiceManagementCollections')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { loadProjects(); loadClients(); setEditingInvoice(null); setShowAddModal(true); }}>
          <Plus size={16} />
          {t('finance.system.addInvoice')}
        </button>
      </div>

      <div className="level-line" />

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {formatCurrency(totalCollected)}
          </div>
          <div className="stat-label">{t('finance.system.totalCollected')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>
            {formatCurrency(totalOutstanding)}
          </div>
          <div className="stat-label">{t('finance.system.totalOutstanding')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: overdueCount > 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
            {overdueCount}
          </div>
          <div className="stat-label">{t('finance.system.overdueCount')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${!statusFilter ? 'btn-primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setStatusFilter('')}
        >
          {statusLabel('all')}
        </button>
        {ALL_STATUSES.map(s => (
          <button
            key={s}
            className={`btn ${statusFilter === s ? 'btn-primary' : ''}`}
            style={{ padding: '6px 16px', fontSize: '13px' }}
            onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
          >
            {statusLabel(s)}
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
            placeholder={t('finance.system.searchInvoices')}
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
      ) : invoices.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <FileText size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('finance.system.noInvoicesAddYourFirstInvoice')}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('finance.system.invoice')}</th>
                <th>{t('finance.system.project')}</th>
                <th>{t('finance.workbench.client')}</th>
                <th>{t('finance.workbench.amount')}</th>
                <th>{t('finance.system.paid')}</th>
                <th>{t('finance.system.remaining')}</th>
                <th>{t('common.status')}</th>
                <th>{t('finance.system.date')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const paid = parseFloat(inv.total_paid) || 0;
                const remaining = parseFloat(inv.amount) - paid;
                return (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontWeight: 600 }}>
                      {inv.invoice_number}
                    </td>
                    <td style={{ fontSize: '13px' }}>
                      {locale === 'ar' ? (inv.project_name_ar || inv.project_code) : (inv.project_name_en || inv.project_code)}
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      {locale === 'ar' ? (inv.client_name_ar || inv.client_code) : (inv.client_name_en || inv.client_code)}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                      {formatCurrency(inv.amount)}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--color-success)' }}>
                      {formatCurrency(paid)}
                    </td>
                    <td style={{ fontFamily: 'monospace', color: remaining > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                      {formatCurrency(remaining)}
                    </td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[inv.status] || 'badge-info'}`}>
                        {statusLabel(inv.status)}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(inv.issue_date)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn" style={{ padding: '6px 10px' }} title={t('finance.system.viewDetails')} onClick={() => openDetail(inv)}>
                          <Eye size={14} />
                        </button>
                        <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingInvoice(inv); loadProjects(); loadClients(); setShowAddModal(true); }}>
                          <Edit size={14} />
                        </button>
                        {paid === 0 && inv.status !== 'void' && (
                          <button className="btn btn-danger" style={{ padding: '6px 10px' }} title={t('finance.void.action')} aria-label={t('finance.void.action')} onClick={() => { setDialogError(''); setVoidTarget(inv); }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <LoadMore loadedCount={invoices.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => loadInvoices({ append: true })} />
      {showAddModal && (
        <InvoiceModal
          invoice={editingInvoice}
          locale={locale}
          t={t}
          projects={projects}
          clients={clients}
          onClose={() => { setShowAddModal(false); setEditingInvoice(null); }}
          onSave={() => { loadInvoices(); loadSummary(); setShowAddModal(false); setEditingInvoice(null); }}
        />
      )}

      <ReasonDialog
        open={Boolean(voidTarget)}
        title={t('finance.void.invoiceTitle')}
        message={voidTarget ? t('finance.void.invoiceMessage', { number: voidTarget.invoice_number }) : ''}
        confirmLabel={t('finance.void.confirm')}
        reasonRequired
        busy={busy}
        error={dialogError}
        onConfirm={confirmVoid}
        onCancel={() => setVoidTarget(null)}
      />

      {showDetailModal && (
        <InvoiceDetailModal
          invoice={showDetailModal}
          locale={locale}
          t={t}
          onClose={() => { setShowDetailModal(null); loadInvoices(); loadSummary(); }}
          onPaymentSaved={() => { loadInvoices(); loadSummary(); }}
        />
      )}
    </div>
  );
}

function InvoiceModal({ invoice, locale, t, projects, clients, onClose, onSave }) {
  const isEdit = !!invoice;
  const [form, setForm] = useState({
    project_id: invoice?.project_id || '',
    client_id: invoice?.client_id || '',
    amount: invoice?.amount || '',
    issue_date: invoice?.issue_date ? invoice.issue_date.split('T')[0] : new Date().toISOString().split('T')[0],
    due_date: invoice?.due_date ? invoice.due_date.split('T')[0] : '',
    description: invoice?.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (field === 'project_id' && value) {
        const selectedProject = projects.find(p => p.id === Number(value));
        if (selectedProject && selectedProject.client_id) {
          next.client_id = selectedProject.client_id;
        }
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.project_id) { setError(t('finance.system.projectIsRequired')); return; }
    if (!form.client_id) { setError(t('finance.system.clientIsRequired')); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        project_id: Number(form.project_id),
        client_id: Number(form.client_id),
        amount: Number(form.amount),
        issue_date: form.issue_date,
        due_date: form.due_date || null,
        description: form.description,
      };
      const url = isEdit ? `${API_URL}/invoices/${invoice.id}` : `${API_URL}/invoices`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (res.success) { onSave(); }
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
              ? (t('finance.system.editInvoice'))
              : (t('finance.system.addNewInvoice'))}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('finance.system.project')} *</label>
                <select className="form-select" value={form.project_id} onChange={e => handleChange('project_id', e.target.value)} required>
                  <option value="">-- {t('finance.system.selectProject')} --</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{locale === 'ar' ? p.name_ar : (p.name_en || p.name_ar)} ({p.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('finance.workbench.client')} *</label>
                <select className="form-select" value={form.client_id} onChange={e => handleChange('client_id', e.target.value)} required>
                  <option value="">-- {t('finance.system.selectClient')} --</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{locale === 'ar' ? c.name_ar : c.name_en} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('finance.system.amountEgp')} *</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.amount} onChange={e => handleChange('amount', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('finance.system.issueDate')} *</label>
                  <input className="form-input" type="date" value={form.issue_date} onChange={e => handleChange('issue_date', e.target.value)} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('finance.system.dueDate')}</label>
                <input className="form-input" type="date" value={form.due_date} onChange={e => handleChange('due_date', e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">{t('common.description')}</label>
                <textarea className="form-textarea" value={form.description} onChange={e => handleChange('description', e.target.value)} rows={3} />
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

function InvoiceDetailModal({ invoice, locale, t, onClose, onPaymentSaved }) {
  const [payments, setPayments] = useState(invoice.payments || []);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [recalcInvoice, setRecalcInvoice] = useState(invoice);
  const [voidPayment, setVoidPayment] = useState(null);
  const [voidError, setVoidError] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);

  const methodLabel = (m) => PAYMENT_METHOD_LABELS[locale]?.[m] || m;

  const totalPaid = payments.filter((p) => !p.voided_at).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const remaining = (parseFloat(invoice.amount) || 0) - totalPaid;

  const refreshInvoice = async () => {
    try {
      const res = await fetchApi(`${API_URL}/invoices/${invoice.id}`);
      if (res.success) {
        const data = res.data || res;
        setPayments(data.payments || []);
        setRecalcInvoice(data);
      }
    } catch (e) { console.error(e); }
  };

  const confirmVoidPayment = async (reason) => {
    setVoidBusy(true); setVoidError('');
    try {
      await fetchApi(`${API_URL}/payments/${voidPayment.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });
      setVoidPayment(null);
      await refreshInvoice();
      onPaymentSaved();
    } catch (e) { setVoidError(e.message); }
    finally { setVoidBusy(false); }
  };

  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;
  const currentStatus = recalcInvoice.status || invoice.status;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {t('finance.system.invoiceDetail')} — {invoice.invoice_number}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <div className="stats-grid" style={{ marginBottom: '20px' }}>
            <div className="stat-card">
              <div className="stat-label">{t('finance.system.invoiceAmount')}</div>
              <div className="stat-value" style={{ fontSize: '18px' }}>{formatCurrency(invoice.amount)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('finance.system.paid')}</div>
              <div className="stat-value" style={{ fontSize: '18px', color: 'var(--color-success)' }}>
                {formatCurrency(totalPaid)}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">{t('finance.system.remaining')}</div>
              <div className="stat-value" style={{ fontSize: '18px', color: remaining > 0 ? 'var(--color-warning)' : 'var(--color-success)' }}>
                {formatCurrency(remaining)}
              </div>
            </div>
          </div>

          <div className="responsive-grid responsive-grid--two" style={{ gap: '12px', marginBottom: '20px', fontSize: '13px' }}>
            <div>
              <span style={{ color: 'var(--color-text-secondary)' }}>{t('finance.system.project2')}</span>{' '}
              <strong>{locale === 'ar' ? (invoice.project_name_ar || invoice.project_code) : (invoice.project_name_en || invoice.project_code)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)' }}>{t('finance.system.client')}</span>{' '}
              <strong>{locale === 'ar' ? (invoice.client_name_ar || invoice.client_code) : (invoice.client_name_en || invoice.client_code)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)' }}>{t('finance.system.issueDate2')}</span>{' '}
              <strong>{formatDate(invoice.issue_date)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)' }}>{t('finance.system.dueDate2')}</span>{' '}
              <strong>{invoice.due_date ? formatDate(invoice.due_date) : '-'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary)' }}>{t('common.status')}:</span>{' '}
              <span className={`badge ${STATUS_BADGE[currentStatus] || 'badge-info'}`}>{statusLabel(currentStatus)}</span>
            </div>
            {invoice.description && (
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{t('common.description')}:</span>{' '}
                <span>{invoice.description}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {t('finance.system.paymentRecords')}
            </h4>
            {currentStatus !== 'paid' && (
              <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => setShowPaymentForm(true)}>
                <CreditCard size={14} />
                {t('finance.system.recordPayment')}
              </button>
            )}
          </div>

          {payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              <Receipt size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
              <p>{t('finance.system.noPaymentsRecordedYet')}</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('finance.workbench.amount')}</th>
                    <th>{t('finance.system.date')}</th>
                    <th>{t('finance.system.method')}</th>
                    <th>{t('finance.system.reference')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(pm => (
                    <tr key={pm.id} style={pm.voided_at ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}>
                      <td style={{ fontFamily: 'monospace', color: 'var(--color-success)', fontWeight: 500 }}>
                        {formatCurrency(pm.amount)}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                        {formatDate(pm.payment_date)}
                      </td>
                      <td>
                        {methodLabel(pm.payment_method)}
                      </td>
                      <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>
                        {pm.reference_number || '-'}
                      </td>
                      <td>
                        {pm.voided_at ? (
                          <span className="badge badge-danger" title={pm.void_reason || ''}>{t('finance.void.voidedBadge')}</span>
                        ) : (
                          <button className="btn btn-danger" style={{ padding: '4px 8px' }} title={t('finance.void.action')} aria-label={t('finance.void.action')} onClick={() => { setVoidError(''); setVoidPayment(pm); }}>
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ReasonDialog
            open={Boolean(voidPayment)}
            title={t('finance.void.paymentTitle')}
            message={t('finance.void.paymentMessage')}
            confirmLabel={t('finance.void.confirm')}
            reasonRequired
            busy={voidBusy}
            error={voidError}
            onConfirm={confirmVoidPayment}
            onCancel={() => setVoidPayment(null)}
          />

          {showPaymentForm && (
            <PaymentForm
              invoice={invoice}
              locale={locale}
              t={t}
              onClose={() => setShowPaymentForm(false)}
              onSaved={async () => {
                setShowPaymentForm(false);
                await refreshInvoice();
                onPaymentSaved();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ invoice, locale, t, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const methodLabel = (m) => PAYMENT_METHOD_LABELS[locale]?.[m] || m;

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      setError(t('finance.system.amountIsRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        invoice_id: Number(invoice.id),
        project_id: Number(invoice.project_id),
        client_id: Number(invoice.client_id),
        amount: Number(form.amount),
        payment_date: form.payment_date,
        payment_method: form.payment_method,
        reference_number: form.reference_number,
        notes: form.notes,
      };
      const res = await fetchApi(`${API_URL}/payments`, { method: 'POST', body: JSON.stringify(body) });
      if (res.success) { onSaved(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ marginTop: '20px', padding: '16px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
          {t('finance.system.recordNewPayment')}
        </h4>
        <button className="btn" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="responsive-grid responsive-grid--two" style={{ gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('finance.workbench.amount')} *</label>
              <input className="form-input" type="number" step="0.01" min="0.01" value={form.amount} onChange={e => handleChange('amount', e.target.value)} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('finance.system.paymentDate')} *</label>
              <input className="form-input" type="date" value={form.payment_date} onChange={e => handleChange('payment_date', e.target.value)} required />
            </div>
          </div>
          <div className="responsive-grid responsive-grid--two" style={{ gap: '12px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('finance.system.paymentMethod')}</label>
              <select className="form-select" value={form.payment_method} onChange={e => handleChange('payment_method', e.target.value)}>
                {PAYMENT_METHODS.map(m => (
                  <option key={m} value={m}>{methodLabel(m)}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('finance.system.referenceNumber')}</label>
              <input className="form-input" value={form.reference_number} onChange={e => handleChange('reference_number', e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">{t('common.notes')}</label>
            <input className="form-input" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? <span className="spinner" /> : (t('finance.system.recordPayment2'))}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default Invoices;
