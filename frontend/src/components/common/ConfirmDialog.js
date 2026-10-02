import React, { useEffect, useRef } from 'react';
import { useLocale } from '../../hooks/useLocale';

// Accessible confirmation dialog with catalog text; the building block that replaces window.confirm().
export default function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel, destructive = false, onConfirm, onCancel }) {
  const { t } = useLocale();
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    confirmRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <div className="modal-header">
          <h2 className="modal-title" id="confirm-dialog-title">{title || t('common.dialogs.confirmTitle')}</h2>
        </div>
        <div className="modal-body"><p>{message}</p></div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onCancel}>{cancelLabel || t('common.cancel')}</button>
          <button type="button" ref={confirmRef} className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
