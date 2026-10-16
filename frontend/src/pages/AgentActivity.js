import { formatDateTime } from '../utils/formatters';
import { translateEnum } from '../i18n/enums';
import { apiFetch, apiResponseJson } from '../services/apiClient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, ShieldCheck, ClipboardList, CheckCircle2, XCircle } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';
import LoadMore from '../components/common/LoadMore';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

function headers() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function fetchApi(url, options = {}) {
  const res = await apiFetch(url, { ...options, headers: headers() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return apiResponseJson(res);
}

// Phase 27 — admin "Agent Activity": every MCP tool call with its
// authorization decision and response summary, plus the pending gated
// actions where the agent proposed a high-risk operation and a human with
// the required authority must approve (executes) or reject it.

export default function AgentActivity() {
  const { t } = useLocale();
  const [tab, setTab] = useState('requests');
  const [calls, setCalls] = useState([]);
  const callsLength = useRef(0); callsLength.current = calls.length;
  const [requests, setRequests] = useState([]);
  const requestsLength = useRef(0); requestsLength.current = requests.length;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalCounts, setTotalCounts] = useState({ calls: null, requests: null });
  const [error, setError] = useState(null);
  const [decisionComment, setDecisionComment] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [callsRes, requestsRes] = await Promise.all([
        fetchApi(`${API_URL}/agent/activity?limit=200`),
        fetchApi(`${API_URL}/agent/requests?limit=200`),
      ]);
      setCalls(callsRes.data || []);
      setRequests(requestsRes.data || []);
      setTotalCounts({ calls: callsRes.totalCount ?? null, requests: requestsRes.totalCount ?? null });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async (kind) => {
    setLoadingMore(true);
    try {
      const currentCount = kind === 'calls' ? callsLength.current : requestsLength.current;
      const path = kind === 'calls' ? '/agent/activity' : '/agent/requests';
      const page = await fetchApi(`${API_URL}${path}?limit=200&offset=${currentCount}`);
      if (kind === 'calls') {
        setCalls(current => [...current, ...(page.data || [])]);
        setTotalCounts(current => ({ ...current, calls: page.totalCount ?? null }));
      } else {
        setRequests(current => [...current, ...(page.data || [])]);
        setTotalCounts(current => ({ ...current, requests: page.totalCount ?? null }));
      }
    } catch (e) { setError(e.message); }
    finally { setLoadingMore(false); }
  };

  useEffect(() => { load(); }, [load]);

  const decide = async (id, decision) => {
    try {
      await fetchApi(`${API_URL}/agent/requests/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, comment: decisionComment }),
      });
      setDecisionComment('');
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const pending = (requests || []).filter((r) => !r.decision);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px' }}>
          <Bot size={20} /> {t('agents.system.agentActivity')}
        </h1>
        <button className="btn" onClick={load}>{t('agents.system.refresh')}</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={`btn ${tab === 'requests' ? 'btn-primary' : ''}`} onClick={() => setTab('requests')}>
          <ClipboardList size={14} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
          {t('agents.system.agentRequests')} ({pending.length} {t('agents.system.pending')})
        </button>
        <button className={`btn ${tab === 'calls' ? 'btn-primary' : ''}`} onClick={() => setTab('calls')}>
          {t('agents.system.toolCallLog')}
        </button>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>}

      {!loading && tab === 'requests' && (
        <>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>{t('agents.system.tool')}</th><th>{t('agents.system.user')}</th>
                <th>{t('agents.system.status')}</th><th>{t('agents.system.requiredApprover')}</th>
                <th>{t('agents.system.reason')}</th><th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>
                  {t('agents.system.noAgentRequestsYet')}
                </td></tr>
              )}
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td style={{ fontWeight: 500 }}>{r.tool}</td>
                  <td>{r.requesting_user_name || `#${r.requesting_user_id}`}</td>
                  <td>
                    <span className={`badge ${r.decision === 'approved' ? 'badge-success' : r.decision === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                      {r.decision ? translateEnum(t, 'status', r.execution_status || r.decision) : (r.execution_status === 'draft' ? (t('agents.system.draft')) : (t('agents.system.awaitingApproval')))}
                    </span>
                  </td>
                  <td>{translateEnum(t, 'role', r.required_approver_role)}</td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!r.decision && (
                      <>
                        <button className="btn btn-primary" style={{ padding: '4px 10px', marginRight: 4 }} onClick={() => decide(r.id, 'approve')}>
                          <CheckCircle2 size={14} /> {r.execution_status === 'draft' ? (t('agents.system.apply')) : (t('agents.system.approveExecute'))}
                        </button>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => decide(r.id, 'reject')}>
                          <XCircle size={14} /> {t('agents.system.reject')}
                        </button>
                        <input
                          value={decisionComment}
                          onChange={(e) => setDecisionComment(e.target.value)}
                          placeholder={t('agents.system.commentOptional')}
                          style={{ marginLeft: 6, padding: '3px 8px', fontSize: 12, width: 160 }}
                        />
                      </>
                    )}
                    {r.decision === 'approved' && r.executed_transaction_id && (
                      <span style={{ fontSize: 12 }}>{t('agents.system.tx')}{r.executed_transaction_id}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LoadMore loadedCount={requests.length} totalCount={totalCounts.requests} loading={loadingMore} t={t} onLoadMore={() => loadMore('requests')} />
        </>
      )}

      {!loading && tab === 'calls' && (
        <>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('agents.system.time')}</th><th>{t('agents.system.tool')}</th>
                <th>{t('agents.system.risk')}</th><th>{t('agents.system.user2')}</th>
                <th>{t('agents.system.authorized')}</th>
                <th>{t('agents.system.response')}</th>
                <th>{t('agents.system.session')}</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>{t('agents.system.noToolCallsYet')}</td></tr>}
              {calls.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: 12 }}>{formatDateTime(c.created_at)}</td>
                  <td style={{ fontWeight: 500 }}>{c.tool}</td>
                  <td><span className="badge badge-info">{c.risk}</span></td>
                  <td>{c.user_name || `#${c.user_id}`}</td>
                  <td>{c.authorized ? '✓' : '✗'}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{c.response_summary || '-'}</td>
                  <td style={{ fontSize: 12 }}>{c.agent_session || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <LoadMore loadedCount={calls.length} totalCount={totalCounts.calls} loading={loadingMore} t={t} onLoadMore={() => loadMore('calls')} />
        </>
      )}

      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.7, display: 'flex', gap: 8, alignItems: 'center' }}>
        <ShieldCheck size={14} />
        {t('agents.system.everyToolCallRunsTheSamePermissionEngineAsThe')}
      </div>
    </div>
  );
}
