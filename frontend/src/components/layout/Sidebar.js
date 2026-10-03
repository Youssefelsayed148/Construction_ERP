import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { logout as reduxLogout } from '../../store/slices/authSlice';
import { authService } from '../../services/api';
import { useLocale } from '../../hooks/useLocale';
import { translateRole } from '../../i18n/enums';
import { LayoutDashboard, Briefcase, Users, Package, Truck, Wrench, Shield, DollarSign, Receipt, ClipboardList, ListChecks, LogOut, Globe, HardHat, Bot } from 'lucide-react';

// Labels are catalog keys (navigation.items.*), never literal text.
const mainMenuItems = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'dashboard', module: 'dashboard' },
  { path: '/projects', icon: Briefcase, labelKey: 'projects', module: 'projects' },
  { path: '/inventory', icon: Package, labelKey: 'inventory', module: 'items' },
  { path: '/procurement/comparison', icon: ClipboardList, labelKey: 'procurementComparison', module: 'procurement' },
  { path: '/clients', icon: Users, labelKey: 'clients', module: 'clients' },
  { path: '/suppliers', icon: Truck, labelKey: 'suppliers', module: 'suppliers' },
  { path: '/assets', icon: Wrench, labelKey: 'assets', module: 'assets' },
  { path: '/hr', icon: Users, labelKey: 'hr', module: 'hr' },
  { path: '/expenses', icon: DollarSign, labelKey: 'expenses', module: 'expenses' },
  { path: '/invoices', icon: Receipt, labelKey: 'invoices', module: 'invoices' },
  { path: '/legal', icon: Shield, labelKey: 'legal', module: 'legal' },
  { path: '/approvals', icon: ClipboardList, labelKey: 'approvals', module: 'approvals' },
  { path: '/my-actions', icon: ListChecks, labelKey: 'myActions', module: 'actions' },
  // Phase 27 — owner/admin only (filtered below).
  { path: '/agent-activity', icon: Bot, labelKey: 'agentActivity', roles: ['owner', 'admin'] },
];

const portalMenuItems = {
  consultant: [{ path: '/consultant-portal', icon: ClipboardList, labelKey: 'portals.consultant' }],
  client: [{ path: '/client-portal', icon: Briefcase, labelKey: 'portals.client' }],
  subcontractor: [{ path: '/subcontractor-portal', icon: HardHat, labelKey: 'portals.subcontractor' }],
  supplier: [{ path: '/supplier-portal', icon: Truck, labelKey: 'portals.supplier' }],
};

const labelFor = (t, item) => t(item.labelKey.startsWith('portals.') ? `navigation.${item.labelKey}` : `navigation.items.${item.labelKey}`);

function Sidebar({ mobileOpen = false, onNavigate }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t, setLocale, locale } = useLocale();
  const user = authService.getCurrentUser();
  const base = portalMenuItems[user?.role] || mainMenuItems;
  const modules = Array.isArray(user?.policy_modules) ? user.policy_modules : user?.module_permissions;
  const hasModule = (module) => !module || !Array.isArray(modules) || modules.length === 0
    || modules.includes('*') || modules.includes('all') || modules.includes(module);
  const menuItems = base.filter((item) => (!item.roles || item.roles.includes(user?.role)) && hasModule(item.module));

  const handleLogout = () => {
    authService.clearSession();
    dispatch(reduxLogout());
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
