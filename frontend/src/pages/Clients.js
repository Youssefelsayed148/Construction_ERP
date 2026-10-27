import { formatCurrency, localizedName, pickByLocale } from '../utils/formatters';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from '../hooks/useLocale';
import ConfirmDialog from '../components/common/ConfirmDialog';
import LoadMore from '../components/common/LoadMore';
import { Search, Plus, Edit, Trash2, Users, X } from 'lucide-react';
import EGYPT_CITIES from '../constants/egyptCities';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
});

const CLIENT_TYPE_LABELS = {
  en: { individual: 'Individual', company: 'Company', government: 'Government', contractor: 'Contractor', developer: 'Developer' },
  ar: { individual: 'فرد', company: 'شركة', government: 'حكومي', contractor: 'مقاول', developer: 'مطور عقاري' }
};

const clientTypes = ['individual', 'company', 'government', 'contractor', 'developer'];

function Clients() {
  const { t, locale } = useLocale();
  const [clients, setClients] = useState([]);
  const clientsLength = useRef(0);
  clientsLength.current = clients.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadClients = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (activeFilter === 'active') params.append('is_active', 'true');
      if (activeFilter === 'inactive') params.append('is_active', 'false');
      params.append('limit', '200');
      params.append('offset', String(append ? clientsLength.current : 0));
      const res = await fetchApi(`${API_URL}/clients?${params}`);
      if (res.success) {
        setClients(current => append ? [...current, ...(res.data || [])] : (res.data || []));
        setTotalCount(res.totalCount ?? null);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [searchQuery, activeFilter]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const handleDelete = (id) => setDeleteTarget(clients.find((item) => item.id === id));

  const confirmDelete = async () => {
    const id = deleteTarget?.id;
    setDeleteTarget(null);
    if (!id) return;
    try {
      await fetchApi(`${API_URL}/clients/${id}`, { method: 'DELETE' });
      loadClients();
    } catch (e) { alert(e.message); }
  };

  const clientName = (c) => localizedName(c, locale);
  const cityDisplay = (city) => {
    if (!city) return '-';
    const match = EGYPT_CITIES.find(c => c.en === city);
    return match ? (pickByLocale(locale, match.en, match.ar)) : city;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('clients.title')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('clients.system.clientDatabase')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingClient(null); setShowModal(true); }}>
          <Plus size={16} />
          {t('clients.system.addClient')}
        </button>
      </div>

      <div className="level-line" />

      {/* Balance summary cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{clients.length}</div>
          <div className="stat-label">{t('clients.system.totalClients')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            {formatCurrency(
              clients.reduce((sum, c) => sum + (Number(c.credit_limit) || 0), 0)
            )}
          </div>
          <div className="stat-label">{t('clients.system.totalCreditLimit')}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--color-warning)' }}>
            {formatCurrency(
              clients.reduce((sum, c) => sum + (Number(c.current_balance) || 0), 0)
            )}
          </div>
          <div className="stat-label">{t('clients.system.totalOutstandingBalance')}</div>
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
          {t('clients.system.active')}
        </button>
        <button
          className={`btn ${activeFilter === 'inactive' ? 'btn-primary' : ''}`}
          style={{ padding: '6px 16px', fontSize: '13px' }}
          onClick={() => setActiveFilter(activeFilter === 'inactive' ? '' : 'inactive')}
        >
          {t('clients.system.inactive')}
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
            placeholder={t('clients.system.searchClients')}
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
            {t('clients.system.noClientsFoundAddYourFirstClient')}
          </p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.code')}</th>
                <th>{t('common.name')}</th>
                <th>{t('clients.system.contactPerson')}</th>
                <th>{t('clients.system.phone')}</th>
                <th>{t('clients.system.city')}</th>
                <th>{t('clients.system.creditLimit')}</th>
                <th>{t('clients.system.balance')}</th>
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
                    {formatCurrency(c.credit_limit || 0)}
                  </td>
                  <td style={{ fontFamily: 'monospace', color: Number(c.current_balance) > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                    {formatCurrency(c.current_balance || 0)}
                  </td>
                  <td>
                    <span className={`badge ${c.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {c.is_active ? (t('clients.system.active')) : (t('clients.system.inactive'))}
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

      <LoadMore loadedCount={clients.length} totalCount={totalCount} loading={loadingMore} t={t} onLoadMore={() => loadClients({ append: true })} />
      {showModal && <ClientModal
        client={editingClient}
        locale={locale}
        t={t}
        onClose={() => setShowModal(false)}
        onSave={loadClients}
      />}
      <ConfirmDialog open={Boolean(deleteTarget)} title={t('common.dialogs.confirmTitle')} message={t('common.dialogs.confirmDelete')} confirmLabel={t('common.delete')} destructive requireText={localizedName(deleteTarget, locale)} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
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
              ? (t('clients.system.edit', { code: client.code }))
              : (t('clients.system.addNewClient'))}
          </h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.englishName')}</label>
                  <input className="form-input" value={form.name_en} onChange={e => handleChange('name_en', e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">الاسم العربي *</label>
                  <input className="form-input" value={form.name_ar} onChange={e => handleChange('name_ar', e.target.value)} required />
                </div>
              </div>

              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.clientType')}</label>
                  <select className="form-select" value={form.client_type} onChange={e => handleChange('client_type', e.target.value)}>
                    {clientTypes.map(t => <option key={t} value={t}>{CLIENT_TYPE_LABELS[locale]?.[t] || t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.city')}</label>
                  <select className="form-select" value={form.city} onChange={e => handleChange('city', e.target.value)}>
                    <option value="">-- {t('clients.system.selectCity')} --</option>
                    {!EGYPT_CITIES.some(c => c.en === form.city) && form.city && (
                      <option value={form.city} disabled>{form.city}</option>
                    )}
                    {EGYPT_CITIES.map(c => (
                      <option key={c.en} value={c.en}>
                        {pickByLocale(locale, c.en, c.ar)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.contactPerson')}</label>
                  <input className="form-input" value={form.contact_person} onChange={e => handleChange('contact_person', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.phone')}</label>
                  <input className="form-input" value={form.phone} onChange={e => handleChange('phone', e.target.value)} />
                </div>
              </div>

              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.email')}</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => handleChange('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.creditLimit')}  {t('clients.system.egp')}</label>
                  <input className="form-input" type="number" min="0" value={form.credit_limit} onChange={e => handleChange('credit_limit', e.target.value)} />
                </div>
              </div>

              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.paymentTerms')}</label>
                  <input className="form-input" value={form.payment_terms} onChange={e => handleChange('payment_terms', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('clients.system.taxId')}</label>
                  <input className="form-input" value={form.tax_id} onChange={e => handleChange('tax_id', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('clients.system.address')}</label>
                <input className="form-input" value={form.address} onChange={e => handleChange('address', e.target.value)} />
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => handleChange('is_active', e.target.checked)} />
                  <span className="form-label" style={{ margin: 0 }}>{t('clients.system.active')}</span>
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
