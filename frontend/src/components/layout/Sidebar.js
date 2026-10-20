import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store';
import { authService } from '../../services/api';
import { useLocale } from '../../hooks/useLocale';
import { translateRole } from '../../i18n/enums';
import { LayoutDashboard, Briefcase, Users, Package, Truck, Wrench, Shield, DollarSign, Receipt, ClipboardList, ListChecks, LogOut, Globe, HardHat, Bot, Settings as SettingsIcon, Warehouse, Bell, TrendingUp } from 'lucide-react';

// Labels are catalog keys (navigation.items.*), never literal text.
const mainMenuItems = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', module: 'dashboard' },
  { path: '/projects', icon: Briefcase, labelKey: 'projects', module: 'projects' },
  { path: '/inventory', icon: Package, labelKey: 'inventory', module: 'inventory' },
  { path: '/reservations', icon: Warehouse, labelKey: 'reservations', module: 'warehouses' },
  { path: '/procurement/comparison', icon: ClipboardList, labelKey: 'procurementComparison', module: 'procurement', action: 'see_supplier_value' },
  { path: '/clients', icon: Users, labelKey: 'clients', module: 'clients' },
  { path: '/suppliers', icon: Truck, labelKey: 'suppliers', module: 'suppliers' },
  { path: '/assets', icon: Wrench, labelKey: 'assets', module: 'assets' },
  { path: '/hr', icon: Users, labelKey: 'hr', module: 'hr' },
  { path: '/expenses', icon: DollarSign, labelKey: 'expenses', module: 'expenses' },
  { path: '/invoices', icon: Receipt, labelKey: 'invoices', module: 'invoices' },
  { path: '/cash-flow', icon: TrendingUp, labelKey: 'cashFlow', module: 'finance-ledger' },
  { path: '/legal', icon: Shield, labelKey: 'legal', module: 'legal' },
  { path: '/approvals', icon: ClipboardList, labelKey: 'approvals', module: 'approvals' },
  { path: '/my-actions', icon: ListChecks, labelKey: 'myActions', module: 'actions' },
  { path: '/notification-preferences', icon: Bell, labelKey: 'notificationPreferences', module: 'notifications' },
  { path: '/settings', icon: SettingsIcon, labelKey: 'settings', module: 'settings', roles: ['owner', 'admin'] },
  { path: '/admin/organizations', icon: SettingsIcon, labelKey: 'adminWorkspaces', roles: ['owner', 'admin', 'owner_ceo', 'coo'] },
  // Phase 27 — owner/admin only (filtered below).
  { path: '/agent-activity', icon: Bot, labelKey: 'agentActivity', module: 'agent', action: 'view', roles: ['owner', 'admin'] },
];

const portalMenuItems = {
  consultant: [{ path: '/consultant-portal', icon: ClipboardList, labelKey: 'portals.consultant', module: 'consultant', action: 'view' }],
  client: [{ path: '/client-portal', icon: Briefcase, labelKey: 'portals.client', module: 'client-portal', action: 'view' }],
  subcontractor: [{ path: '/subcontractor-portal', icon: HardHat, labelKey: 'portals.subcontractor', module: 'portal', action: 'view' }],
  supplier: [{ path: '/supplier-portal', icon: Truck, labelKey: 'portals.supplier', module: 'portal', action: 'view' }],
};

// The canonical external roles of migration 0031 are project-bound mirrors of
// the four legacy alias roles, so each one maps to the portal menu of its
// alias family: the same single entry and the same path the legacy role
// already gets - nothing is added beyond what those legacy roles reach.
// The mapping is role-authoritative (the legacy keys only pass the grant
// filter because their own grants include their portal module); the backend
// policy remains the enforcement point for every portal API.
const CANONICAL_PORTAL_FAMILY = {
  client_executive: 'client',
  client_reviewer: 'client',
  // 0031 describes pmc_manager as client-side supervision reads with the
  // see_client_value lens and grants it no consultant-module permissions.
  pmc_manager: 'client',
  consultant_coordinator: 'consultant',
  consultant_reviewer: 'consultant',
  subcontractor_manager: 'subcontractor',
  subcontractor_site_engineer: 'subcontractor',
  // An external service provider mirroring the supplier shape: ('portal','view')
  // plus its own domain module.
  testing_lab: 'supplier',
  supplier_sales: 'supplier',
};

const labelFor = (t, item) => t(item.labelKey.startsWith('portals.') ? `navigation.${item.labelKey}` : `navigation.items.${item.labelKey}`);

function Sidebar({ mobileOpen = false, onNavigate }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { t, setLocale, locale } = useLocale();
  const user = authService.getCurrentUser();
  const portalFamily = CANONICAL_PORTAL_FAMILY[user?.role];
  const portalMenu = portalMenuItems[user?.role] || (portalFamily ? portalMenuItems[portalFamily] : null);
  const base = portalMenu || mainMenuItems;
  const modules = Array.isArray(user?.policy_modules) ? user.policy_modules : user?.module_permissions;
  const permissions = user?.policy_permissions;
  const hasModule = (module) => !module || (Array.isArray(modules)
    && (modules.includes('*') || modules.includes('all') || modules.includes(module)));
  const hasPermission = (module, action = 'view') => {
    if (!module) return true;
    if (Array.isArray(permissions)) return permissions.some((grant) =>
      (grant.module === '*' || grant.module === module) && (grant.action === '*' || grant.action === action));
    // Compatibility for sessions created before the API returned effective policy grants.
    return action === 'view' && hasModule(module);
  };
  // Portally mapped canonical external roles get their alias's menu verbatim;
  // every other session keeps the grant-filtered menu.
  const menuItems = base.filter((item) => (!item.roles || item.roles.includes(user?.role))
    && (Boolean(portalFamily) || (hasModule(item.module) && hasPermission(item.module, item.action))));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleLocale = () => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  };

  return (
    <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <HardHat size={28} style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
          <span className="sidebar-brand">{t('common.appShortName')}</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label={t('navigation.aria.mainNavigation')}>
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `nav-item${isActive ? ' active' : ''}`
            }
            onClick={onNavigate}
          >
            <item.icon size={18} aria-hidden="true" />
            <span>{labelFor(t, item)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button onClick={toggleLocale} className="locale-toggle" title={t('navigation.actions.switchLanguage')} aria-label={t('navigation.actions.switchLanguage')}>
          <Globe size={16} aria-hidden="true" />
          <span style={{ fontSize: '12px', marginInlineStart: '6px' }} lang={locale === 'ar' ? 'en' : 'ar'}>
            {locale === 'ar' ? 'EN' : 'ع'}
          </span>
        </button>

        <div className="user-info-sidebar">
          <span className="user-name-sidebar">{user?.name || t('navigation.user.fallbackName')}</span>
          <span className="user-role-sidebar">{user?.role ? translateRole(t, user.role) : ''}</span>
        </div>

        <button onClick={handleLogout} className="logout-btn" title={t('navigation.actions.logout')} aria-label={t('navigation.actions.logout')}>
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
