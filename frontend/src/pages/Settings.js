import React from 'react';
import { useLocale } from '../hooks/useLocale';

// Placeholder until the admin settings screens land (Phase 6).
export default function Settings() {
  const { t } = useLocale();
  return (
    <div className="page-container">
      <h1>{t('navigation.settings.title')}</h1>
      <p>{t('navigation.settings.placeholder')}</p>
    </div>
  );
}
