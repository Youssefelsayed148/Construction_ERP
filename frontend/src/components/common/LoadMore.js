import React from 'react';
import { useLocale } from '../../hooks/useLocale';

export default function LoadMore({ loadedCount, totalCount, loading = false, onLoadMore }) {
  const { t } = useLocale();
  if (totalCount == null || totalCount <= loadedCount) return null;
  return (
    <div className="load-more" aria-live="polite">
      <span>{t('common.pagination.showing', { loaded: loadedCount, total: totalCount })}</span>
      <button type="button" className="btn" onClick={onLoadMore} disabled={loading} aria-busy={loading || undefined}>
        {loading ? t('common.loading') : t('common.pagination.loadMore')}
      </button>
    </div>
  );
}
