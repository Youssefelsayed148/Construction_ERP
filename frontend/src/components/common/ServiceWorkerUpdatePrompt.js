import React, { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';

export default function ServiceWorkerUpdatePrompt() {
  const { t } = useLocale();
  const [waitingWorker, setWaitingWorker] = useState(null);
  const reloadAfterUpdate = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return undefined;
    let updateWorker;
    const showUpdate = () => setWaitingWorker(updateWorker);
    const onControllerChange = () => { if (reloadAfterUpdate.current) window.location.reload(); };

    navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/service-worker.js`, {
      scope: `${process.env.PUBLIC_URL || ''}/`,
    }).then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        updateWorker = registration.waiting;
        showUpdate();
      }
      registration.addEventListener('updatefound', () => {
        updateWorker = registration.installing;
        updateWorker?.addEventListener('statechange', () => {
          if (updateWorker?.state === 'installed' && navigator.serviceWorker.controller) showUpdate();
        });
      });
    }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  if (!waitingWorker) return null;
  return <div className="alert alert-info service-worker-update" role="status">
    <span>{t('navigation.offline.updateAvailable')}</span>
    <button type="button" className="btn btn-sm" onClick={() => { reloadAfterUpdate.current = true; waitingWorker.postMessage({ type: 'SKIP_WAITING' }); }}>
      {t('navigation.offline.updateNow')}
    </button>
  </div>;
}
