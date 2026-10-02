import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { Plus, Edit, Trash2, DollarSign, Filter, X } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

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
    materials: 'Materials', labor: 'Labor', equipment: 'Equipment', fuel: 'Fuel',
    maintenance: 'Maintenance', transport: 'Transport', utilities: 'Utilities',
    rent: 'Rent', office: 'Office', legal: 'Legal', insurance: 'Insurance', other: 'Other'
  },
  ar: {
    materials: 'مواد', labor: 'عمالة', equipment: 'معدات', fuel: 'وقود',
    maintenance: 'صيانة', transport: 'نقل', utilities: 'مرافق',
    rent: 'إيجار', office: 'مكتب', legal: 'قانوني', insurance: 'تأمين', other: 'أخرى'
  }
};

const categories = ['materials', 'labor', 'equipment', 'fuel', 'maintenance', 'transport', 'utilities', 'rent', 'office', 'legal', 'insurance', 'other'];

function Expenses() {
  const { t, locale } = useLocale();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [projects, setProjects] = useState([]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetchApi(`${API_URL}/projects?limit=200`);
      if (res.success) setProjects(res.data || []);
    } catch (e) { console.error(e); }
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/expenses?${params}`);
      if (res.success) setExpenses(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedCategory, searchQuery]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleDelete = async (id) => {
    if (locale === 'ar') {
      const name = prompt('اكتب وصف المصروف للحذف:');
      const expense = expenses.find(i => i.id === id);
      if (name !== expense?.description) return;
    } else {
      const name = prompt('Type expense description to confirm delete:');
      const expense = expenses.find(i => i.id === id);
      if (name !== expense?.description) return;
    }
    try {
      await fetchApi(`${API_URL}/expenses/${id}`, { method: 'DELETE' });
      loadExpenses();
    } catch (e) { alert(e.message); }
  };

  const categoryLabel = (cat) => CATEGORY_LABELS[locale]?.[cat] || cat;

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const thisMonthExpenses = expenses.filter(e => {
    const d = new Date(e.date || e.created_at);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const thisMonthTotal = thisMonthExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{locale === 'ar' ? 'المصروفات' : 'Expenses'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'سجل المصروفات' : 'Expense Ledger'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingExpense(null); loadProjects(); setShowModal(true); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة مصروف' : 'Add Expense'}
        </button>
      </div>

      <div className="level-line" />

      {/* Stats row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{expenses.length}</div>
          <div className="stat-label">{locale === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{thisMonthExpenses.length}</div>
          <div className="stat-label">{locale === 'ar' ? 'مصروفات هذا الشهر' : 'This Month Count'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-danger)' }}>
            {formatCurrency(thisMonthTotal)}
          </div>
          <div className="stat-label">{locale === 'ar' ? 'إجمالي هذا الشهر' : 'This Month Total'}</div>
        </div>
      </div>

      {/* Category filter */}
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
          <Filter size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن مصروفات...' : 'Search expenses...'}
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
      ) : expenses.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <DollarSign size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد مصروفات. أضف أول مصروف.' : 'No expenses found. Add your first expense.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.category')}</th>
                <th>{t('common.description')}</th>
                <th>{locale === 'ar' ? 'المبلغ' : 'Amount'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'المشروع' : 'Project'}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e.id}>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                    {categoryLabel(e.category)}
                  </td>
                  <td>{e.description}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-danger)' }}>
                    {formatCurrency(e.amount)}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                    {formatDate(e.date || e.created_at)}
                  </td>
                  <td>
                    <span className={`badge ${e.status === 'approved' ? 'badge-success' : e.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                      {e.status === 'approved'
                        ? (locale === 'ar' ? 'معتمد' : 'Approved')
                        : e.status === 'rejected'
                          ? (locale === 'ar' ? 'مرفوض' : 'Rejected')
                          : (locale === 'ar' ? 'معلق' : 'Pending')}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--color-accent)' }}>
                    {e.project_id ? `${locale === 'ar' ? e.project_name_ar : (e.project_name_en || e.project_name_ar)} (${e.project_code})` : '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingExpense(e); loadProjects(); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(e.id)}>
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

      {showModal && <ExpenseModal
        expense={editingExpense}
        locale={locale}
        t={t}
        projects={projects}
        onClose={() => setShowModal(false)}
        onSave={loadExpenses}
      />}
    </div>
  );
}

function ExpenseModal({ expense, locale, t, projects, onClose, onSave }) {
  const isEdit = !!expense;
  const [form, setForm] = useState({
    category: expense?.category || 'materials',
    description: expense?.description || '',
    amount: expense?.amount || '',
    date: expense?.date ? expense.date.split('T')[0] : new Date().toISOString().split('T')[0],
    project_id: expense?.project_id || '',
    paid_by: expense?.paid_by || '',
    notes: expense?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/expenses/${expense.id}` : `${API_URL}/expenses`;
      const method = isEdit ? 'PUT' : 'POST';
      const body = { ...form, project_id: form.project_id ? Number(form.project_id) : null };
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit
              ? (locale === 'ar' ? 'تعديل المصروف' : 'Edit Expense')
              : (locale === 'ar' ? 'إضافة مصروف جديد' : 'Add New Expense')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('common.category')} *</label>
                <select className="form-select" value={form.category} onChange={e => handleChange('category', e.target.value)}>
                  {categories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[locale]?.[c] || c}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{t('common.description')} *</label>
                <input className="form-input" value={form.description} onChange={e => handleChange('description', e.target.value)} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المبلغ (ج.م)' : 'Amount (EGP)'} *</label>
                  <input className="form-input" type="number" step="0.01" min="0" value={form.amount} onChange={e => handleChange('amount', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'} *</label>
                  <input className="form-input" type="date" value={form.date} onChange={e => handleChange('date', e.target.value)} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المشروع (اختياري)' : 'Project (optional)'}</label>
                  <select className="form-select" value={form.project_id} onChange={e => handleChange('project_id', e.target.value)}>
                    <option value="">-- {locale === 'ar' ? 'بدون مشروع' : 'No Project'} --</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{locale === 'ar' ? p.name_ar : (p.name_en || p.name_ar)} ({p.code})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'مدفوع بواسطة' : 'Paid By'}</label>
                  <input className="form-input" value={form.paid_by} onChange={e => handleChange('paid_by', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'ملاحظات' : 'Notes'}</label>
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

export default Expenses;
