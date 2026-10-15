import React from 'react';
import { useLocale } from '../../hooks/useLocale';

export default function FormActions({ saving, error, onCancel, submitLabel }) {
  const { t } = useLocale();
  const messageKey = error?.translationKey || 'common.states.error';
  return (
    <>
      {error && <div className="alert alert-danger" role="alert">{t(messageKey)}</div>}
      <div className="form-actions">
        {onCancel && <button type="button" className="btn" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>}
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving || undefined}>
          {saving ? <><span className="spinner" aria-hidden="true" /> {t('common.loading')}</> : (submitLabel || t('common.save'))}
        </button>
      </div>
    </>
  );
}
