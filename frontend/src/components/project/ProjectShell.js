import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { useLocale } from '../../hooks/useLocale';
import { authService } from '../../services/api';
import { groupForPath, visibleGroups } from '../../utils/projectNav';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

// Layout route for /projects/:id and every sub-page under it: six groups, then the sub-tabs of the active group.
// Tab labels come from the catalog; which tabs exist comes from utils/projectNav.js (presentation only).
export function ProjectTabs({ projectId, projectType }) {
  const { t } = useLocale();
  const location = useLocation();
  const role = authService.getCurrentUser()?.role;
  const base = `/projects/${projectId}`;
  const rest = location.pathname.startsWith(base) ? location.pathname.slice(base.length).replace(/^\/+|\/+$/g, '') : '';
  const activeKey = groupForPath(rest.split('/')[0]);
  const groups = visibleGroups(role, projectType);
  const active = groups.find((g) => g.key === activeKey) || groups[0];
  const groupLabel = (g) => t(`projects.nav.groups.${g.key}`);

  return (
    <div className="project-tabs">
      <nav className="project-tabs-groups" aria-label={t('projects.nav.aria.groups')}>
        {groups.map((g) => {
          const target = g.key === 'overview' ? base : `${base}/${g.tabs[0].path}`;
          return (
            <NavLink key={g.key} to={target} end className={`project-tab${g.key === active.key ? ' active' : ''}`}
              aria-current={g.key === active.key ? 'page' : undefined}>
              {groupLabel(g)}
            </NavLink>
          );
        })}
      </nav>
      {active.tabs.length > 0 && (
        <nav className="project-tabs-sub" aria-label={t('projects.nav.aria.tabs', { group: groupLabel(active) })}>
          {active.tabs.map((tab) => (
            <NavLink key={tab.key} to={`${base}/${tab.path}`} className="project-subtab">{t(`projects.nav.tabs.${tab.key}`)}</NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function ProjectShell() {
  const { id } = useParams();
  const [projectType, setProjectType] = useState(null);
  useEffect(() => {
    let cancelled = false;
    // Only the type is needed here (to hide Units & Sales); a failure leaves every permitted tab visible.
    fetch(`${API_URL}/projects/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (!cancelled && body?.data?.project_type) setProjectType(body.data.project_type); })
      .catch(() => { /* type stays unknown: every permitted tab is shown */ });
    return () => { cancelled = true; };
  }, [id]);
  return (
    <>
      <ProjectTabs projectId={id} projectType={projectType} />
      <Outlet />
    </>
  );
}
