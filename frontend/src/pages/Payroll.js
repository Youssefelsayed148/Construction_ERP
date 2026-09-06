import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { Search, Plus, DollarSign, CheckCircle, ChevronDown, ChevronRight, X } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

function Payroll() {
  const { t, locale } = useLocale();
  const [periods, setPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [expandedData, setExpandedData] = useState({});
  const [expandedLoading, setExpandedLoading] = useState({});

  const loadPeriods = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/payroll?${params}`);
      if (res.success) setPeriods(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [searchQuery]);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  const toggleExpand = async (periodId) => {
    const currentlyExpanded = !!expandedRows[periodId];
    if (currentlyExpanded) {
      setExpandedRows(prev => ({ ...prev, [periodId]: false }));
      return;
    }
    setExpandedRows(prev => ({ ...prev, [periodId]: true }));
    if (!expandedData[periodId]) {
      setExpandedLoading(prev => ({ ...prev, [periodId]: true }));
      try {
        const res = await fetchApi(`${API_URL}/payroll/${periodId}`);
        if (res.success) setExpandedData(prev => ({ ...prev, [periodId]: res.data?.employees || res.data || [] }));
      } catch (e) { console.error(e); }
      finally { setExpandedLoading(prev => ({ ...prev, [periodId]: false })); }
    }
  };

  const MONTH_LABELS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  };

  const monthLabel = (num) => {
    const n = Number(num);
    return MONTH_LABELS[locale]?.[n - 1] || num;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('payroll.title') || (locale === 'ar' ? 'الرواتب' : 'Payroll')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'إدارة دفعات الرواتب الشهرية' : 'Monthly Payroll Management'}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'إنشاء دفعة رواتب' : 'Create Payroll'}
        </button>
      </div>

      <div className="level-line" />

      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', maxWidth: '400px' }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن فترة راتب...' : 'Search payroll period...'}
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
      ) : periods.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <DollarSign size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد دفعات رواتب. أنشئ أول دفعة.' : 'No payroll periods found. Create your first payroll.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '40px' }} />
                <th>{locale === 'ar' ? 'الفترة' : 'Period'}</th>
                <th>{locale === 'ar' ? 'موظفين' : 'Employees'}</th>
                <th>{locale === 'ar' ? 'صافي الإجمالي' : 'Total Net'}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'مرحّل' : 'Posted'}</th>
              </tr>
            </thead>
            <tbody>
              {periods.map(period => (
                <React.Fragment key={period.id}>
                  <tr onClick={() => toggleExpand(period.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--color-text-secondary)' }}>
                      {expandedRows[period.id]
                        ? <ChevronDown size={16} />
                        : <ChevronRight size={16} />}
                    </td>
                    <td>
                      <div>
                        <span style={{ fontWeight: 500 }}>{period.period_name || `${monthLabel(period.month)} ${period.year}`}</span>
                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px', display: 'block' }}>
                          {monthLabel(period.month)} {period.year}
                        </span>
                      </div>
                    </td>
                    <td>{period.total_employees || 0}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontWeight: 600 }}>
                      {period.total_net_salary != null ? formatCurrency(period.total_net_salary) : '—'}
                    </td>
                    <td>
                      <span className={`badge ${period.status === 'approved' ? 'badge-success' : period.status === 'draft' ? 'badge-warning' : period.status === 'paid' ? 'badge-info' : 'badge-danger'}`}>
                        {period.status === 'draft' ? (locale === 'ar' ? 'مسودة' : 'Draft')
                          : period.status === 'approved' ? (locale === 'ar' ? 'معتمد' : 'Approved')
                          : period.status === 'paid' ? (locale === 'ar' ? 'مدفوع' : 'Paid')
                          : period.status || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${period.posted ? 'badge-success' : 'badge-info'}`}>
                        {period.posted
                          ? <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={12} />{locale === 'ar' ? 'نعم' : 'Yes'}</span>
                          : (locale === 'ar' ? 'لا' : 'No')}
                      </span>
                    </td>
                  </tr>
                  {expandedRows[period.id] && (
                    <tr>
                      <td />
                      <td colSpan="5" style={{ padding: '0 16px 12px 16px' }}>
                        {expandedLoading[period.id] ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
                            <span className="spinner" />
                          </div>
                        ) : (
                          <div className="table-container" style={{ background: 'var(--color-base)', borderRadius: 'var(--radius-md)' }}>
                            <table className="table" style={{ fontSize: '13px' }}>
                              <thead>
                                <tr>
                                  <th>{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
                                  <th>{locale === 'ar' ? 'الراتب الأساسي' : 'Basic Salary'}</th>
                                  <th>{locale === 'ar' ? 'صافي الراتب' : 'Net Salary'}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(expandedData[period.id] || []).length === 0 ? (
                                  <tr>
                                    <td colSpan="3" style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '20px' }}>
                                      {locale === 'ar' ? 'لا توجد تفاصيل.' : 'No details available.'}
                                    </td>
                                  </tr>
                                ) : (expandedData[period.id] || []).map((item, idx) => (
                                  <tr key={`${period.id}-detail-${idx}`}>
                                    <td>{locale === 'ar' ? (item.name_ar || item.employee_name_ar || item.employee_name) : (item.name_en || item.employee_name_en || item.employee_name)}</td>
                                    <td style={{ fontFamily: 'monospace' }}>{item.basic_salary ? formatCurrency(item.basic_salary) : '—'}</td>
                                    <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)', fontWeight: 500 }}>{item.net_salary ? formatCurrency(item.net_salary) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && <CreatePayrollModal
        locale={locale}
        t={t}
        onClose={() => setShowCreateModal(false)}
        onSave={loadPeriods}
      />}
    </div>
  );
}

function CreatePayrollModal({ locale, t, onClose, onSave }) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [form, setForm] = useState({ month: currentMonth, year: currentYear });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const MONTH_LABELS = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  };

  const years = [];
  for (let y = currentYear; y >= currentYear - 3; y--) years.push(y);

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: Number(value) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccess(false);
    try {
      const res = await fetchApi(`${API_URL}/payroll`, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (res.success) {
        setSuccess(true);
        setTimeout(() => { onSave(); onClose(); }, 1200);
      } else {
        setError(res.error || 'Failed to generate payroll');
      }
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'إنشاء دفعة رواتب' : 'Create Payroll Period'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                {locale === 'ar'
                  ? 'سيتم إنشاء دفعة رواتب لجميع الموظفين النشطين للشهر والسنة المحددين.'
                  : 'This will auto-generate payroll for all active employees for the selected month and year.'}
              </p>

              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الشهر' : 'Month'}</label>
                <select className="form-select" value={form.month} onChange={e => handleChange('month', e.target.value)} required>
                  {MONTH_LABELS[locale || 'en'].map((label, idx) => (
                    <option key={idx + 1} value={idx + 1}>{label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'السنة' : 'Year'}</label>
                <select className="form-select" value={form.year} onChange={e => handleChange('year', e.target.value)} required>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              {success && (
                <div className="alert alert-success">
                  <CheckCircle size={16} />
                  {locale === 'ar' ? 'تم إنشاء الدفعة بنجاح!' : 'Payroll generated successfully!'}
                </div>
              )}
              {error && <div className="alert alert-danger">{error}</div>}
            </div>
          </form>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={creating}>{t('common.cancel')}</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={creating}>
            {creating ? <span className="spinner" /> : (locale === 'ar' ? 'إنشاء' : 'Generate')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Payroll;
