import React from 'react';
import { useLocale } from '../../hooks/useLocale';

export default function FormField({ id, label, error, required = false, hint, as = 'input', ...props }) {
  const { t } = useLocale();
  const Component = as;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const errorText = error ? (typeof error === 'string' ? t(`common.validation.${error}`, { defaultValue: t('common.validation.invalid') }) : error) : '';
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}{required ? ' *' : ''}</label>
      <Component id={id} className={as === 'textarea' ? 'form-textarea' : 'form-input'} aria-required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined} {...props} />
      {hint && <div id={hintId} className="form-hint">{hint}</div>}
      {error && <div className="form-error" id={errorId} role="alert">{errorText}</div>}
    </div>
  );
}
