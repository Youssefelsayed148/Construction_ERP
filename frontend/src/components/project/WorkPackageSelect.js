import React, { useEffect, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';

const API_URL = `${(process.env.REACT_APP_API_URL || '').replace(/\/$/, '')}/api`;

// Picks one of the project's work packages (by id). ITPs, WIRs and schedule activities reference a package
// by foreign key; free text is no longer accepted by the API. Shows its own loading, empty and error states.
export default function WorkPackageSelect({ projectId, value, onChange, required = false, className = 'input' }) {
  const { t } = useLocale();
  const [state, setState] = useState({ loading: true, error: false, rows: [] });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: false, rows: [] });
    fetch(`${API_URL}/projects/${projectId}/work-packages`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => { if (!cancelled) setState({ loading: false, error: false, rows: body.data || [] }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, rows: [] }); });
    return () => { cancelled = true; };
  }, [projectId]);

  const { loading, error, rows } = state;
  let hint = null;
  if (loading) hint = t('projects.workPackage.loading');
  else if (error) hint = t('projects.workPackage.loadFailed');
  else if (rows.length === 0) hint = t('projects.workPackage.empty');

  return (
    <div>
      <select
        className={className}
        required={required}
        aria-label={t('projects.workPackage.label')}
        value={value == null ? '' : String(value)}
        disabled={loading || error}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{t('projects.workPackage.none')}</option>
        {rows.map((wp) => <option key={wp.id} value={wp.id}>{wp.code} - {wp.name}</option>)}
      </select>
      {hint && <small role={error ? 'alert' : 'status'}>{hint}</small>}
    </div>
  );
}
