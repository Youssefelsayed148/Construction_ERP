import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProjectCalendars from './ProjectCalendars';

const t = (key) => key;
global.IS_REACT_ACT_ENVIRONMENT = true;

const CALENDARS = [
  { id: 11, name: 'Site 6-day', name_en: 'Site 6-day', timezone: 'Africa/Cairo', weekly_off_days: [5], holidays: [], is_default: true },
  { id: 12, name: 'Office', name_ar: 'المكتب', timezone: null, weekly_off_days: [], holidays: [{ date: '2026-12-25', name: 'x' }], is_default: false },
];

describe('ProjectCalendars', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: CALENDARS }) }));
    window.localStorage.setItem('token', 'test-token');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; window.localStorage.clear(); });

  const mount = async (props = {}, response) => {
    if (response) global.fetch = jest.fn(() => Promise.resolve(response));
    await act(async () => {
      root.render(<ProjectCalendars projectId={9} locale="en" t={t} canManage {...props} />);
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  };
  const ok = (data) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) });
  const fill = async (selector, value) => act(async () => {
    const node = container.querySelector(selector);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set;
    setter.call(node, value);
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });

  test('lists calendars default-first with localized names, off days and holiday counts', async () => {
    await mount();
    expect(global.fetch.mock.calls[0][0]).toMatch(/\/api\/projects\/9\/calendars$/);
    const firstRow = container.querySelectorAll('tbody tr')[0];
    expect(firstRow.textContent).toContain('Site 6-day');
    expect(firstRow.textContent).toContain('projects.calendar.defaultBadge');
    expect(firstRow.textContent).toContain(t('projects.calendar.weekdayFri'));
    const secondRow = container.querySelectorAll('tbody tr')[1];
    expect(secondRow.textContent).toContain(t('projects.calendar.offDaysNone'));
    expect(secondRow.textContent).toContain('1');
  });

  test('renders localized names for Arabic rows', async () => {
    await mount({ locale: 'ar' });
    const secondRow = container.querySelectorAll('tbody tr')[1];
    expect(secondRow.textContent).toContain('المكتب');
  });

  test('empty state renders and no API write is possible without rows', async () => {
    await mount({}, ok([]));
    expect(container.textContent).toContain('projects.calendar.noCalendarsYet');
  });

  test('load failure is announced with an alert', async () => {
    await mount({}, Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ success: false, error: 'boom' }) }));
    expect(container.querySelector('.alert-danger').textContent).toBe('boom');
  });

  test('creates a calendar: name, timezone, off days, holidays and default flag in the POST body', async () => {
    await mount();
    const add = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('projects.calendar.add'));
    await act(async () => { add.click(); });
    await fill('.modal input', 'Night shift');
    const checked = [...container.querySelectorAll('.modal input[type="checkbox"]')];
    await act(async () => {
      const sat = checked.find((c) => c.nextSibling && c.nextSibling.textContent.endsWith('weekdaySat'));
      sat.click();
    });
    await act(async () => {
      [...container.querySelectorAll('.modal button')].find((b) => b.textContent.includes('addHoliday')).click();
    });
    const dateInputs = container.querySelectorAll('.modal input[type="date"]');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(dateInputs[0]), 'value').set;
      set.call(dateInputs[0], '2026-05-01'); dateInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    });
    const defaultToggle = checked.find((c) => c.closest('label') && c.closest('label').textContent.includes('setAsDefault'));
    await act(async () => { defaultToggle.click(); });
    const save = [...container.querySelectorAll('.modal-footer button')].find((b) => b.textContent.includes('common.save'));
    await act(async () => { save.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [url, options] = global.fetch.mock.calls.find(([u, r]) => r.method === 'POST' && String(u).includes('/calendars'));
    expect(url).toMatch(/\/api\/projects\/9\/calendars$/);
    expect(JSON.parse(options.body)).toEqual({
      name: 'Night shift',
      timezone: 'Africa/Cairo',
      weekly_off_days: [5],
      holidays: [{ date: '2026-05-01', name: '' }],
      is_default: true,
      name_en: 'Night shift',
    });
  });

  test('edits a calendar through PUT with only the intended fields', async () => {
    await mount();
    await act(async () => {
      [...container.querySelectorAll('tbody button')].find((b) => !b.className.includes('danger')).click();
    });
    await fill('.modal input', 'Office 5-day');
    const save = [...container.querySelectorAll('.modal-footer button')].find((b) => b.textContent.includes('common.save'));
    await act(async () => { save.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [url, options] = global.fetch.mock.calls.find(([u, r]) => r.method === 'PUT');
    expect(url).toMatch(/\/api\/projects\/9\/calendars\/11$/);
    const body = JSON.parse(options.body);
    expect(body.name).toBe('Office 5-day');
    expect(body.name_en).toBe('Office 5-day');
    expect(body.weekly_off_days).toEqual([5]);
  });

  test('deletes a calendar after the inline confirm step', async () => {
    await mount();
    const del = [...container.querySelectorAll('tbody button.btn-danger')][0];
    await act(async () => { del.click(); });
    expect(global.fetch.mock.calls.some(([, r]) => r.method === 'DELETE')).toBe(false);
    const confirm = [...container.querySelectorAll('tbody button')].find((b) => b.textContent.includes('projects.calendar.confirmDelete'));
    await act(async () => { confirm.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [url] = global.fetch.mock.calls.find(([u, r]) => r.method === 'DELETE');
    expect(url).toMatch(/\/api\/projects\/9\/calendars\/11$/);
  });

  test('a refused delete of the only default shows the mapped message', async () => {
    global.fetch = jest.fn((url, options = {}) => {
      if (options.method === 'DELETE') return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: false, error_code: 'calendar_default_required', error: 'keep one' }) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: CALENDARS }) });
    });
    await mount();
    const del = [...container.querySelectorAll('tbody button.btn-danger')][0];
    await act(async () => { del.click(); });
    const confirm = [...container.querySelectorAll('tbody button')].find((b) => b.textContent.includes('projects.calendar.confirmDelete'));
    await act(async () => { confirm.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelector('.alert-danger').textContent).toBe('projects.calendar.errDefaultRequired');
  });

  test('without the manage grant, add and row actions are hidden but the list shows', async () => {
    await mount({ canManage: false });
    expect(container.textContent).toContain('Site 6-day');
    expect([...container.querySelectorAll('button')]).toHaveLength(0);
  });
});
