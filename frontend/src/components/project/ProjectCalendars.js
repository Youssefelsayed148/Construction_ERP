import { apiFetch, apiResponseJson } from '../../services/apiClient';
import { localizedName } from '../../utils/formatters';
import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, X, Check, CalendarRange } from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => {
    const error = new Error(e.error || e.error_code || 'Request failed');
    error.error_code = e.error_code || e.error;
    throw error;
  });
  return apiResponseJson(r);
});

// Display order for a Saturday-start week; values are the backend day codes
// (0 = Sunday … 6 = Saturday, matching project_calendars.weekly_off_days).
const DAY_ORDER = [6, 0, 1, 2, 3, 4, 5];
const DEFAULT_OFF_DAYS = [5, 6];

const ERROR_KEYS = {
  calendar_default_required: 'projects.calendar.errDefaultRequired',
  calendar_off_days_invalid: 'projects.calendar.errOffDaysInvalid',
  calendar_not_found: 'projects.calendar.errNotFound',
};

const weekdayName = (t, d) => ({ 0: t('projects.calendar.weekdaySun'), 1: t('projects.calendar.weekdayMon'),
  2: t('projects.calendar.weekdayTue'), 3: t('projects.calendar.weekdayWed'),
  4: t('projects.calendar.weekdayThu'), 5: t('projects.calendar.weekdayFri'),
  6: t('projects.calendar.weekdaySat') })[d];

