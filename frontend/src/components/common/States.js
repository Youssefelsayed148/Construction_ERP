import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useLocale } from '../../hooks/useLocale';

// Generic states with catalog text. Screens pass their own `message` (already translated) to override.

export function LoadingState({ message }) {
  const { t } = useLocale();
  return (
    <div className="state-message" role="status" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <span>{message || t('common.states.loading')}</span>
    </div>
  );
}

export function EmptyState({ message, filtered = false }) {
  const { t } = useLocale();
  return (
    <div className="state-message" role="status">
      {message || t(filtered ? 'common.states.noResults' : 'common.states.empty')}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  const { t } = useLocale();
  return (
    <div className="alert alert-danger state-message" role="alert">
      <span>{message || t('common.states.error')}</span>
      {onRetry && <button type="button" className="btn btn-sm" onClick={onRetry}>{t('common.states.retry')}</button>}
    </div>
  );
}

// Back / next arrows follow the reading direction; neutral icons (download, calendar, check) are not mirrored.
export function BackIcon(props) {
  const { isRTL } = useLocale();
  const Icon = isRTL ? ArrowRight : ArrowLeft;
  return <Icon aria-hidden="true" {...props} />;
}

export function NextIcon(props) {
  const { isRTL } = useLocale();
  const Icon = isRTL ? ArrowLeft : ArrowRight;
  return <Icon aria-hidden="true" {...props} />;
}
