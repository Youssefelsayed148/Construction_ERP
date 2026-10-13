import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PortalDashboard from './PortalDashboard';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({ t: (key, options) => options?.id ? key.replace('{{id}}', options.id) : key, locale: 'en' }) }));
jest.mock('../components/DocumentUpload', () => function MockDocumentUpload({ label, onUploaded }) {
  return <button type="button" onClick={() => onUploaded([{ original_name: 'evidence.jpg', file_url: '/uploads/owned-evidence.jpg' }])}>{label}</button>;
});
jest.mock('../components/ProtectedMedia', () => ({ openProtectedFile: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('consultant portal observation form', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ success: true, data: { id: 9 } }) };
      const data = String(url).includes('/reviews') ? [] : {
        project_ids: [11], latest_drawings: { items: [{ id: 91, project_id: 11, title: 'S-12 Rev 4' }] },
      };
      return { ok: true, json: async () => ({ success: true, data }) };
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

  test('submits a project-scoped observation with dates, a drawing link, and separate evidence', async () => {
    await act(async () => { root.render(<PortalDashboard kind="consultant" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const raise = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.observation.raise'));
    await act(async () => { raise.click(); });
    await fill('input[maxlength="255"]', 'Crack at grid C3');
    await fill('textarea', 'Review before handover');
    await fill('input[type="date"]', '2026-10-20');
    const selects = container.querySelectorAll('form select');
    await act(async () => {
      selects[0].value = '11'; selects[0].dispatchEvent(new Event('change', { bubbles: true }));
      selects[1].value = '91'; selects[1].dispatchEvent(new Event('change', { bubbles: true }));
      selects[2].value = 'high'; selects[2].dispatchEvent(new Event('change', { bubbles: true }));
    });
    const uploadButtons = [...container.querySelectorAll('.portal-observation-form button[type="button"]')].filter((button) => button.textContent.includes('portals.observation.'));
    await act(async () => { uploadButtons[0].click(); uploadButtons[1].click(); });
    await act(async () => { container.querySelector('.portal-observation-form button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const [, options] = global.fetch.mock.calls.find(([, request]) => request.method === 'POST');
    expect(JSON.parse(options.body)).toMatchObject({
      project_id: 11, title: 'Crack at grid C3', description: 'Review before handover', due_date: '2026-10-20',
      drawing_document_id: 91, drawing_reference: 'S-12 Rev 4',
      before_photos: [{ file_name: 'owned-evidence.jpg', file_url: '/uploads/owned-evidence.jpg', caption: 'evidence.jpg' }],
      after_photos: [{ file_name: 'owned-evidence.jpg', file_url: '/uploads/owned-evidence.jpg', caption: 'evidence.jpg' }],
    });
  });
});
