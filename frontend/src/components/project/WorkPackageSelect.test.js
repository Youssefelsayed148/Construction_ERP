import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import WorkPackageSelect from './WorkPackageSelect';

jest.mock('../../hooks/useLocale', () => ({
  useLocale: () => ({ locale: 'en', t: (key) => key }),
}));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('WorkPackageSelect', () => {
  let container; let root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); delete global.fetch; });

  const mount = async (props, response) => {
    global.fetch = jest.fn(() => response);
    await act(async () => { root.render(<WorkPackageSelect projectId={7} onChange={() => {}} {...props} />); });
  };
  const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) });

  test('lists the project work packages and reports the chosen id as a number', async () => {
    const onChange = jest.fn();
    await mount({ onChange }, ok([{ id: 3, code: 'WP-1', name: 'Columns' }, { id: 4, code: 'WP-2', name: 'Slabs' }]));
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/api\/projects\/7\/work-packages$/);
    const select = container.querySelector('select');
    expect([...select.options].map((o) => o.textContent)).toEqual(['projects.workPackage.none', 'WP-1 - Columns', 'WP-2 - Slabs']);
    await act(async () => {
      select.value = '4';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(4);
    await act(async () => { select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test('empty state: no packages says so and the choice is only "none"', async () => {
    await mount({}, ok([]));
    expect(container.querySelector('small').textContent).toBe('projects.workPackage.empty');
    expect(container.querySelectorAll('option')).toHaveLength(1);
  });

  test('error state: a failed load is announced and the select is disabled', async () => {
    await mount({}, Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    expect(container.querySelector('[role="alert"]').textContent).toBe('projects.workPackage.loadFailed');
    expect(container.querySelector('select').disabled).toBe(true);
  });

  test('a required select is marked required', async () => {
    await mount({ required: true }, ok([{ id: 1, code: 'A', name: 'a' }]));
    expect(container.querySelector('select').required).toBe(true);
  });
});
