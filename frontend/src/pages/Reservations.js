import React, { useCallback, useEffect, useState } from 'react';
import { apiJson, apiUrl } from '../services/apiClient';
import { useLocale } from '../hooks/useLocale';
import { authService } from '../services/api';
import { formatNumber, formatDate, localizedName } from '../utils/formatters';
import { errorMessage } from '../utils/errorMessage';
import { translateStatus } from '../i18n/enums';
import { CalendarClock, PackageCheck, RefreshCw } from 'lucide-react';

// Stock reservations (routes/warehouses.js): reserved stock subtracts from
// Available, never from Physical. GET is a warehouse-module read; create and
// release are warehouse-module writes (policy.js is the enforcement point).
const RESERVATION_STATUSES = ['active', 'released'];

export function canManageReservations(user) {
  const permissions = user?.policy_permissions;
  if (!Array.isArray(permissions)) return false;
  return permissions.some((grant) => grant.action === '*'
    || ((grant.module === '*' || grant.module === 'warehouses') && (grant.action === 'create' || grant.action === '*')));
}

function Reservations() {
  const { t, locale } = useLocale();
  const [rows, setRows] = useState([]);
  const [materials, setMaterials] = useState(null);
  const [warehouses, setWarehouses] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ material_id: '', quantity: '', warehouse_id: '', expires_at: '' });
  const canManage = canManageReservations(authService.getCurrentUser());

  const get = useCallback(async (path) => apiJson(apiUrl(path), { headers: { 'Content-Type': 'application/json' } }), []);

  const load = useCallback(async (nextStatus) => {
    setLoading(true);
    setError(null);
    try {
      const filter = nextStatus !== undefined ? nextStatus : statusFilter;
      const query = filter ? `?status=${encodeURIComponent(filter)}` : '';
      const body = await get(`/warehouses/reservations${query}`);
      setRows(body?.data?.data || []);
    } catch (e) {
      setRows([]);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      if (!canManage) return;
      try { setMaterials((await get('/items?limit=200&offset=0'))?.data?.data || []); } catch { setMaterials([]); }
      try { setWarehouses((await get('/warehouses?limit=200&offset=0'))?.data?.data || []); } catch { setWarehouses([]); }
    })();
  }, [canManage, get]);

  const changeFilter = (next) => {
    setStatusFilter(next);
    load(next);
  };

  const release = async (row) => {
    setBusy(`release:${row.id}`);
    setError(null);
    try {
      await apiJson(apiUrl(`/warehouses/reservations/${row.id}/release`), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy('');
    }
  };

  const create = async (event) => {
    event.preventDefault();
    setBusy('create');
    setError(null);
    try {
      await apiJson(apiUrl('/warehouses/reservations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: Number(form.material_id),
          quantity: Number(form.quantity),
          warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null,
          expires_at: form.expires_at || null,
        }),
      });
      setForm({ material_id: '', quantity: '', warehouse_id: '', expires_at: '' });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('inventory.reservations.title')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('inventory.reservations.description')}</p>
        </div>
        <button className="btn" onClick={() => load()} disabled={loading}>
          <RefreshCw size={16} /> {t('inventory.reservations.refresh')}
        </button>
      </div>

      <div className="card form-grid" style={{ maxWidth: 480 }}>
        <label>{t('inventory.reservations.statusFilter')}
          <select value={statusFilter} onChange={(e) => changeFilter(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {RESERVATION_STATUSES.map((s) => <option key={s} value={s}>{translateStatus(t, s)}</option>)}
          </select>
        </label>
      </div>

      {canManage && (
        <form className="card form-grid" onSubmit={create} style={{ marginTop: 16 }}>
          <h3>{t('inventory.reservations.newReservation')}</h3>
          <label>{t('inventory.reservations.material')}
            <select required value={form.material_id} onChange={(e) => setForm({ ...form, material_id: e.target.value })}>
              <option value="">{t('common.select')}</option>
              {(materials || []).map((m) => <option key={m.id} value={m.id}>{m.code} — {localizedName(m, locale)}</option>)}
            </select>
          </label>
          <label>{t('inventory.reservations.quantity')}
            <input required type="number" min="0.001" step="0.001" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </label>
          <label>{t('inventory.reservations.warehouse')}
            <select value={form.warehouse_id} onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}>
              <option value="">{t('inventory.reservations.noWarehouse')}</option>
              {(warehouses || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </label>
          <label>{t('inventory.reservations.expiresAt')}
            <input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </label>
          <button className="btn btn-primary" disabled={busy === 'create' || !materials}>
            <PackageCheck size={16} /> {t('inventory.reservations.reserve')}
          </button>
        </form>
      )}

      {error && <div className="alert alert-danger" role="alert" style={{ marginTop: 16 }}>{errorMessage(error, t)}</div>}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }} role="status" aria-busy="true"><span className="spinner" /><span className="sr-only">{t('common.loading')}</span></div>
      ) : rows.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
          <PackageCheck size={32} style={{ marginBottom: 8 }} />
          <p>{t('inventory.reservations.empty')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr>
              <th>{t('inventory.reservations.material')}</th>
              <th>{t('common.quantity')}</th>
              <th>{t('inventory.reservations.project')}</th>
              <th>{t('common.status')}</th>
              <th>{t('inventory.reservations.expiresAt')}</th>
              <th>{t('inventory.reservations.createdAt')}</th>
              {canManage && <th>{t('common.actions')}</th>}
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.material_code ? `${row.material_code} — ` : ''}{localizedName(row, locale, ['material_name'])}</td>
                  <td>{formatNumber(row.quantity, { decimals: 3 })}</td>
                  <td>{row.project_name || t('inventory.reservations.noProject')}</td>
                  <td>{translateStatus(t, row.status)}</td>
                  <td>{row.expires_at ? formatDate(row.expires_at) : t('inventory.reservations.noExpiry')}</td>
                  <td>{formatDate(row.created_at)}</td>
                  {canManage && (
                    <td>
                      {row.status === 'active' && (
                        <button className="btn btn-sm" disabled={busy === `release:${row.id}`}
                          onClick={() => release(row)}>
                          {t('inventory.reservations.release')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', marginTop: 8 }}>
        <CalendarClock size={14} aria-hidden="true" /> {t('inventory.reservations.footnote')}
      </p>
    </div>
  );
}

export default Reservations;
