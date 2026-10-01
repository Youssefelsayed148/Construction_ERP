import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, WifiOff, X } from 'lucide-react';
import Sidebar from './Sidebar';

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const location = useLocation();

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

  return (
    <div className="app-container">
      <button className="mobile-menu-button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <Sidebar mobileOpen={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <main className="main-content">
        {!online && <div className="offline-banner" role="status"><WifiOff size={16} /> You are offline. Submitted changes require a connection.</div>}
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
