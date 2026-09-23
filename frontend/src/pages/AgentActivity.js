import React, { useCallback, useEffect, useState } from 'react';
import { Bot, ShieldCheck, ClipboardList, CheckCircle2, XCircle } from 'lucide-react';
import { useLocale } from '../hooks/useLocale';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function headers() {
  const token = localStorage.getItem('token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function fetchApi(url, options = {}) {
  const res = await fetch(url, { ...options, headers: headers() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// Phase 27 — admin "Agent Activity": every MCP tool call with its
// authorization decision and response summary, plus the pending gated
// actions where the agent proposed a high-risk operation and a human with
// the required authority must approve (executes) or reject it.

export default function AgentActivity() {
  const { locale, t } = useLocale();
  const [tab, setTab] = useState('requests');
  const [calls, setCalls] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
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
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

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
          <Bot size={20} /> {locale === 'ar' ? 'نشاط الوكلاء' : 'Agent Activity'}
        </h1>
        <button className="btn" onClick={load}>{locale === 'ar' ? 'تحديث' : 'Refresh'}</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button className={`btn ${tab === 'requests' ? 'btn-primary' : ''}`} onClick={() => setTab('requests')}>
          <ClipboardList size={14} style={{ verticalAlign: '-2px', marginInlineEnd: 4 }} />
          {locale === 'ar' ? 'طلبات الوكلاء' : 'Agent requests'} ({pending.length} {locale === 'ar' ? 'معلق' : 'pending'})
        </button>
        <button className={`btn ${tab === 'calls' ? 'btn-primary' : ''}`} onClick={() => setTab('calls')}>
          {locale === 'ar' ? 'سجل استدعاءات الأدوات' : 'Tool call log'}
        </button>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
      {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><span className="spinner" /></div>}

      {!loading && tab === 'requests' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th><th>{locale === 'ar' ? 'الأداة' : 'Tool'}</th><th>{locale === 'ar' ? 'مستخدم' : 'User'}</th>
                <th>{locale === 'ar' ? 'الحالة' : 'Status'}</th><th>{locale === 'ar' ? 'مطلوب موافقة' : 'Required approver'}</th>
                <th>{locale === 'ar' ? 'السبب' : 'Reason'}</th><th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>
                  {locale === 'ar' ? 'لا توجد طلبات وكلاء بعد.' : 'No agent requests yet.'}
                </td></tr>
              )}
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td style={{ fontWeight: 500 }}>{r.tool}</td>
                  <td>{r.requesting_user_name || `#${r.requesting_user_id}`}</td>
                  <td>
                    <span className={`badge ${r.decision === 'approved' ? 'badge-success' : r.decision === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                      {r.decision ? (r.execution_status || r.decision) : (r.execution_status === 'draft' ? (locale === 'ar' ? 'مسودة' : 'draft') : (locale === 'ar' ? 'بانتظار الموافقة' : 'awaiting approval'))}
                    </span>
                  </td>
                  <td>{r.required_approver_role}</td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!r.decision && (
                      <>
                        <button className="btn btn-primary" style={{ padding: '4px 10px', marginRight: 4 }} onClick={() => decide(r.id, 'approve')}>
                          <CheckCircle2 size={14} /> {r.execution_status === 'draft' ? (locale === 'ar' ? 'تطبيق' : 'Apply') : (locale === 'ar' ? 'اعتماد وتنفيذ' : 'Approve & execute')}
                        </button>
                        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => decide(r.id, 'reject')}>
                          <XCircle size={14} /> {locale === 'ar' ? 'رفض' : 'Reject'}
                        </button>
                        <input
                          value={decisionComment}
                          onChange={(e) => setDecisionComment(e.target.value)}
                          placeholder={locale === 'ar' ? 'تعليق (اختياري)' : 'comment (optional)'}
                          style={{ marginLeft: 6, padding: '3px 8px', fontSize: 12, width: 160 }}
                        />
                      </>
                    )}
                    {r.decision === 'approved' && r.executed_transaction_id && (
                      <span style={{ fontSize: 12 }}>tx #{r.executed_transaction_id}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'calls' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{locale === 'ar' ? 'الوقت' : 'Time'}</th><th>{locale === 'ar' ? 'الأداة' : 'Tool'}</th>
                <th>{locale === 'ar' ? 'النوع' : 'Risk'}</th><th>{locale === 'ar' ? 'المستخدم' : 'User'}</th>
                <th>{locale === 'ar' ? 'مصرح؟' : 'Authorized'}</th>
                <th>{locale === 'ar' ? 'الاستجابة' : 'Response'}</th>
                <th>{locale === 'ar' ? 'الجلسة' : 'Session'}</th>
              </tr>
            </thead>
            <tbody>
              {calls.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>{locale === 'ar' ? 'لا توجد استدعاءات بعد.' : 'No tool calls yet.'}</td></tr>}
              {calls.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: 12 }}>{new Date(c.created_at).toLocaleString()}</td>
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
      )}

      <div style={{ marginTop: 16, fontSize: 13, opacity: 0.7, display: 'flex', gap: 8, alignItems: 'center' }}>
        <ShieldCheck size={14} />
        {locale === 'ar'
          ? 'كل استدعاء أداة يمر بنفس محرك الصلاحيات الذي تستخدمه الواجهة؛ الإجراءات عالية المخاطر لا تُنفذ إلا بعد موافقة بشرية.'
          : 'Every tool call runs the same permission engine as the UI; high-risk actions execute only after a human approval.'}
      </div>
    </div>
  );
}
