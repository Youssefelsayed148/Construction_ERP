import { apiFetch } from '../services/apiClient';
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLocale } from '../hooks/useLocale';
import { dashboardApi } from '../services/api';
import { formatNumber, formatCurrency, formatDate, formatPercent } from '../utils/formatters';
import { translateRole } from '../i18n/enums';
import {
  Briefcase, Users, Package, Wrench, AlertTriangle, CalendarDays, MessageSquareWarning,
  DollarSign, TrendingUp, TrendingDown, Receipt, Truck, Shield, ClipboardList, ChevronRight,
} from 'lucide-react';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

function Dashboard() {
  const { t, locale } = useLocale();
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [overview, setOverview] = useState(null);
  const [roleDash, setRoleDash] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const authGet = (path) =>
      apiFetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .catch(() => null);

    Promise.all([
      dashboardApi.getStats().catch(() => null),
      authGet('/dashboard/alerts'),
      authGet('/finance/summary'),
      authGet('/dashboard/overview'),
      authGet('/dashboard/role'),
    ])
      .then(([statsRes, alertsRes, financeRes, overviewRes, roleRes]) => {
        if (statsRes?.success) setStats(statsRes.data || statsRes);
        if (alertsRes?.success) setAlerts(alertsRes.data);
        if (financeRes?.success) setFinanceSummary(financeRes.data);
        if (overviewRes?.success) setOverview(overviewRes.data);
        if (roleRes?.success) setRoleDash(roleRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const health = overview?.health;
  const mods = overview?.modules;

  // Health row — falls back to the flat /dashboard counts if /overview is unavailable.
  const healthCards = [
    {
      icon: Briefcase,
      label: t('dashboard.system.activeProjects'),
      value: health ? `${formatNumber(health.projects_active)} / ${formatNumber(health.projects_total)}` : formatNumber(stats?.projects || 0),
      color: 'var(--color-accent)',
    },
    {
      icon: AlertTriangle,
      label: t('dashboard.system.projectsAtRisk'),
      value: formatNumber(health?.projects_at_risk || 0),
      color: (health?.projects_at_risk || 0) > 0 ? 'var(--color-danger, #e5534b)' : 'var(--color-success)',
    },
    {
      icon: TrendingUp,
      label: t('dashboard.system.netProfit'),
      value: formatCurrency(health ? health.net_profit : financeSummary?.net_profit),
      color: (health?.net_profit ?? financeSummary?.net_profit ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger, #e5534b)',
    },
    {
      icon: DollarSign,
      label: t('dashboard.system.outstanding'),
      value: formatCurrency(health ? health.total_outstanding : financeSummary?.total_outstanding),
      color: 'var(--color-warning)',
    },
    {
      icon: ClipboardList,
      label: t('dashboard.system.pendingApprovals'),
      value: formatNumber(health?.pending_approvals || 0),
      color: (health?.pending_approvals || 0) > 0 ? 'var(--color-warning)' : 'var(--color-success)',
    },
    {
      icon: AlertTriangle,
      label: t('dashboard.system.openAlerts'),
      value: formatNumber(alertCountOf(alerts)),
      color: alertCountOf(alerts) > 0 ? 'var(--color-warning)' : 'var(--color-success)',
    },
  ];

  // One compact strip per module. Each links into its module; metrics stay to 3.
  const stripDefs = mods ? [
    {
      to: '/projects', icon: Briefcase, label: t('common.nav.projects'),
      metrics: [
        { label: t('dashboard.system.active'), value: mods.projects.active },
        { label: t('dashboard.system.planning'), value: mods.projects.planning },
        { label: t('dashboard.system.avgDone'), value: formatPercent(mods.projects.avg_completion, locale) },
        { label: t('dashboard.system.atRisk'), value: mods.projects.at_risk, warn: mods.projects.at_risk > 0 },
      ],
    },
    {
      to: '/invoices', icon: DollarSign, label: t('dashboard.system.finance'),
      metrics: [
        { label: t('dashboard.system.collected'), value: formatCurrency(mods.finance.revenue_collected) },
        { label: t('dashboard.system.expenses'), value: formatCurrency(mods.finance.total_expenses) },
        { label: t('dashboard.system.outstanding2'), value: formatCurrency(mods.finance.outstanding) },
        { label: t('dashboard.system.overdueInv'), value: mods.finance.overdue_invoices, warn: mods.finance.overdue_invoices > 0 },
      ],
    },
    {
      to: '/invoices', icon: Receipt, label: t('common.nav.invoices'),
      metrics: [
        { label: t('dashboard.system.total'), value: mods.invoices.total },
        { label: t('dashboard.system.sent'), value: mods.invoices.sent },
        { label: t('dashboard.system.paid'), value: mods.invoices.paid },
        { label: t('dashboard.system.overdue'), value: mods.invoices.overdue, warn: mods.invoices.overdue > 0 },
      ],
    },
    {
      to: '/expenses', icon: DollarSign, label: t('common.nav.expenses'),
      metrics: [
        { label: t('dashboard.system.thisMonth'), value: formatCurrency(mods.expenses.month_total) },
        { label: t('dashboard.system.pending'), value: mods.expenses.pending, warn: mods.expenses.pending > 0 },
      ],
    },
    {
      to: '/inventory', icon: Package, label: t('common.nav.inventory'),
      metrics: [
        { label: t('dashboard.system.items'), value: mods.inventory.items },
        { label: t('dashboard.system.warehouses'), value: mods.inventory.warehouses },
        { label: t('dashboard.system.lowStock'), value: mods.inventory.low_stock, warn: mods.inventory.low_stock > 0 },
      ],
    },
    {
      to: '/hr', icon: Users, label: t('common.nav.hr'),
      metrics: [
        { label: t('dashboard.system.activeStaff'), value: mods.hr.active_employees },
        { label: t('dashboard.system.presentToday'), value: mods.hr.present_today },
        { label: t('dashboard.system.pendingLeave'), value: mods.hr.pending_leaves, warn: mods.hr.pending_leaves > 0 },
      ],
    },
    {
      to: '/assets', icon: Wrench, label: t('common.nav.assets'),
      metrics: [
        { label: t('dashboard.system.total2'), value: mods.assets.total },
        { label: t('dashboard.system.active2'), value: mods.assets.active },
        { label: t('dashboard.system.maintDue'), value: mods.assets.maintenance_due, warn: mods.assets.maintenance_due > 0 },
      ],
    },
    {
      to: '/suppliers', icon: Truck, label: t('common.nav.suppliers'),
      metrics: [
        { label: t('dashboard.system.suppliers'), value: mods.suppliers.suppliers },
        { label: t('dashboard.system.subcontractors'), value: mods.suppliers.subcontractors },
      ],
    },
    {
      to: '/clients', icon: Users, label: t('common.nav.clients'),
      metrics: [
        { label: t('dashboard.system.activeClients'), value: mods.clients.total },
      ],
    },
    {
      to: '/legal', icon: Shield, label: t('common.nav.legal'),
      metrics: [
        { label: t('dashboard.system.documents'), value: mods.legal.total },
        { label: t('dashboard.system.pending2'), value: mods.legal.pending, warn: mods.legal.pending > 0 },
      ],
    },
    {
      to: '/approvals', icon: ClipboardList, label: t('common.nav.approvals'),
      metrics: [
        { label: t('dashboard.system.pending3'), value: mods.approvals.pending, warn: mods.approvals.pending > 0 },
        { label: t('dashboard.system.awaitingOwner'), value: mods.approvals.awaiting_owner, warn: mods.approvals.awaiting_owner > 0 },
        { label: t('dashboard.system.oldestDays'), value: mods.approvals.oldest_days, warn: mods.approvals.oldest_days > 7 },
      ],
    },
  ] : [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>{t('common.nav.dashboard')}</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>{t('common.welcome')}</p>
        </div>
      </div>

      <div className="level-line" />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <span className="spinner" />
        </div>
      ) : (
        <>
          {/* Phase 23: the per-role widget strip (all 16 roles; the owner strip
              extends /overview above). Zero records render empty cards. */}
          <RoleDashboardSection dash={roleDash} />

          <div className="stats-grid">
            {healthCards.map((card, i) => (
              <div className="stat-card" key={i}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <card.icon size={22} style={{ color: card.color }} />
                  <span className="stat-label">{card.label}</span>
                </div>
                <div className="stat-value" style={{ fontSize: '20px' }}>{card.value}</div>
              </div>
            ))}
          </div>

          {alertCountOf(alerts) > 0 && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <h3 className="card-title">
                  <AlertTriangle size={18} style={{ color: 'var(--color-warning)', marginRight: '8px' }} />
                  {t('dashboard.system.alerts')} ({alertCountOf(alerts)})
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(alerts.stale_site_reports || []).map((p) => (
                  <Link key={`sr-${p.id}`} to={`/projects/${p.id}/site`} style={{ textDecoration: 'none' }}>
                    <div style={rowStyle}>
                      <CalendarDays size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                      <span style={{ color: 'var(--color-text-primary)' }}>
                        <bdi>{p.name}</bdi>: {t('dashboard.system.noSiteReport')}
                        {p.last_report_date && <> ({t('dashboard.system.last')}: <bdi>{formatDate(p.last_report_date, locale)}</bdi>)</>}
                      </span>
                    </div>
                  </Link>
                ))}
                {(alerts.overdue_rfis || []).map((r) => (
                  <div key={`rfi-${r.id}`} style={rowStyle}>
                    <MessageSquareWarning size={14} style={{ color: 'var(--color-danger, #e5534b)', flexShrink: 0 }} />
                    <span>
                      {r.rfi_number} — {r.subject} ({r.project_name}): {t('dashboard.system.overdue2')} ({formatDate(r.due_date, locale)})
                    </span>
                  </div>
                ))}
                {(alerts.overdue_milestones || []).map((m) => (
                  <div key={`ms-${m.id}`} style={rowStyle}>
                    <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                    <span>{m.title_en || m.title_ar || m.title} ({m.project_name}): {t('dashboard.system.milestoneOverdue')}</span>
                  </div>
                ))}
                {(alerts.budget_overruns || []).map((p) => (
                  <div key={`bo-${p.id}`} style={rowStyle}>
                    <AlertTriangle size={14} style={{ color: 'var(--color-danger, #e5534b)', flexShrink: 0 }} />
                    <span>{p.name}: {t('dashboard.system.overBudget')}</span>
                  </div>
                ))}
                {(alerts.low_stock || []).map((s) => (
                  <div key={`ls-${s.id}`} style={rowStyle}>
                    <Package size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                    <span>{s.name_en || s.name_ar} ({s.warehouse_name}): {t('dashboard.system.lowStock')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stripDefs.length > 0 && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <h3 className="card-title">{t('dashboard.system.moduleSummary')}</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stripDefs.map((s) => (
                  <Link
                    key={s.to + s.label}
                    to={s.to}
                    style={{
                      textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center',
                      gap: '12px', padding: '10px 4px', borderBottom: '1px solid var(--color-surface-raised)',
                    }}
                  >
                    <s.icon size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: '13px', minWidth: '110px' }}>{s.label}</span>
                    <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', flex: 1 }}>
                      {s.metrics.map((m, i) => (
                        <span key={i} style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                          {m.label}:{' '}
                          <strong style={{ color: m.warn ? 'var(--color-danger, #e5534b)' : 'var(--color-text-primary)', fontFamily: 'monospace', unicodeBidi: 'isolate' }}>
                            {typeof m.value === 'number' ? formatNumber(m.value) : m.value}
                          </strong>
                        </span>
                      ))}
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <DollarSign size={18} style={{ color: 'var(--color-accent)', marginRight: '8px' }} />
                {t('dashboard.system.financeSummary')}
              </h3>
            </div>
            {financeSummary ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '460px' }}>
                <div style={lineStyle}>
                  <span>{t('dashboard.system.revenueCollected')}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-success)', fontFamily: 'monospace', unicodeBidi: 'isolate' }}>
                    {formatCurrency(financeSummary.total_revenue_collected)}
                  </span>
                </div>
                <div style={lineStyle}>
                  <span>{t('dashboard.system.expenses2')}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-danger)', fontFamily: 'monospace', unicodeBidi: 'isolate' }}>
                    {formatCurrency(financeSummary.total_expenses)}
                  </span>
                </div>
                <div style={lineStyle}>
                  <span>{t('dashboard.system.outstanding3')}</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-warning)', fontFamily: 'monospace', unicodeBidi: 'isolate' }}>
                    {formatCurrency(financeSummary.total_outstanding)}
                  </span>
                </div>
                <div className="level-line" style={{ margin: '4px 0' }} />
                <div style={{ ...lineStyle, fontSize: '14px' }}>
                  <span style={{ fontWeight: 600 }}>{t('dashboard.system.netProfit')}</span>
                  <span style={{
                    fontWeight: 700, fontFamily: 'monospace',
                    color: (financeSummary.net_profit || 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  }}>
                    {(financeSummary.net_profit || 0) >= 0
                      ? <TrendingUp size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                      : <TrendingDown size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />}
                    {formatCurrency(financeSummary.net_profit)}
                  </span>
                </div>
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                {t('dashboard.system.noFinancialDataYet')}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 23 — per-role widget strip + sticky notes + location dashboard widget
// ---------------------------------------------------------------------------

export function RoleDashboardSection({ dash }) {
  const { t, locale, dir } = useLocale();
  if (!dash) return null;
  const widgets = dash.widgets || [];
  const sticky = dash.sticky_notes || [];
  return (
    <section dir={dir}>
      <div className="card" style={{ marginBottom: 20, padding: 12 }}>
        <h3 className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>
          {t('dashboard.roleTitle')} ({translateRole(t, dash.role)})
        </h3>
        <div className="stats-grid responsive-grid responsive-grid--auto-160">
          {widgets.map((wgt) => {
            const entries = Object.entries(wgt.data || {});
            const headline = entries[0];
            return (
              <div className="stat-card" key={wgt.key}>
                <div className="stat-label">{t(`dashboard.widgets.${wgt.key}.title`, { defaultValue: wgt.title })}</div>
                {headline ? (
                  <div className="stat-value" style={{ fontSize: 20 }}>
                    <WidgetValue field={headline[0]} value={headline[1]} t={t} locale={locale} />
                  </div>
                ) : (
                  <div className="stat-value" style={{ fontSize: 20 }}>—</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                  {entries.slice(1).map(([field, value]) => (
                    <div key={field}>
                      <span>{t(`dashboard.widgets.fields.${field}`)}: </span>
                      <WidgetValue field={field} value={value} t={t} locale={locale} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {(sticky.length > 0) && (
        <div className="card" style={{ marginBottom: 20, padding: 12 }}>
          <h3 className="card-title" style={{ fontSize: 14, marginBottom: 8 }}>
            {t('dashboard.stickyNotes')} ({formatNumber(sticky.length, { locale })})
          </h3>
          <div style={{ display: 'grid', gap: 6 }}>
            {sticky.map(n => (
              <div key={n.id} style={rowStyle}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: n.color || 'yellow', flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>{n.text}</span>
                <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--color-text-secondary)' }}>{t(`dashboard.noteScopes.${n.scope}`)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function WidgetValue({ field, value, t, locale }) {
  if (value && typeof value === 'object') return Object.entries(value).map(([key, entry]) => (
    <span key={key} style={{ display: 'block' }}>{t(`dashboard.widgets.fields.${key}`)}: <WidgetValue field={key} value={entry} t={t} locale={locale} /></span>
  ));
  const display = typeof value === 'number' ? formatNumber(value, { locale })
    : field === 'source' ? t(`dashboard.progressSources.${value}`) : (value ?? '—');
  return <bdi>{display}</bdi>;
}

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
  background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: '13px',
};
const lineStyle = { display: 'flex', justifyContent: 'space-between', fontSize: '13px' };

function alertCountOf(alerts) {
  if (!alerts) return 0;
  return (alerts.low_stock?.length || 0) + (alerts.overdue_milestones?.length || 0) +
    (alerts.budget_overruns?.length || 0) + (alerts.stale_site_reports?.length || 0) +
    (alerts.overdue_rfis?.length || 0);
}

export default Dashboard;
