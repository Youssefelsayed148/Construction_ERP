import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ReasonDialog from './ReasonDialog';

jest.mock('../../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', t: (key) => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('ReasonDialog', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  const render = (props) => act(() => root.render(<ReasonDialog open title="Void" message="Sure?" onConfirm={props.onConfirm} onCancel={props.onCancel || (() => {})} {...props} />));
  const type = (value) => act(() => {
    const el = container.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submit = () => act(() => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

  test('renders nothing when closed', () => {
    act(() => root.render(<ReasonDialog open={false} title="x" onConfirm={() => {}} onCancel={() => {}} />));
    expect(container.innerHTML).toBe('');
  });

  test('a required reason blocks the confirm until it is entered, and is announced', () => {
    const onConfirm = jest.fn();
    render({ onConfirm, reasonRequired: true });
    submit();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toBe('common.dialogs.reasonRequired');
    expect(container.querySelector('textarea').getAttribute('aria-invalid')).toBe('true');
    type('   ');
    submit();
    expect(onConfirm).not.toHaveBeenCalled();
    type('  duplicate entry ');
    submit();
    expect(onConfirm).toHaveBeenCalledWith('duplicate entry');
  });

  test('an optional reason can be empty', () => {
    const onConfirm = jest.fn();
    render({ onConfirm });
    submit();
    expect(onConfirm).toHaveBeenCalledWith('');
  });

  test('shows the server error and disables the buttons while busy', () => {
    render({ onConfirm: () => {}, error: 'Cannot void', busy: true });
    expect(container.textContent).toContain('Cannot void');
    expect([...container.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
  });

  test('Escape cancels', () => {
    const onCancel = jest.fn();
    render({ onConfirm: () => {}, onCancel });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onCancel).toHaveBeenCalled();
  });
});