function ProjectCalendars({ projectId, locale, t, canManage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApi(`${API_URL}/projects/${projectId}/calendars`);
      if (res.success) setRows(res.data || []);
      else setError(res.error || 'Failed to load calendars');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const messageFor = (e) => (e && ERROR_KEYS[e.error_code] ? t(ERROR_KEYS[e.error_code]) : e.message);

  const offDaysText = (days) => {
    const off = Array.isArray(days) ? days.map(Number) : [];
    if (off.length === 0) return t('projects.calendar.offDaysNone');
    return DAY_ORDER.filter((d) => off.includes(d)).map((d) => weekdayName(t, d)).join(', ');
  };

  const removeCalendar = async (id) => {
    setError('');
    try {
      const res = await fetchApi(`${API_URL}/projects/${projectId}/calendars/${id}`, { method: 'DELETE' });
      if (!res.success) {
        throw Object.assign(new Error(res.error || 'Delete failed'), { error_code: res.error_code });
      }
      setConfirmingId(null);
      load();
    } catch (e) {
      setConfirmingId(null);
      setError(messageFor(e));
    }
  };

  return (
    <div className="card" style={{ marginBottom: '24px' }}>
      <div className="card-header">
        <h3 className="card-title">{t('projects.calendar.section')}</h3>
        {canManage && (
          <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }} onClick={() => setModal({})}>
            <Plus size={14} />
            {t('projects.calendar.add')}
          </button>
        )}
      </div>
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '30px' }}>
          <span className="spinner" />
        </div>
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-secondary)' }}>
          <CalendarRange size={32} style={{ marginBottom: '8px' }} />
          <p>{t('projects.calendar.noCalendarsYet')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('projects.calendar.timezone')}</th>
                <th>{t('projects.calendar.weeklyOffDays')}</th>
                <th>{t('projects.calendar.holidays')}</th>
                {canManage && <th>{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((cal) => (
                <tr key={cal.id}>
                  <td>
                    {localizedName(cal, locale)}
                    {cal.is_default && (
                      <span className="badge badge-success" style={{ marginInlineStart: '8px' }}>
                        {t('projects.calendar.defaultBadge')}
                      </span>
                    )}
                  </td>
                  <td>{cal.timezone || '—'}</td>
                  <td>{offDaysText(cal.weekly_off_days)}</td>
                  <td>{Array.isArray(cal.holidays) ? cal.holidays.length : 0}</td>
                  {canManage && (
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {confirmingId === cal.id ? (
                          <>
                            <button className="btn btn-danger" style={{ padding: '4px 8px' }}
                              onClick={() => removeCalendar(cal.id)}>
                              <Check size={12} />
                              <span style={{ marginInlineStart: '4px' }}>{t('projects.calendar.confirmDelete')}</span>
                            </button>
                            <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setConfirmingId(null)}>
                              <X size={12} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setModal(cal)}>
                              <Edit size={12} />
                            </button>
                            <button className="btn btn-danger" style={{ padding: '4px 8px' }}
                              onClick={() => setConfirmingId(cal.id)}>
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <CalendarModal
          calendar={modal}
          locale={locale}
          t={t}
          projectId={projectId}
          messageFor={messageFor}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function CalendarModal({ calendar, locale, t, projectId, messageFor, onClose, onSaved }) {
  const isEdit = !!calendar && !!calendar.id;
  const [form, setForm] = useState({
    name_en: calendar?.name_en || '',
    name_ar: calendar?.name_ar || '',
    timezone: calendar?.timezone || 'Africa/Cairo',
    weekly_off_days: Array.isArray(calendar?.weekly_off_days) ? calendar.weekly_off_days.map(Number) : DEFAULT_OFF_DAYS,
    holidays: Array.isArray(calendar?.holidays)
      ? calendar.holidays.map((h) => ({ date: String(h.date || '').slice(0, 10), name: h.name || '' }))
      : [],
    is_default: isEdit ? !!calendar.is_default : false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const toggleDay = (day) => setForm((f) => ({
    ...f,
    weekly_off_days: f.weekly_off_days.includes(day)
      ? f.weekly_off_days.filter((d) => d !== day)
      : [...f.weekly_off_days, day].sort((a, b) => a - b),
  }));
  const setHoliday = (index, field, value) => setForm((f) => ({
    ...f,
    holidays: f.holidays.map((h, i) => (i === index ? { ...h, [field]: value } : h)),
  }));
  const addHoliday = () => setForm((f) => ({ ...f, holidays: [...f.holidays, { date: '', name: '' }] }));
  const removeHoliday = (index) => setForm((f) => ({ ...f, holidays: f.holidays.filter((_, i) => i !== index) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = form.name_en.trim() || form.name_ar.trim();
    if (!name) { setError(t('common.validation.required')); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        name,
        timezone: form.timezone,
        weekly_off_days: form.weekly_off_days,
        holidays: form.holidays.filter((h) => h.date),
        is_default: form.is_default,
      };
      if (form.name_en.trim()) body.name_en = form.name_en.trim();
      if (form.name_ar.trim()) body.name_ar = form.name_ar.trim();
      const url = isEdit
        ? `${API_URL}/projects/${projectId}/calendars/${calendar.id}`
        : `${API_URL}/projects/${projectId}/calendars`;
      const res = await fetchApi(url, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(body) });
      if (res.success) { onSaved(); onClose(); }
      else setError(messageFor({ error_code: res.error_code, message: res.error }));
    } catch (e) { setError(messageFor(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? t('projects.calendar.edit') : t('projects.calendar.add')}</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="responsive-grid responsive-grid--two" style={{ gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">{t('projects.calendar.nameEn')}</label>
                  <input className="form-input" value={form.name_en}
                    onChange={(e) => handleChange('name_en', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('projects.calendar.nameAr')}</label>
                  <input className="form-input" value={form.name_ar}
                    onChange={(e) => handleChange('name_ar', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('projects.calendar.timezone')}</label>
                <input className="form-input" value={form.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)} />
              </div>

              <div className="form-group">
                <span className="form-label">{t('projects.calendar.weeklyOffDays')}</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {DAY_ORDER.map((day) => (
                    <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                      <input type="checkbox" checked={form.weekly_off_days.includes(day)}
                        onChange={() => toggleDay(day)} />
                      {weekdayName(t, day)}                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <span className="form-label">{t('projects.calendar.holidays')}</span>
                {form.holidays.length === 0 ? (
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                    {t('projects.calendar.offDaysNone')}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {form.holidays.map((holiday, index) => (
                      <div key={index} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input className="form-input" type="date" value={holiday.date}
                          onChange={(e) => setHoliday(index, 'date', e.target.value)} />
                        <input className="form-input" value={holiday.name}
                          onChange={(e) => setHoliday(index, 'name', e.target.value)} />
                        <button type="button" className="btn btn-danger" style={{ padding: '4px 8px' }}
                          onClick={() => removeHoliday(index)}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" className="btn" style={{ padding: '4px 10px', fontSize: '12px', marginTop: '8px' }}
                  onClick={addHoliday}>
                  <Plus size={12} />
                  <span style={{ marginInlineStart: '4px' }}>{t('projects.calendar.addHoliday')}</span>
                </button>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <input type="checkbox" checked={form.is_default}
                    onChange={(e) => handleChange('is_default', e.target.checked)} />
                  {t('projects.calendar.setAsDefault')}
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

export default ProjectCalendars;
