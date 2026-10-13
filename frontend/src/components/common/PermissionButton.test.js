import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PermissionButton from './PermissionButton';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('PermissionButton', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  test('does not render an action without permission', () => {
    act(() => root.render(<PermissionButton allowed={false}>Approve</PermissionButton>));
    expect(container.querySelector('button')).toBeNull();
  });
  test('renders the action when the caller confirms permission', () => {
    act(() => root.render(<PermissionButton allowed>Approve</PermissionButton>));
    expect(container.querySelector('button').textContent).toBe('Approve');
  });
});
