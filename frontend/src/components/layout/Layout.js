import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, WifiOff, X } from 'lucide-react';
import Sidebar from './Sidebar';
import { useLocale } from '../../hooks/useLocale';

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const location = useLocation();
  const { t } = useLocale();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const navLabel = t(menuOpen ? 'navigation.aria.closeNavigation' : 'navigation.aria.openNavigation');
  return (
    <div className="app-container">
      <button className="mobile-menu-button" aria-label={navLabel}
        aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
        {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
      {menuOpen && <button className="sidebar-backdrop" aria-label={t('navigation.aria.closeNavigation')} onClick={() => setMenuOpen(false)} />}
      <Sidebar mobileOpen={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <main className="main-content">
        {!online && <div className="offline-banner" role="status"><WifiOff size={16} aria-hidden="true" /> {t('navigation.offline.banner')}</div>}
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
