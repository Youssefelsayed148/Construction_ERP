import React from 'react';
import { useLocale } from '../../hooks/useLocale';

export default function FormField({ id, label, error, required = false, hint, as = 'input', children, ...props }) {
  const { t } = useLocale();
  const Component = as;
  const selectChildren = as === 'select' && React.isValidElement(children) && children.type === React.Fragment
    ? React.Children.toArray(children.props.children)
    : children;
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const errorText = error ? (typeof error === 'string' ? t(`common.validation.${error}`, { defaultValue: t('common.validation.invalid') }) : error) : '';
  const controlProps = {
    id, className: as === 'textarea' ? 'form-textarea' : 'form-input', 'aria-required': required,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined,
    ...props,
  };
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}{required ? ' *' : ''}</label>
      {as === 'select' ? <Component {...controlProps}>{selectChildren}</Component> : <Component {...controlProps} />}
      {hint && <div id={hintId} className="form-hint">{hint}</div>}
      {error && <div className="form-error" id={errorId} role="alert">{errorText}</div>}
    </div>
  );
}
