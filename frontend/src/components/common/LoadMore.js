import React from 'react';

export default function LoadMore({ loadedCount, totalCount, loading = false, onLoadMore, t = (key, params = {}) => {
  if (key === 'common.pagination.showing') return `Showing ${params.loaded} of ${params.total}`;
  if (key === 'common.pagination.loadMore') return 'Load more';
  if (key === 'common.loading') return 'Loading';
  return key;
} }) {
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
