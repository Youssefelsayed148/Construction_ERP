import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProjectDocuments from './ProjectDocuments';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ locale: 'en', t: (key) => key }) }));
jest.mock('./DocControlExtended', () => ({ RegisterTab: () => null, TransmittalsTab: () => null, CorrespondenceTab: () => null, DocSearchTab: () => null }));
jest.mock('../components/DocumentUpload', () => function MockDocumentUpload() { return null; });
jest.mock('../components/ProtectedMedia', () => ({ openProtectedFile: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('ProjectDocuments RFI impacts', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ success: true, data: { id: 41 } }) };
      if (String(url).includes('/docs/rfis')) return { ok: true, json: async () => ({ success: true, data: [{
        id: 40, rfi_number: 'RFI-040', subject: 'Beam penetration', question: 'Confirm sleeve position.', status: 'open',
        project_location_name: 'East tower', work_package_code: 'WP-23', cost_impact: '1400.50', schedule_impact_days: 3,
      }] }) };
      if (String(url).includes('/locations/project/')) return { ok: true, json: async () => ({ success: true, data: [{ id: 17, code: 'LOC-17', name_en: 'East tower' }] }) };
      if (String(url).includes('/work-packages')) return { ok: true, json: async () => ({ success: true, data: [{ id: 23, code: 'WP-23', name: 'Concrete frame' }] }) };
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    });
    window.localStorage.setItem('token', 'test-token');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; window.localStorage.clear(); });

  const fill = async (selector, value) => act(async () => {
    const node = container.querySelector(selector);
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set;
    setter.call(node, value);
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });

  test('raises an RFI with selected project references and nullable cost/schedule impacts', async () => {
    await act(async () => { root.render(<MemoryRouter initialEntries={['/projects/7/documents']}><Routes><Route path="/projects/:id/documents" element={<ProjectDocuments />} /></Routes></MemoryRouter>); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const rfisTab = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('RFIs'));
    await act(async () => { rfisTab.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('documentControl.rfiImpacts.location: East tower');
    expect(container.textContent).toContain('documentControl.rfiImpacts.workPackage: WP-23');
    expect(container.textContent).toContain('documentControl.rfiImpacts.cost: 1400.50');
    expect(container.textContent).toContain('documentControl.rfiImpacts.schedule: 3');

    const raise = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Raise RFI'));
    await act(async () => { raise.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await fill('.modal input', 'Beam penetration coordination');
    await fill('.modal textarea', 'Confirm sleeve position.');
    const selects = container.querySelectorAll('.modal select');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(selects[0]), 'value').set;
      set.call(selects[1], '17'); selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      set.call(selects[2], '23'); selects[2].dispatchEvent(new Event('change', { bubbles: true }));
    });
    const numbers = container.querySelectorAll('.modal input[type="number"]');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(numbers[0]), 'value').set;
      set.call(numbers[0], '1400.50'); numbers[0].dispatchEvent(new Event('input', { bubbles: true }));
      set.call(numbers[1], '3'); numbers[1].dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...container.querySelectorAll('.modal-footer button')].find((button) => button.textContent.includes('common.save'));
    await act(async () => { save.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [, options] = global.fetch.mock.calls.find(([, request]) => request.method === 'POST' && String(request.body).includes('Beam penetration coordination'));
    expect(JSON.parse(options.body)).toMatchObject({
      project_id: 7, project_location_id: 17, work_package_id: 23,
      cost_impact: 1400.5, schedule_impact_days: 3,
    });
  });
});
