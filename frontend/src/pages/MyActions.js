import { formatDate as sharedDate } from '../utils/formatters';
import { translateEnum } from '../i18n/enums';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocale } from '../hooks/useLocale';
import { errorMessage } from '../utils/errorMessage';
import LoadMore from '../components/common/LoadMore';
import {
  AlertTriangle, CalendarClock, Clock, CircleCheck, Forward,
  Inbox, Bell,
} from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

const headers = () => {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
};

const fetchApi = (url, options) => apiFetch(url, { headers: headers(), ...options }).then(r => {
  if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Request failed'); });
  return apiResponseJson(r);
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

const formatDate = sharedDate;

class ActionsBoundary extends React.Component {
  state = { failed: false, attempt: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="page-container" role="alert">
      <h1>{this.props.t('actions.title')}</h1>
      <p>{this.props.t('actions.system.displayFailed')}</p>
      <button className="btn btn-primary" onClick={() => this.setState(state => ({ failed: false, attempt: state.attempt + 1 }))}>
        {this.props.t('actions.system.retry')}
      </button>
    </div>;
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

export default function MyActions() {
  const { t } = useLocale();
  return <ActionsBoundary t={t}><MyActionsContent /></ActionsBoundary>;
}

function MyActionsContent() {
  const { locale, t } = useLocale();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bucket, setBucket] = useState('overdue');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [notifications, setNotifications] = useState([]);
  const notificationsLength = useRef(0); notificationsLength.current = notifications.length;
  const [notificationsTotalCount, setNotificationsTotalCount] = useState(null);
  const [loadingMoreNotifications, setLoadingMoreNotifications] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [actionsRes, notifRes] = await Promise.all([
        fetchApi(`${API_URL}/actions/my`),
        fetchApi(`${API_URL}/notifications?limit=200&offset=0`),
      ]);
      setData(actionsRes);
      setNotifications(notifRes.data || []);
      setNotificationsTotalCount(notifRes.totalCount ?? null);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMoreNotifications = async () => {
    setLoadingMoreNotifications(true);
    try {
      const result = await fetchApi(`${API_URL}/notifications?limit=200&offset=${notificationsLength.current}`);
      setNotifications(current => [...current, ...(result.data || [])]);
      setNotificationsTotalCount(result.totalCount ?? null);
    } catch (e) { setError(e); }
    finally { setLoadingMoreNotifications(false); }
  };

  useEffect(() => { load(); }, [load]);

  const act = async (id, action, body) => {
    try {
      await fetchApi(`${API_URL}/actions/${id}/${action}`, { method: 'POST', body: JSON.stringify(body || {}) });
      await load();
    } catch (e) {
      setError(e);
    }
  };

  const markRead = async (id) => {
    try {
      await fetchApi(`${API_URL}/notifications/${id}/read`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e);
    }
  };

  const buckets = data?.buckets || {};
  const items = (buckets[bucket] || []).filter(
    (i) => priorityFilter === 'all' || i.priority === priorityFilter
  );

  const L = {
    title: t('actions.myActions.title'),
    overdue: t('actions.myActions.overdue'), due_today: t('actions.myActions.dueToday'), due_soon: t('actions.myActions.dueSoon'),
    awaiting_me: t('actions.myActions.awaitingMe'), delegated: t('actions.myActions.delegated'), recently_completed: t('actions.myActions.recentlyCompleted'),
    priority: t('actions.myActions.priority'), all: t('actions.myActions.all'), due: t('actions.myActions.due'), noDue: t('actions.myActions.noDue'),
    acknowledge: t('actions.myActions.acknowledge'), complete: t('actions.myActions.complete'), empty: t('actions.myActions.empty'),
    source: t('actions.myActions.source'), status: t('actions.myActions.status'), delegated_to: t('actions.myActions.delegatedTo'),
    notifications: t('actions.myActions.notifications'), markRead: t('actions.myActions.markRead'), noNotifs: t('actions.myActions.noNotifs'),
  };

  return (
    <div className="page-container">
      <h1>{L.title}</h1>
      {error && <div style={{ color: '#b91c1c', marginBottom: 12 }}>{errorMessage(error, t)}</div>}

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
            {p === 'all' ? L.all : translateEnum(t, 'priority', p)}
          </button>
        ))}
      </div>

      {loading ? (
        <div>{t('actions.system.loading')}</div>
      ) : (
        <div className="card">
          <div className="card-header"><span className="card-title">{L[bucket]}</span></div>
          {items.length === 0 && <div style={{ padding: 16 }}>{L.empty}</div>}
          <div className="table-container"><table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}>
                  <td style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      {L.source}: {translateEnum(t, 'entityType', item.source_type)}
                      {item.source_id != null ? ` #${item.source_id}` : ''}
                      {' · '}{L.status}: {translateEnum(t, 'status', item.status)}
                      {item.delegated_to_user_id != null && Number(item.delegated_to_user_id) !== Number(item.assigned_user_id) ? ` · ${L.delegated_to} #${item.delegated_to_user_id}` : ''}
                    </div>
                  </td>
                  <td style={{ padding: 12, whiteSpace: 'nowrap' }}>
                    <span style={{ ...PRIORITY_STYLES[item.priority] || {}, fontWeight: 700 }}>{translateEnum(t, 'priority', item.priority)}</span>
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
          </table></div>
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
        <LoadMore loadedCount={notifications.length} totalCount={notificationsTotalCount} loading={loadingMoreNotifications} t={t} onLoadMore={loadMoreNotifications} />
      </div>
    </div>
  );
}
