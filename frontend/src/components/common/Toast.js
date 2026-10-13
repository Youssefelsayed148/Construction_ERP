import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';

const ToastContext = createContext(null);
let nextToastId = 0;

export function ToastProvider({ children }) {
  const { t } = useLocale();
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const showToast = useCallback((message, type = 'success', duration = 5000) => {
    const id = ++nextToastId;
    setItems((current) => [...current, { id, message, type }]);
    if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);
  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions removals">
        {items.map((item) => <div key={item.id} role="status" className={`toast toast-${item.type}`}>
          <span>{item.message}</span><button type="button" aria-label={t('common.toast.dismiss')} onClick={() => dismiss(item.id)}>×</button>
        </div>)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast() must be used inside <ToastProvider>');
  return context;
}
