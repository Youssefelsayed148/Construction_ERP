import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import { Search, Plus, Edit, Trash2, Users, X } from 'lucide-react';
import EGYPT_CITIES from '../constants/egyptCities';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const CLIENT_TYPE_LABELS = {
  en: { individual: 'Individual', company: 'Company', government: 'Government', contractor: 'Contractor', developer: 'Developer' },
  ar: { individual: 'فرد', company: 'شركة', government: 'حكومي', contractor: 'مقاول', developer: 'مطور عقاري' }
};

const clientTypes = ['individual', 'company', 'government', 'contractor', 'developer'];

function Clients() {
  const { t, locale } = useLocale();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (activeFilter === 'active') params.append('is_active', 'true');
      if (activeFilter === 'inactive') params.append('is_active', 'false');
      params.append('limit', '200');
      const res = await fetchApi(`${API_URL}/clients?${params}`);
      if (res.success) setClients(res.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [searchQuery, activeFilter]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const handleDelete = async (id) => {
    if (locale === 'ar') {
      const name = prompt('اكتب اسم العميل للحذف:');
      const client = clients.find(i => i.id === id);
      if (name !== client?.name_en && name !== client?.name_ar) return;
    } else {
      const name = prompt('Type client name to confirm delete:');
      const client = clients.find(i => i.id === id);
      if (name !== client?.name_en && name !== client?.name_ar) return;
    }
    try {
      await fetchApi(`${API_URL}/clients/${id}`, { method: 'DELETE' });
      loadClients();
    } catch (e) { alert(e.message); }
  };

  const clientName = (c) => locale === 'ar' ? c.name_ar : c.name_en;
  const cityDisplay = (city) => {
    if (!city) return '-';
    const match = EGYPT_CITIES.find(c => c.en === city);
    return match ? (locale === 'ar' ? match.ar : match.en) : city;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{locale === 'ar' ? 'العملاء' : 'Clients'}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{locale === 'ar' ? 'قاعدة بيانات العملاء' : 'Client Database'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingClient(null); setShowModal(true); }}>
          <Plus size={16} />
          {locale === 'ar' ? 'إضافة عميل' : 'Add Client'}
        </button>
      </div>

      <div className="level-line" />

      {/* Balance summary cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{clients.length}</div>
          <div className="stat-label">{locale === 'ar' ? 'إجمالي العملاء' : 'Total Clients'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(
              clients.reduce((sum, c) => sum + (Number(c.credit_limit) || 0), 0)
            )}
          </div>
          <div className="stat-label">{locale === 'ar' ? 'إجمالي الحد الائتماني' : 'Total Credit Limit'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>
            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(
              clients.reduce((sum, c) => sum + (Number(c.current_balance) || 0), 0)
            )}
          </div>
          <div className="stat-label">{locale === 'ar' ? 'إجمالي الأرصدة المستحقة' : 'Total Outstanding Balance'}</div>
        </div>
      </div>

      {/* Active filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn ${!activeFilter ? 'btn-primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setActiveFilter('')}
        >
          {t('common.all')}
        </button>
        <button
          className={`btn ${activeFilter === 'active' ? 'btn-primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setActiveFilter(activeFilter === 'active' ? '' : 'active')}
        >
          {locale === 'ar' ? 'نشط' : 'Active'}
        </button>
        <button
          className={`btn ${activeFilter === 'inactive' ? 'btn-primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setActiveFilter(activeFilter === 'inactive' ? '' : 'inactive')}
        >
          {locale === 'ar' ? 'غير نشط' : 'Inactive'}
        </button>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-surface)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-surface-raised)', maxWidth: '400px' }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
          <input
            className="form-input"
            style={{ background: 'transparent', border: 'none', padding: '0', flex: 1 }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={locale === 'ar' ? 'بحث عن عملاء...' : 'Search clients...'}
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
      ) : clients.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <Users size={48} style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {locale === 'ar' ? 'لا يوجد عملاء. أضف أول عميل.' : 'No clients found. Add your first client.'}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{t('common.name')}</th>
                <th>{locale === 'ar' ? 'الشخص المسؤول' : 'Contact Person'}</th>
                <th>{locale === 'ar' ? 'الهاتف' : 'Phone'}</th>
                <th>{locale === 'ar' ? 'المدينة' : 'City'}</th>
                <th>{locale === 'ar' ? 'الحد الائتماني' : 'Credit Limit'}</th>
                <th>{locale === 'ar' ? 'الرصيد' : 'Balance'}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-accent)' }}>{c.code}</td>
                  <td>{clientName(c)}</td>
                  <td>{c.contact_person || '-'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{c.phone || '-'}</td>
                  <td>{cityDisplay(c.city)}</td>
                  <td style={{ fontFamily: 'monospace', color: 'var(--color-success)' }}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(c.credit_limit || 0)}
                  </td>
                  <td style={{ fontFamily: 'monospace', color: Number(c.current_balance) > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(c.current_balance || 0)}
                  </td>
                  <td>
                    <span className={`badge ${c.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {c.is_active ? (locale === 'ar' ? 'نشط' : 'Active') : (locale === 'ar' ? 'غير نشط' : 'Inactive')}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" style={{ padding: '6px 10px' }} onClick={() => { setEditingClient(c); setShowModal(true); }}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => handleDelete(c.id)}>
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

      {showModal && <ClientModal
        client={editingClient}
        locale={locale}
        t={t}
        onClose={() => setShowModal(false)}
        onSave={loadClients}
      />}
    </div>
  );
}

function ClientModal({ client, locale, t, onClose, onSave }) {
  const isEdit = !!client;
  const [form, setForm] = useState({
    name_en: client?.name_en || '',
    name_ar: client?.name_ar || '',
    client_type: client?.client_type || 'individual',
    contact_person: client?.contact_person || '',
    phone: client?.phone || '',
    email: client?.email || '',
    address: client?.address || '',
    city: client?.city || '',
    credit_limit: client?.credit_limit || 0,
    payment_terms: client?.payment_terms || '',
    tax_id: client?.tax_id || '',
    is_active: client?.is_active !== false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const url = isEdit ? `${API_URL}/clients/${client.id}` : `${API_URL}/clients`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetchApi(url, { method, body: JSON.stringify(form) });
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
              ? (locale === 'ar' ? `تعديل: ${client.code}` : `Edit: ${client.code}`)
              : (locale === 'ar' ? 'إضافة عميل جديد' : 'Add New Client')}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                  <label className="form-label">{locale === 'ar' ? 'نوع العميل' : 'Client Type'}</label>
                  <select className="form-select" value={form.client_type} onChange={e => handleChange('client_type', e.target.value)}>
                    {clientTypes.map(t => <option key={t} value={t}>{CLIENT_TYPE_LABELS[locale]?.[t] || t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'المدينة' : 'City'}</label>
                  <select className="form-select" value={form.city} onChange={e => handleChange('city', e.target.value)}>
                    <option value="">-- {locale === 'ar' ? 'اختر المدينة' : 'Select City'} --</option>
                    {!EGYPT_CITIES.some(c => c.en === form.city) && form.city && (
                      <option value={form.city} disabled>{form.city}</option>
                    )}
                    {EGYPT_CITIES.map(c => (
                      <option key={c.en} value={c.en}>
                        {locale === 'ar' ? c.ar : c.en}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الشخص المسؤول' : 'Contact Person'}</label>
                  <input className="form-input" value={form.contact_person} onChange={e => handleChange('contact_person', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الهاتف' : 'Phone'}</label>
                  <input className="form-input" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الحد الائتماني' : 'Credit Limit'} (EGP)</label>
                  <input className="form-input" type="number" min="0" value={form.credit_limit} onChange={e => handleChange('credit_limit', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'شروط الدفع' : 'Payment Terms'}</label>
                  <input className="form-input" value={form.payment_terms} onChange={e => handleChange('payment_terms', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{locale === 'ar' ? 'الرقم الضريبي' : 'Tax ID'}</label>
                  <input className="form-input" value={form.tax_id} onChange={e => handleChange('tax_id', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{locale === 'ar' ? 'العنوان' : 'Address'}</label>
                <input className="form-input" value={form.address} onChange={e => handleChange('address', e.target.value)} />
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

export default Clients;
