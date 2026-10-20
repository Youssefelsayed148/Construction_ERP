import React, { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '../hooks/useApiClient';
import { apiJson, apiUrl } from '../services/apiClient';
import { useLocale } from '../hooks/useLocale';
import { errorMessage } from '../utils/errorMessage';
import { translateEnum } from '../i18n/enums';
import { BellRing, RefreshCw } from 'lucide-react';

// GET/PUT /api/notifications/preferences (routes/notifications.js) — the
// signed-in user's per event/channel switches. The backend policy (module
// notifications, own rows only) is the enforcement point.
const CHANNELS = ['in_app', 'email', 'push', 'sms', 'whatsapp'];

// The routed event catalog from services/eventDispatcher.js (EVENT_ROUTES +
// NOTIFY_RULES). The API exposes no event-type list, so this finite constant
// is the presentation source; only exactly-routed events are listed because
// preferences match the full event_type (the permit.* / instruction.* /
// mir.* / transmittal.* families are concrete per-record types, not stable
// preference rows). Unknown stored event types fall back to the raw value.
const EVENTS = [
  ['observation.created', 'observationCreated'],
  ['rfi.submitted', 'rfiSubmitted'],
  ['purchase_requisition.approved', 'purchaseRequisitionApproved'],
  ['approval.requested', 'approvalRequested'],
  ['action.overdue', 'actionOverdue'],
  ['invoice.created', 'invoiceCreated'],
  ['invoice.overdue', 'invoiceOverdue'],
  ['invoice.due', 'invoiceDue'],
  ['payment.received', 'paymentReceived'],
  ['purchase_order.issued', 'purchaseOrderIssued'],
  ['purchase_order.approved', 'purchaseOrderApproved'],
  ['purchase_order.rejected', 'purchaseOrderRejected'],
  ['delivery.received', 'deliveryReceived'],
  ['variation.approved', 'variationApproved'],
  ['handover.advanced', 'handoverAdvanced'],
  ['wir.submitted', 'wirSubmitted'],
];

// resolveChannels (services/notificationService.js): without a stored row the
// in-app channel stays on and every other channel is off.
const defaultEnabled = (channel) => channel === 'in_app';

function NotificationPreferences() {
  const { t } = useLocale();
  const apiClient = useApiClient();
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await apiJson(apiUrl('/notifications/preferences'), { headers: { 'Content-Type': 'application/json' } });
      setRows(body?.data?.data || []);
    } catch (e) {
      setRows([]);
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const storedEnabled = (eventType, channel) => {
    const row = (rows || []).find((r) => r.event_type === eventType && r.channel === channel);
    return row ? row.enabled === true : defaultEnabled(channel);
  };

  const toggle = async (eventType, channel) => {
    const enabled = !storedEnabled(eventType, channel);
    setBusy(`${eventType}:${channel}`);
    setError(null);
    try {
      await apiJson(apiUrl('/notifications/preferences'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType, channel, enabled }),
      });
      setRows((current) => {
        const list = current || [];
        const existing = list.find((r) => r.event_type === eventType && r.channel === channel);
        if (existing) return list.map((r) => (r === existing ? { ...r, enabled } : r));
        return [...list, { event_type: eventType, channel, enabled }];
      });
    } catch (e) {
      setError(e);
      await load();
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('notifications.preferences.title')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('notifications.preferences.description')}</p>
        </div>
        <button className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={16} /> {t('notifications.preferences.refresh')}
        </button>
      </div>

      {error && <div className="alert alert-danger" role="alert">{errorMessage(error, t)}</div>}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }} role="status" aria-busy="true"><span className="spinner" /><span className="sr-only">{t('common.loading')}</span></div>
      ) : !error ? (
        <>
          {(rows || []).length === 0 && (
            <p className="alert alert-info" role="note" data-testid="prefs-defaults-note">
              {t('notifications.preferences.defaultsNote')}
            </p>
          )}
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="table preferences-matrix">
              <thead>
                <tr>
                  <th>{t('notifications.preferences.event')}</th>
                  {CHANNELS.map((channel) => (
                    <th key={channel}>{translateEnum(t, 'channel', channel)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EVENTS.map(([eventType, key]) => {
                  const label = t(`notifications.preferences.events.${key}`);
                  return (
                    <tr key={eventType}>
                      <th scope="row">{label}</th>
                      {CHANNELS.map((channel) => {
                        const key = `${eventType}:${channel}`;
                        const checked = storedEnabled(eventType, channel);
                        return (
                          <td key={channel}>
                            <label>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={busy === key || busy.startsWith(`${eventType}:`)}
                                onChange={() => toggle(eventType, channel)}
                                aria-label={`${label} · ${translateEnum(t, 'channel', channel)}`}
                              />
                              <span className="sr-only">{t('notifications.preferences.toggle')}</span>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)' }}>
            <BellRing size={14} aria-hidden="true" /> {t('notifications.preferences.footnote')}
          </p>
        </>
      ) : null}
    </div>
  );
}

export default NotificationPreferences;
