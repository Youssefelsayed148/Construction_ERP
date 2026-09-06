import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { Search, Plus, Edit, Trash2, Users, Calendar, Clock, HardHat, DollarSign, X } from 'lucide-react';
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

const STATUS_LABELS = {
  en: { active: 'Active', inactive: 'Inactive', on_leave: 'On Leave', terminated: 'Terminated' },
  ar: { active: 'نشط', inactive: 'غير نشط', on_leave: 'إجازة', terminated: 'منتهي' }
};

const ATTENDANCE_STATUS_LABELS = {
  en: { present: 'Present', absent: 'Absent', late: 'Late', half_day: 'Half Day', leave: 'Leave' },
  ar: { present: 'حاضر', absent: 'غائب', late: 'متأخر', half_day: 'نصف يوم', leave: 'إجازة' }
};

const SKILL_LABELS = {
  en: { mason: 'Mason', carpenter: 'Carpenter', electrician: 'Electrician', steel_fixer: 'Steel Fixer', plumber: 'Plumber', painter: 'Painter', tiler: 'Tiler', general: 'General' },
  ar: { mason: 'بناء', carpenter: 'نجار', electrician: 'كهربائي', steel_fixer: 'حداد', plumber: 'سباك', painter: 'دهان', tiler: 'مبلط', general: 'عام' }
};

const TABS = [
  { key: 'employees', icon: Users, label_en: 'Employees', label_ar: 'الموظفين' },
  { key: 'attendance', icon: Calendar, label_en: 'Attendance', label_ar: 'الحضور' },
  { key: 'laborers', icon: HardHat, label_en: 'Daily Laborers', label_ar: 'عمال يومية' },
  { key: 'payments', icon: DollarSign, label_en: 'Labor Payments', label_ar: 'مدفوعات العمال' },
];

function HR() {
  const { t, locale } = useLocale();
  const [activeTab, setActiveTab] = useState('employees');

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('hr.title') || (locale === 'ar' ? 'الموارد البشرية' : 'Human Resources')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'إدارة الموظفين والعمال والحضور' : 'Manage employees, laborers & attendance'}
          </p>
        </div>
      </div>

      <div className="level-line" />

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--color-surface-raised)' }}>
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 20px', fontSize: '14px', fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                background: 'none', border: 'none', borderBottom: isActive ? '2px solid var(--color-accent)' : '2px solid transparent',
                cursor: 'pointer', transition: 'all var(--transition-fast)',
              }}
            >
              <Icon size={16} />
              <span>{locale === 'ar' ? tab.label_ar : tab.label_en}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'employees' && <EmployeesTab locale={locale} t={t} />}
      {activeTab === 'attendance' && <AttendanceTab locale={locale} t={t} />}
      {activeTab === 'laborers' && <LaborersTab locale={locale} t={t} />}
      {activeTab === 'payments' && <LaborPaymentsTab locale={locale} t={t} />}
    </div>
  );
}

