import React, { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../hooks/useLocale';

export default function TextEntryDialog({ open, title, label, initialValue = '', multiline = false, required = true, type = 'text', min, step, validate, onSubmit, onCancel }) {
  const { t } = useLocale();
  const inputRef = useRef(null);
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue);
    setError('');
    inputRef.current?.focus();
  }, [open, initialValue]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    const normalized = value.trim();
    if (required && !normalized) {
      setError(t('common.validation.required'));
      return;
    }
    const validationError = validate?.(normalized);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError('');
    try { await onSubmit(normalized); }
    catch (submitError) { setError(submitError.message || t('common.states.error')); }
    finally { setSaving(false); }
  };

  const Field = multiline ? 'textarea' : 'input';
  return (
    <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel?.(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="text-entry-dialog-title">
        <form onSubmit={submit}>
          <div className="modal-header"><h2 className="modal-title" id="text-entry-dialog-title">{title}</h2></div>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label" htmlFor="text-entry-dialog-value">{label}{required ? ' *' : ''}</label>
              <Field ref={inputRef} id="text-entry-dialog-value" type={multiline ? undefined : type} min={multiline ? undefined : min} step={multiline ? undefined : step} className={multiline ? 'form-textarea' : 'form-input'} value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} required={required} aria-invalid={error ? 'true' : undefined} />
              {error && <div className="form-error" role="alert">{error}</div>}
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onCancel} disabled={saving}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : t('common.save')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
