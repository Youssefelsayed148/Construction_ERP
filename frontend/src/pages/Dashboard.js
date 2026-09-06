import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { dashboardApi } from '../services/api';
import { formatNumber } from '../utils/formatters';
import { Briefcase, Users, Package, Wrench, CheckCircle, AlertTriangle, CalendarDays, MessageSquareWarning, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '../utils/formatters';

const API_URL = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api`;

function Dashboard() {
  const { t, locale } = useLocale();
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    Promise.all([
      dashboardApi.getStats().catch(() => null),
      fetch(`${API_URL}/dashboard/alerts`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/finance/summary`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).catch(() => null),
    ])
      .then(([statsRes, alertsRes, financeRes]) => {
        if (statsRes?.success) setStats(statsRes.data || statsRes);
        if (alertsRes?.success) setAlerts(alertsRes.data);
        if (financeRes?.success) setFinanceSummary(financeRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const statCards = [
    { icon: Briefcase, label: t('common.nav.projects'), value: stats?.projects || 0, color: 'var(--color-accent)' },
    { icon: Users, label: t('common.nav.clients'), value: stats?.clients || 0, color: 'var(--color-success)' },
    { icon: Package, label: t('common.nav.inventory'), value: stats?.items || 0, color: 'var(--color-warning)' },
    { icon: Wrench, label: t('common.nav.assets'), value: stats?.assets || 0, color: 'var(--color-text-secondary)' },
  ];

  const alertCount = alerts
    ? (alerts.low_stock?.length || 0) + (alerts.overdue_milestones?.length || 0) +
      (alerts.budget_overruns?.length || 0) + (alerts.stale_site_reports?.length || 0) +
      (alerts.overdue_rfis?.length || 0)
    : 0;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('common.nav.dashboard')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {t('common.welcome')}
          </p>
        </div>
      </div>

      <div className="level-line" />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <span className="spinner" />
        </div>
      ) : (
        <>
          <div className="stats-grid">
            {statCards.map((card, i) => (
              <div className="stat-card" key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <card.icon size={24} style={{ color: card.color }} />
                  <span className="stat-label">{card.label}</span>
                </div>
                <div className="stat-value">{formatNumber(card.value)}</div>
              </div>
            ))}
          </div>

          {alertCount > 0 && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <h3 className="card-title">
                  <AlertTriangle size={18} style={{ color: 'var(--color-warning)', marginRight: '8px' }} />
                  {locale === 'ar' ? 'تنبيهات' : 'Alerts'} ({alertCount})
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(alerts.stale_site_reports || []).map(p => (
                  <Link key={`sr-${p.id}`} to={`/projects/${p.id}/site`} style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                      <CalendarDays size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                      <span style={{ color: 'var(--color-text-primary)' }}>
                        {locale === 'ar'
                          ? `${p.name}: لم يتم تقديم تقرير موقع منذ يومين أو أكثر`
                          : `${p.name}: no site report filed in 2+ days`}
                        {p.last_report_date ? ` (${locale === 'ar' ? 'آخر تقرير' : 'last'}: ${new Date(p.last_report_date).toLocaleDateString()})` : ''}
                      </span>
                    </div>
                  </Link>
                ))}
                {(alerts.overdue_rfis || []).map(r => (
                  <div key={`rfi-${r.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                    <MessageSquareWarning size={14} style={{ color: 'var(--color-danger, #e5534b)', flexShrink: 0 }} />
                    <span>
                      {r.rfi_number} — {r.subject} ({r.project_name}):{' '}
                      {locale === 'ar' ? 'متأخر عن موعده' : 'overdue'} ({new Date(r.due_date).toLocaleDateString()})
                    </span>
                  </div>
                ))}
                {(alerts.overdue_milestones || []).map(m => (
                  <div key={`ms-${m.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                    <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                    <span>{m.title_en || m.title_ar || m.title} ({m.project_name}): {locale === 'ar' ? 'معلم متأخر' : 'milestone overdue'}</span>
                  </div>
                ))}
                {(alerts.budget_overruns || []).map(p => (
                  <div key={`bo-${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                    <AlertTriangle size={14} style={{ color: 'var(--color-danger, #e5534b)', flexShrink: 0 }} />
                    <span>{p.name}: {locale === 'ar' ? 'تجاوز الميزانية' : 'over budget'}</span>
                  </div>
                ))}
                {(alerts.low_stock || []).map(s => (
                  <div key={`ls-${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: '13px' }}>
                    <Package size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                    <span>{s.name_en || s.name_ar} ({s.warehouse_name}): {locale === 'ar' ? 'مخزون منخفض' : 'low stock'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <DollarSign size={18} style={{ color: 'var(--color-accent)', marginRight: '8px' }} />
                  {locale === 'ar' ? 'الملخص المالي' : 'Finance Summary'}
                </h3>
              </div>
              {financeSummary ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>{locale === 'ar' ? 'الإيرادات المحصلة' : 'Revenue Collected'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-success)', fontFamily: 'monospace' }}>
                      {formatCurrency(financeSummary.total_revenue_collected)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>{locale === 'ar' ? 'المصروفات' : 'Expenses'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-danger)', fontFamily: 'monospace' }}>
                      {formatCurrency(financeSummary.total_expenses)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span>{locale === 'ar' ? 'المستحقات' : 'Outstanding'}</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-warning)', fontFamily: 'monospace' }}>
                      {formatCurrency(financeSummary.total_outstanding)}
                    </span>
                  </div>
                  <div className="level-line" style={{ margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ fontWeight: 600 }}>{locale === 'ar' ? 'صافي الربح' : 'Net Profit'}</span>
                    <span style={{
                      fontWeight: 700, fontFamily: 'monospace',
                      color: (financeSummary.net_profit || 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)'
                    }}>
                      {(financeSummary.net_profit || 0) >= 0 ? <TrendingUp size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> : <TrendingDown size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
                      {formatCurrency(financeSummary.net_profit)}
                    </span>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                  {locale === 'ar' ? 'لا توجد بيانات مالية بعد.' : 'No financial data yet.'}
                </p>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <CheckCircle size={18} style={{ color: 'var(--color-success)', marginRight: '8px' }} />
                  System Status
                </h3>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                Database: construction_erp<br />
                API: {process.env.REACT_APP_API_URL || 'http://localhost:5000'}
              </p>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                <span className="badge badge-success">Connected</span>
                <span className="badge badge-info">PostgreSQL</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Dashboard;
