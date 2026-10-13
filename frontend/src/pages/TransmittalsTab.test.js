import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { TransmittalsTab } from './DocControlExtended';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('project transmittal form', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ success: true, data: { id: 81 } }) };
      if (String(url).includes('/transmittal-recipients')) return { ok: true, json: async () => ({ success: true, data: [{ id: 30, name: 'Client Org' }] }) };
      if (String(url).includes('/docs/documents')) return { ok: true, json: async () => ({ success: true, data: [{ id: 44, title: 'Structural drawing', doc_number: 'P7-STR-DWG-0001-R0' }] }) };
      if (String(url).includes('/docs/transmittals')) return { ok: true, json: async () => ({ success: true, data: [{
        id: 80, transmittal_number: 'TRO-2026-0001', direction: 'outgoing', recipient_organization_name: 'Client Org',
        purpose: 'For review', item_count: 1, status: 'draft',
      }] }) };
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

  test('loads recipients/documents and submits them as scoped transmittal records', async () => {
    await act(async () => { root.render(<TransmittalsTab projectId="7" locale="en" t={(key) => key} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('Client Org');
    expect(container.textContent).toContain('1');

    const open = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('documentControl.transmittalForm.new'));
    await act(async () => { open.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await fill('form input', 'For consultant review');
    const selects = container.querySelectorAll('form select');
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(selects[1]), 'value').set;
      set.call(selects[1], '30'); selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      selects[2].options[0].selected = true;
      selects[2].dispatchEvent(new Event('change', { bubbles: true }));
    });
    const save = [...container.querySelectorAll('form button[type="submit"]')][0];
    await act(async () => { save.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [, options] = global.fetch.mock.calls.find(([url, request]) => request.method === 'POST' && String(url).endsWith('/docs/transmittals'));
    expect(JSON.parse(options.body)).toMatchObject({
      project_id: 7, recipient_organization_id: 30, purpose: 'For consultant review', items: [{ document_id: 44 }],
    });
  });
});
