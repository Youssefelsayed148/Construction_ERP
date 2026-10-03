import React, { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';

// Confirmation dialog that asks for a reason (the void / delete flows). The reason is required when
// `reasonRequired` is set; the server enforces it too. All text comes from the catalog or from props.
export default function ReasonDialog({
  open, title, message, confirmLabel, cancelLabel, reasonRequired = false, destructive = true, busy = false, error = '',
  onConfirm, onCancel,
}) {
  const { t } = useLocale();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setReason(''); setTouched(false);
    inputRef.current?.focus();
    const onKey = (event) => { if (event.key === 'Escape' && !busy) onCancel?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;
  const missing = reasonRequired && !reason.trim();
  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (missing || busy) return;
    onConfirm?.(reason.trim());
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel?.(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title" onSubmit={submit} noValidate>
        <div className="modal-header">
          <h2 className="modal-title" id="reason-dialog-title">{title}</h2>
        </div>
        <div className="modal-body">
          {message && <p>{message}</p>}
          <div className="form-group">
            <label className="form-label" htmlFor="reason-dialog-input">
              {reasonRequired ? t('common.dialogs.reasonLabel') : t('common.dialogs.reasonOptionalLabel')}{reasonRequired ? ' *' : ''}
            </label>
            <textarea
              id="reason-dialog-input" ref={inputRef} className="form-textarea" rows={3} maxLength={500} value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-required={reasonRequired}
              aria-invalid={touched && missing ? 'true' : undefined}
              aria-describedby={touched && missing ? 'reason-dialog-error' : undefined}
            />
            {touched && missing && <div className="form-error" id="reason-dialog-error" role="alert">{t('common.dialogs.reasonRequired')}</div>}
          </div>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>{cancelLabel || t('common.cancel')}</button>
          <button type="submit" className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : (confirmLabel || t('common.confirm'))}
          </button>
        </div>
      </form>
    </div>
  );
}