/* ─────────────────── EMPLOYEES TAB ─────────────────── */
function EmployeesTab({ locale, t }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/hr/employees?${params}`);
      if (res.success) setEmployees(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [searchQuery]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const handleDelete = async (id) => {
    if (locale === 'ar') {
      const name = prompt('اكتب اسم الموظف للحذف:');
      const emp = employees.find(i => i.id === id);
      if (name !== emp?.name_en && name !== emp?.name_ar) return;
    } else {
      const name = prompt('Type employee name to confirm delete:');
      const emp = employees.find(i => i.id === id);
      if (name !== emp?.name_en && name !== emp?.name_ar) return;
    }
    try {
      await fetchApi(`${API_URL}/hr/employees/${id}`, { method: 'DELETE' });
      loadEmployees();
    } catch (e) { alert(e.message); }
  };

  const empName = (emp) => locale === 'ar' ? emp.name_ar : emp.name_en;
  const statusLabel = (s) => STATUS_LABELS[locale]?.[s] || s;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', maxWidth: '400px', flex: 1 }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن موظف...' : 'Search employees...'}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingEmployee(null); setShowModal(true); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة موظف' : 'Add Employee'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : employees.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Users size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا يوجد موظفين. أضف أول موظف.' : 'No employees found. Add your first employee.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{t('common.name')}</th>
                <th>{locale === 'ar' ? 'القسم' : 'Department'}</th>
                <th>{locale === 'ar' ? 'المسمى الوظيفي' : 'Designation'}</th>
                <th>{locale === 'ar' ? 'الراتب' : 'Salary'}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{emp.code}</td>
                  <td>
                    {empName(emp)}
                    {emp.is_manager && (
                      <span className="badge badge-info" style={{ marginInlineStart: '8px' }}>
                        {locale === 'ar' ? 'مدير قسم' : 'Dept. Manager'}
                      </span>
                    )}
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>{emp.department || '—'}</td>
                  <td>{emp.designation || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{emp.salary ? formatCurrency(emp.salary) : '—'}</td>
                  <td>
                    <span className={`badge ${emp.status === 'active' ? 'badge-success' : emp.status === 'on_leave' ? 'badge-warning' : emp.status === 'inactive' ? 'badge-info' : 'badge-danger'}`}>
                      {statusLabel(emp.status)}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingEmployee(emp); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(emp.id)}>
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

      {showModal && <EmployeeModal
        employee={editingEmployee}
        locale={locale}
        t={t}
        onClose={() => setShowModal(false)}
        onSave={loadEmployees}
      />}
    </>
  );
}

function EmployeeModal({ employee, locale, t, onClose, onSave }) {
  const isEdit = !!employee;
  const [form, setForm] = useState({
    name_en: employee?.name_en || '',
    name_ar: employee?.name_ar || '',
    department: employee?.department || '',
    designation: employee?.designation || '',
    email: employee?.email || '',
    phone: employee?.phone || '',
    salary: employee?.salary || '',
    hire_date: employee?.hire_date ? employee.hire_date.slice(0, 10) : '',
    status: employee?.status || 'active',
    is_manager: employee?.is_manager || false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/hr/employees/${employee.id}` : `${API_URL}/hr/employees`;
      const method = isEdit ? 'PUT' : 'POST';
      const payload = { ...form, salary: form.salary ? Number(form.salary) : null };
      const res = await fetchApi(url, { method, body: JSON.stringify(payload) });
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
              ? (locale === 'ar' ? `تعديل: ${employee.code}` : `Edit: ${employee.code}`)
              : (locale === 'ar' ? 'إضافة موظف جديد' : 'Add New Employee')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isEdit && (
                <div className="form-group">
                  <label className="form-label">{t('common.code')}</label>
                  <input className="form-input" value={employee.code} disabled />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">English Name *</label>
                  <input className="form-input" value={form.name_en} onChange={e => handleChange('name_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم العربي *</label>
                  <input className="form-input" value={form.name_ar} onChange={e => handleChange('name_ar', e.target.value)} required />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'القسم' : 'Department'}</label>
                  <input className="form-input" value={form.department} onChange={e => handleChange('department', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المسمى الوظيفي' : 'Designation'}</label>
                  <input className="form-input" value={form.designation} onChange={e => handleChange('designation', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_manager} onChange={e => handleChange('is_manager', e.target.checked)} />
                  {locale === 'ar' ? 'مدير قسم' : 'Department Manager'}
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الهاتف' : 'Phone'}</label>
                  <input className="form-input" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الراتب الأساسي' : 'Basic Salary'}</label>
                  <input className="form-input" type="number" step="0.01" value={form.salary} onChange={e => handleChange('salary', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'تاريخ التوظيف' : 'Hire Date'}</label>
                  <input className="form-input" type="date" value={form.hire_date} onChange={e => handleChange('hire_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.status')}</label>
                  <select className="form-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                    <option value="active">{STATUS_LABELS[locale]?.active || 'Active'}</option>
                    <option value="inactive">{STATUS_LABELS[locale]?.inactive || 'Inactive'}</option>
                    <option value="on_leave">{STATUS_LABELS[locale]?.on_leave || 'On Leave'}</option>
                    <option value="terminated">{STATUS_LABELS[locale]?.terminated || 'Terminated'}</option>
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

/* ─────────────────── ATTENDANCE TAB ─────────────────── */
function AttendanceTab({ locale, t }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [showRecordModal, setShowRecordModal] = useState(false);

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDate) params.append('date', selectedDate);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/hr/attendance?${params}`);
      if (res.success) setRecords(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedDate]);

  useEffect(() => { loadAttendance(); }, [loadAttendance]);

  const attStatus = (s) => ATTENDANCE_STATUS_LABELS[locale]?.[s] || s;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Calendar size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ maxWidth: '200px' }}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowRecordModal(true)}>
          <Clock size={16} />
          {locale === 'ar' ? 'تسجيل حضور' : 'Record Attendance'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : records.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Calendar size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد سجلات حضور لهذا التاريخ.' : 'No attendance records for this date.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'الموظف' : 'Employee'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th>{t('common.status')}</th>
                <th>{locale === 'ar' ? 'وقت الحضور' : 'Check In'}</th>
                <th>{locale === 'ar' ? 'وقت الانصراف' : 'Check Out'}</th>
              </tr>
            </thead>
            <tbody>
              {records.map(rec => (
                <tr key={rec.id}>
                  <td>{locale === 'ar' ? rec.employee_name_ar || rec.employee_name_en : rec.employee_name_en || rec.employee_name_ar}</td>
                  <td>{rec.date ? rec.date.slice(0, 10) : '—'}</td>
                  <td>
                    <span className={`badge ${rec.status === 'present' ? 'badge-success' : rec.status === 'absent' ? 'badge-danger' : rec.status === 'late' ? 'badge-warning' : 'badge-info'}`}>
                      {attStatus(rec.status)}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>{rec.check_in || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{rec.check_out || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showRecordModal && <AttendanceModal
        locale={locale}
        t={t}
        date={selectedDate}
        onClose={() => setShowRecordModal(false)}
        onSave={loadAttendance}
      />}
    </>
  );
}

function AttendanceModal({ locale, t, date, onClose, onSave }) {
  const [form, setForm] = useState({
    employee_id: '',
    date: date,
    status: 'present',
    check_in: '',
    check_out: '',
    notes: '',
  });
  const [employees, setEmployees] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi(`${API_URL}/hr/employees?status=active&limit=200`)
      .then(res => { if (res.success) setEmployees(res.data || []); })
      .catch(() => {});
  }, []);

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetchApi(`${API_URL}/hr/attendance`, { method: 'POST', body: JSON.stringify(form) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'تسجيل حضور' : 'Record Attendance'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الموظف' : 'Employee'} *</label>
                <select className="form-select" value={form.employee_id} onChange={e => handleChange('employee_id', e.target.value)} required>
                  <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{locale === 'ar' ? emp.name_ar : emp.name_en} ({emp.code})</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'}</label>
                  <input className="form-input" type="date" value={form.date} onChange={e => handleChange('date', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.status')}</label>
                  <select className="form-select" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                    {Object.entries(ATTENDANCE_STATUS_LABELS[locale] || ATTENDANCE_STATUS_LABELS.en).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'وقت الحضور' : 'Check In'}</label>
                  <input className="form-input" type="time" value={form.check_in} onChange={e => handleChange('check_in', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'وقت الانصراف' : 'Check Out'}</label>
                  <input className="form-input" type="time" value={form.check_out} onChange={e => handleChange('check_out', e.target.value)} />
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

/* ─────────────────── DAILY LABORERS TAB ─────────────────── */
function LaborersTab({ locale, t }) {
  const [laborers, setLaborers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingLaborer, setEditingLaborer] = useState(null);

  const loadLaborers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/hr/laborers?${params}`);
      if (res.success) setLaborers(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [searchQuery]);

  useEffect(() => { loadLaborers(); }, [loadLaborers]);

  const handleDelete = async (id) => {
    if (locale === 'ar') {
      const name = prompt('اكتب اسم العامل للحذف:');
      const lab = laborers.find(i => i.id === id);
      if (name !== lab?.full_name) return;
    } else {
      const name = prompt('Type laborer name to confirm delete:');
      const lab = laborers.find(i => i.id === id);
      if (name !== lab?.full_name) return;
    }
    try {
      await fetchApi(`${API_URL}/hr/laborers/${id}`, { method: 'DELETE' });
      loadLaborers();
    } catch (e) { alert(e.message); }
  };

  const skillLabel = (s) => SKILL_LABELS[locale]?.[s] || s;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', maxWidth: '400px', flex: 1 }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن عامل...' : 'Search laborers...'}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingLaborer(null); setShowModal(true); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة عامل' : 'Add Laborer'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : laborers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <HardHat size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا يوجد عمال يومية. أضف أول عامل.' : 'No laborers found. Add your first laborer.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{locale === 'ar' ? 'الاسم' : 'Full Name'}</th>
                <th>{locale === 'ar' ? 'المهارة' : 'Skill'}</th>
                <th>{locale === 'ar' ? 'سعر اليومية' : 'Daily Rate'}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {laborers.map(lab => (
                <tr key={lab.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{lab.code}</td>
                  <td>{lab.full_name}</td>
                  <td>{skillLabel(lab.skill_category)}</td>
                  <td style={{ fontFamily: 'monospace' }}>{lab.daily_rate ? formatCurrency(lab.daily_rate) : '—'}</td>
                  <td>
                    <span className={`badge ${lab.is_active !== false ? 'badge-success' : 'badge-danger'}`}>
                      {lab.is_active !== false ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'غير نشط' : 'Inactive')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingLaborer(lab); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(lab.id)}>
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

      {showModal && <LaborerModal
        laborer={editingLaborer}
        locale={locale}
        t={t}
        onClose={() => setShowModal(false)}
        onSave={loadLaborers}
      />}
    </>
  );
}

function LaborerModal({ laborer, locale, t, onClose, onSave }) {
  const isEdit = !!laborer;
  const [form, setForm] = useState({
    full_name: laborer?.full_name || '',
    skill_category: laborer?.skill_category || 'general',
    daily_rate: laborer?.daily_rate || '',
    phone: laborer?.phone || '',
    is_active: laborer?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/hr/laborers/${laborer.id}` : `${API_URL}/hr/laborers`;
      const method = isEdit ? 'PUT' : 'POST';
      const payload = { ...form, daily_rate: form.daily_rate ? Number(form.daily_rate) : null };
      const res = await fetchApi(url, { method, body: JSON.stringify(payload) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  const SKILLS = ['mason', 'carpenter', 'electrician', 'steel_fixer', 'plumber', 'painter', 'tiler', 'general'];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            {isEdit
              ? (locale === 'ar' ? `تعديل: ${laborer.code}` : `Edit: ${laborer.code}`)
              : (locale === 'ar' ? 'إضافة عامل جديد' : 'Add New Laborer')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {isEdit && (
                <div className="form-group">
                  <label className="form-label">{t('common.code')}</label>
                  <input className="form-input" value={laborer.code} disabled />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الاسم الكامل' : 'Full Name'} *</label>
                <input className="form-input" value={form.full_name} onChange={e => handleChange('full_name', e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المهارة' : 'Skill Category'}</label>
                  <select className="form-select" value={form.skill_category} onChange={e => handleChange('skill_category', e.target.value)}>
                    {SKILLS.map(s => <option key={s} value={s}>{SKILL_LABELS[locale]?.[s] || s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'سعر اليومية' : 'Daily Rate'}</label>
                  <input className="form-input" type="number" step="0.01" value={form.daily_rate} onChange={e => handleChange('daily_rate', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'الهاتف' : 'Phone'}</label>
                <input className="form-input" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => handleChange('is_active', e.target.checked)} />
                  <span className="form-label" style={{ margin: 0 }}>{locale === 'ar' ? 'نشط' : 'Active'}</span>
                </label>
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

/* ─────────────────── LABOR PAYMENTS TAB ─────────────────── */
function LaborPaymentsTab({ locale, t }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi(`${API_URL}/hr/labor-payments?limit=200`);
      if (res.success) setPayments(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة دفعة' : 'Add Payment'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <span className="spinner" />
        </div>
      ) : payments.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <DollarSign size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا توجد مدفوعات. أضف أول دفعة.' : 'No payments found. Add your first payment.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'العامل' : 'Laborer'}</th>
                <th>{locale === 'ar' ? 'المشروع' : 'Project'}</th>
                <th>{locale === 'ar' ? 'التاريخ' : 'Date'}</th>
                <th>{locale === 'ar' ? 'الأيام' : 'Days'}</th>
                <th>{locale === 'ar' ? 'سعر اليومية' : 'Daily Rate'}</th>
                <th>{locale === 'ar' ? 'الإجمالي' : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(pay => (
                <tr key={pay.id}>
                  <td>{pay.laborer_name || pay.laborer?.full_name || '—'}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{pay.project_id || '—'}</td>
                  <td>{pay.date ? pay.date.slice(0, 10) : '—'}</td>
                  <td>{pay.days || 0}</td>
                  <td style={{ fontFamily: 'monospace' }}>{pay.daily_rate ? formatCurrency(pay.daily_rate) : '—'}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-warning)', fontWeight: 600 }}>{pay.total ? formatCurrency(pay.total) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <LaborPaymentModal
        locale={locale}
        t={t}
        onClose={() => setShowModal(false)}
        onSave={loadPayments}
      />}
    </>
  );
}

function LaborPaymentModal({ locale, t, onClose, onSave }) {
  const [form, setForm] = useState({
    laborer_id: '',
    project_id: '',
    date: new Date().toISOString().slice(0, 10),
    days: '',
  });
  const [laborers, setLaborers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi(`${API_URL}/hr/laborers?is_active=true&limit=200`)
      .then(res => { if (res.success) setLaborers(res.data || []); })
      .catch(() => {});
  }, []);

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const selectedLaborer = laborers.find(l => l.id === Number(form.laborer_id));
  const dailyRate = selectedLaborer?.daily_rate || 0;
  const total = (Number(form.days) || 0) * Number(dailyRate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        laborer_id: Number(form.laborer_id),
        project_id: form.project_id,
        date: form.date,
        days: Number(form.days),
        daily_rate: Number(dailyRate),
        total: total,
      };
      const res = await fetchApi(`${API_URL}/hr/labor-payments`, { method: 'POST', body: JSON.stringify(payload) });
      if (res.success) { onSave(); onClose(); }
      else { setError(res.error || 'Save failed'); }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{locale === 'ar' ? 'إضافة دفعة عامل' : 'Add Labor Payment'}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'العامل' : 'Laborer'} *</label>
                <select className="form-select" value={form.laborer_id} onChange={e => handleChange('laborer_id', e.target.value)} required>
                  <option value="">{locale === 'ar' ? '— اختر —' : '— Select —'}</option>
                  {laborers.map(lab => (
                    <option key={lab.id} value={lab.id}>{lab.full_name} ({lab.code}) — {formatCurrency(lab.daily_rate)}/day</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المشروع' : 'Project ID'}</label>
                  <input className="form-input" value={form.project_id} onChange={e => handleChange('project_id', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'التاريخ' : 'Date'}</label>
                  <input className="form-input" type="date" value={form.date} onChange={e => handleChange('date', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'عدد الأيام' : 'Days'}</label>
                  <input className="form-input" type="number" step="1" min="0" value={form.days} onChange={e => handleChange('days', e.target.value)} required />
                </div>
              </div>
              <div className="card" style={{ background: 'var(--color-base)', padding: '16px', textAlign: 'center' }}>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '4px' }}>
                  {locale === 'ar' ? 'الإجمالي' : 'Total'}: {form.days} × {formatCurrency(dailyRate)}
                </p>
                <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-warning)', fontFamily: 'monospace' }}>
                  {formatCurrency(total)}
                </p>
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

export default HR;
