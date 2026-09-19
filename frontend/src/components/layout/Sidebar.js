import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { logout as reduxLogout } from '../../store/slices/authSlice';
import { authService } from '../../services/api';
import { useLocale } from '../../hooks/useLocale';
import { LayoutDashboard, Briefcase, Users, Package, Truck, Wrench, Shield, DollarSign, Receipt, ClipboardList, ListChecks, LogOut, Globe, HardHat } from 'lucide-react';

const mainMenuItems = [
  { path: '/dashboard', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
  { path: '/projects', icon: Briefcase, labelKey: 'nav.projects' },
  { path: '/inventory', icon: Package, labelKey: 'nav.inventory' },
  { path: '/procurement/comparison', icon: ClipboardList, label: 'Procurement comparison' },
  { path: '/clients', icon: Users, labelKey: 'nav.clients' },
  { path: '/suppliers', icon: Truck, labelKey: 'nav.suppliers' },
  { path: '/assets', icon: Wrench, labelKey: 'nav.assets' },
  { path: '/hr', icon: Users, labelKey: 'nav.hr' },
  { path: '/expenses', icon: DollarSign, labelKey: 'nav.expenses' },
  { path: '/invoices', icon: Receipt, labelKey: 'nav.invoices' },
  { path: '/legal', icon: Shield, labelKey: 'nav.legal' },
  { path: '/approvals', icon: ClipboardList, labelKey: 'nav.approvals' },
  { path: '/my-actions', icon: ListChecks, labelKey: 'nav.myActions' },
];

const portalMenuItems = {
  consultant: [{ path: '/consultant-portal', icon: ClipboardList, label: 'Consultant Portal' }],
  client: [{ path: '/client-portal', icon: Briefcase, label: 'Client Portal' }],
  subcontractor: [{ path: '/subcontractor-portal', icon: HardHat, label: 'Subcontractor Portal' }],
  supplier: [{ path: '/supplier-portal', icon: Truck, label: 'Supplier Portal' }],
};

function Sidebar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t, setLocale, locale } = useLocale();
  const user = authService.getCurrentUser();
  const menuItems = portalMenuItems[user?.role] || mainMenuItems;

  const handleLogout = () => {
    authService.clearSession();
    dispatch(reduxLogout());
    navigate('/login');
  };

  const toggleLocale = () => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <HardHat size={28} style={{ color: 'var(--color-accent)' }} />
          <span className="sidebar-brand">{t('common.appShortName')}</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `nav-item${isActive ? ' active' : ''}`
            }
          >
            <item.icon size={18} />
            <span>{item.label || t(`common.${item.labelKey}`)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button onClick={toggleLocale} className="locale-toggle" title="Switch language">
          <Globe size={16} />
          <span style={{ fontSize: '12px', marginLeft: '6px' }}>
            {locale === 'ar' ? 'EN' : 'ع'}
          </span>
        </button>

        <div className="user-info-sidebar">
          <span className="user-name-sidebar">{user?.name || 'User'}</span>
          <span className="user-role-sidebar">{user?.role || ''}</span>
        </div>

        <button onClick={handleLogout} className="logout-btn" title="Logout">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
