import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ActivitiesTab } from './Schedule';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('schedule progress and resource assignment forms', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST' || options.method === 'PUT') return { ok: true, json: async () => ({ success: true, data: { id: 13 } }) };
      if (String(url).includes('/progress-history')) return { ok: true, json: async () => ({ success: true, data: [] }) };
      if (String(url).includes('/schedule/resources')) return { ok: true, json: async () => ({ success: true, data: [{ resource_type: 'employee', resource_id: 9, name: 'Amina Engineer' }] }) };
      if (String(url).includes('/assignments')) return { ok: true, json: async () => ({ success: true, data: [] }) };
      if (String(url).includes('/schedule/activities')) return { ok: true, json: async () => ({ success: true, data: [{
        id: 5, activity_code: 'A0001', name: 'Foundation', planned_start: '2026-07-01', planned_finish: '2026-07-10', percent_complete: '10.00', original_duration: 10,
      }] }) };
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    });
    window.localStorage.setItem('token', 'test-token');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; window.localStorage.clear(); });

  const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const setValue = async (node, value, eventName = 'input') => act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set;
    setter.call(node, value); node.dispatchEvent(new Event(eventName, { bubbles: true }));
  });
  const render = async () => {
    await act(async () => { root.render(<ActivitiesTab projectId="7" locale="en" t={(key) => key} />); });
    await flush();
  };

  test('records a dated progress update with notes', async () => {
    await render();
    const progress = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('schedule.updateProgress'));
    await act(async () => { progress.click(); });
    await flush();
    await setValue(container.querySelector('input[type="number"]'), '45');
    await setValue(container.querySelector('input[type="date"]'), '2026-07-11', 'change');
    await setValue(container.querySelector('textarea'), 'Slab poured');
    await act(async () => { container.querySelector('[role="dialog"] form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    const [, options] = global.fetch.mock.calls.find(([url, request]) => request.method === 'POST' && String(url).endsWith('/progress'));
    expect(JSON.parse(options.body)).toMatchObject({ percent_complete: 45, data_date: '2026-07-11', notes: 'Slab poured' });
  });

  test('submits a project resource assignment with dates and allocation', async () => {
    await render();
    const assign = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('schedule.assignResources'));
    await act(async () => { assign.click(); });
    await flush();
    const form = container.querySelector('[role="dialog"] form');
    await setValue(form.querySelector('select'), 'employee:9', 'change');
    const dates = form.querySelectorAll('input[type="date"]');
    await setValue(dates[0], '2026-07-11', 'change');
    await setValue(dates[1], '2026-07-15', 'change');
    await setValue(form.querySelector('input[type="number"]'), '75');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await flush();
    const [, options] = global.fetch.mock.calls.find(([url, request]) => request.method === 'POST' && String(url).endsWith('/assignments'));
    expect(JSON.parse(options.body)).toMatchObject({ employee_id: 9, assigned_from: '2026-07-11', assigned_to: '2026-07-15', allocation_percent: 75 });
  });
});
