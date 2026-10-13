import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FormField from './FormField';

jest.mock('../../hooks/useLocale', () => ({ useLocale: () => ({ t: (key) => key }) }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('FormField', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  test('connects label, hint, and validation error accessibly', () => {
    act(() => root.render(<FormField id="title" label="Title" required hint="Short title" error="required" />));
    expect(container.querySelector('label').htmlFor).toBe('title');
    expect(container.querySelector('input').getAttribute('aria-invalid')).toBe('true');
    expect(container.querySelector('input').getAttribute('aria-describedby')).toBe('title-hint title-error');
    expect(container.querySelector('[role="alert"]').textContent).toBe('common.validation.required');
  });
});
