import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from '../hooks/useLocale';
import {
  AlertTriangle, CalendarClock, Clock, CircleCheck, Forward,
  Inbox, Bell,
} from 'lucide-react';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => fetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return r.json();
});

const PRIORITY_STYLES = {
  critical: { color: '#b91c1c', fontWeight: 700 },
  high: { color: '#c2410c' },
  medium: { color: '#a16207' },
  low: { color: '#4d7c0f' },
};

const BUCKET_ORDER = ['overdue', 'due_today', 'due_soon', 'awaiting_me', 'delegated', 'recently_completed'];

const BUCKET_ICONS = {
  overdue: AlertTriangle,
  due_today: CalendarClock,
  due_soon: Clock,
  awaiting_me: Inbox,
  delegated: Forward,
  recently_completed: CircleCheck,
};

function formatDate(iso, locale) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MyActions() {
  const { locale } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bucket, setBucket] = useState('overdue');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actionsRes, notifRes] = await Promise.all([
        fetchApi(`${API_URL}/actions/my`),
        fetchApi(`${API_URL}/notifications?limit=10`),
      ]);
      setData(actionsRes);
      setNotifications(notifRes.data || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id, action, body) => {
    try {
      await fetchApi(`${API_URL}/actions/${id}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const markRead = async (id) => {
    try {
      await fetchApi(`${API_URL}/notifications/${id}/read`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  const buckets = data?.buckets || {};
  const items = (buckets[bucket] || []).filter(
    (i) => priorityFilter === 'all' || i.priority === priorityFilter
  );

  const L = {
    en: {
      title: 'My Actions',
      overdue: 'Overdue', due_today: 'Due Today', due_soon: 'Due Soon',
      awaiting_me: 'Awaiting Me', delegated: 'Delegated', recently_completed: 'Recently Completed',
      priority: 'Priority', all: 'All', due: 'Due', noDue: 'No due date',
      acknowledge: 'Acknowledge', complete: 'Complete', empty: 'Nothing here.',
      source: 'Source', status: 'Status', delegated_to: 'Delegated to',
      notifications: 'Notifications', markRead: 'Mark read', noNotifs: 'No notifications.',
    },
    ar: {
      title: 'مهامي',
      overdue: 'متأخرة', due_today: 'تستحق اليوم', due_soon: 'تستحق قريباً',
      awaiting_me: 'بانتظاري', delegated: 'مُوكلة', recently_completed: 'منجزة حديثاً',
      priority: 'الأولوية', all: 'الكل', due: 'تستحق', noDue: 'بدون موعد',
      acknowledge: 'إقرار', complete: 'إنجاز', empty: 'لا يوجد شيء هنا.',
      source: 'المصدر', status: 'الحالة', delegated_to: 'مُوكلة إلى',
      notifications: 'الإشعارات', markRead: 'تحديد كمقروء', noNotifs: 'لا إشعارات.',
    },
  }[locale === 'ar' ? 'ar' : 'en'];

  return (
    <div className="page-container">
      <h1>{L.title}</h1>
      {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>}

      {/* Bucket tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {BUCKET_ORDER.map((key) => {
          const Icon = BUCKET_ICONS[key];
          const active = bucket === key;
          return (
            <button
              key={key}
              onClick={() => setBucket(key)}
              className={active ? 'btn btn-primary' : 'btn btn-outline'}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon size={16} />
              {L[key]} ({(buckets[key] || []).length})
            </button>
          );
        })}
      </div>

      {/* Priority filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span>{L.priority}:</span>
        {['all', 'critical', 'high', 'medium', 'low'].map((p) => (
          <button
            key={p}
            onClick={() => setPriorityFilter(p)}
            className={priorityFilter === p ? 'btn btn-primary' : 'btn btn-outline'}
          >
            {p === 'all' ? L.all : p}
          </button>
        ))}
      </div>

      {loading ? (
        <div>{locale === 'ar' ? 'جار التحميل...' : 'Loading...'}</div>
      ) : (
        <div className="card">
          <div className="card-header"><span className="card-title">{L[bucket]}</span></div>
          {items.length === 0 && <div style={{ padding: 16 }}>{L.empty}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      {L.source}: {item.source_type}
                      {item.source_id != null ? ` #${item.source_id}` : ''}
                      {' · '}{L.status}: {item.status}
                      {item.delegated_to_user_id != null && Number(item.delegated_to_user_id) !== Number(item.assigned_user_id) ? ` · ${L.delegated_to} #${item.delegated_to_user_id}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                    <span style={{ ...PRIORITY_STYLES[item.priority] || {}, fontWeight: 700 }}>{item.priority}</span>
                  </td>
                  <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                    {item.due_date ? `${L.due}: ${formatDate(item.due_date, locale)}` : L.noDue}
                  </td>
                  <td style={{ padding: 12, whiteSpace: 'nowrap', textAlign: 'end' }}>
                    {!item.acknowledged_at && item.assigned_user_id && (
                      <button className="btn btn-outline" style={{ marginRight: 6 }} onClick={() => act(item.id, 'acknowledge')}>
                        {L.acknowledge}
                      </button>
                    )}
                    {(item.status === 'open' || item.status === 'in_progress') && (
                      <button className="btn btn-success" onClick={() => act(item.id, 'complete')}>
                        {L.complete}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notifications inbox */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <span className="card-title"><Bell size={16} style={{ display: 'inline', marginRight: 6 }} />{L.notifications}</span>
        </div>
        {notifications.length === 0 ? (
          <div style={{ padding: 16 }}>{L.noNotifs}</div>
        ) : (
          <div>
            {notifications.map((n) => (
              <div key={n.id} style={{ padding: 12, borderTop: '1px solid var(--color-border, #e5e7eb)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: n.status === 'unread' ? 700 : 400 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, opacity: 0.8 }}>{n.body}</div>}
                  <div style={{ fontSize: 11, opacity: 0.6 }}>{formatDate(n.created_at, locale)}</div>
                </div>
                {n.status === 'unread' && (
                  <button className="btn btn-outline" onClick={() => markRead(n.id)}>{L.markRead}</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
