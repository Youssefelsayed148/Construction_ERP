import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Handover from './Handover';

jest.mock('../hooks/useLocale', () => {
  const t = (key) => key;
  return { useLocale: () => ({ locale: 'en', t }) };
});
jest.mock('../components/DocumentUpload', () => function MockDocumentUpload({ onUploaded }) {
  return <button type="button" data-testid="mock-upload" onClick={() => onUploaded({ original_name: 'evidence.pdf', file_url: '/uploads/evidence.pdf', file_type: 'pdf', file_size_bytes: 12 })}>Mock uploaded file</button>;
});
jest.mock('../components/ProtectedMedia', () => ({ openProtectedFile: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('Handover documents and warranty register', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async (url, options = {}) => {
      const path = String(url);
      if (path.includes('/handover/process/')) return { ok: true, json: async () => ({ data: { process: null, readiness: { percent: 0, items_total: 1, items_complete: 0, open_punch_items: 0 } } }) };
      if (path.includes('/handover/package/7')) return { ok: true, json: async () => ({ data: { items: [{ id: 22, title: 'Commissioning evidence', status: 'pending' }], readiness: {} } }) };
      if (path.includes('/handover/assets?')) return { ok: true, json: async () => ({ data: [{ id: 31, asset_code: 'AS-31', name: 'Chiller' }] }) };
      if (path.includes('/handover/claims')) return { ok: true, json: async () => ({ data: [] }) };
      if (path.includes('/handover/warranties')) return { ok: true, json: async () => ({ data: [] }) };
      if (path.endsWith('/docs/documents') && options.method === 'POST') return { ok: true, json: async () => ({ data: { id: 901 } }) };
      return { ok: true, json: async () => ({ data: {} }) };
    });
    window.localStorage.setItem('token', 'test-token');
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); global.fetch = previousFetch; window.localStorage.clear(); });

  const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  const fill = async (node, value) => act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value').set;
    setter.call(node, value);
    node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  const renderPage = async () => {
    await act(async () => { root.render(<MemoryRouter initialEntries={['/projects/7/handover']}><Routes><Route path="/projects/:id/handover" element={<Handover />} /></Routes></MemoryRouter>); });
    await flush();
  };

  test('uploads controlled package evidence and creates a dated warranty linked to its asset and document', async () => {
    await renderPage();
    const packageTab = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('Handover package'));
    await act(async () => { packageTab.click(); });
    const uploadEvidence = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('handover.uploadEvidence'));
    await act(async () => { uploadEvidence.click(); });
    await act(async () => { container.querySelector('[data-testid="mock-upload"]').click(); });
    await flush();
    const packageUpdate = global.fetch.mock.calls.find(([url, request]) => String(url).endsWith('/handover/package/items/22') && request.method === 'PUT');
    expect(JSON.parse(packageUpdate[1].body)).toMatchObject({ project_document_id: 901, status: 'uploaded' });
    const documentCreate = global.fetch.mock.calls.find(([url, request]) => String(url).endsWith('/docs/documents'));
    expect(JSON.parse(documentCreate[1].body)).toMatchObject({ project_id: 7, title: 'Commissioning evidence', confidentiality: 'internal', portal_visibility: 'internal' });

    const warrantiesTab = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('handover.warranties'));
    await act(async () => { warrantiesTab.click(); });
    const newWarranty = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('handover.newWarranty'));
    await act(async () => { newWarranty.click(); });
    const fields = container.querySelectorAll('form input');
    await fill(fields[0], 'Chiller warranty');
    await fill(fields[1], 'Cooling Systems');
    await fill(fields[2], '2026-01-01');
    await fill(fields[3], '2028-01-01');
    const assetSelect = container.querySelector('form select');
    await fill(assetSelect, '31');
    const upload = container.querySelector('form [data-testid="mock-upload"]');
    await act(async () => { upload.click(); });
    await flush();
    const save = [...container.querySelectorAll('form button')].find((button) => button.textContent.includes('common.save'));
    await act(async () => { save.click(); });
    await flush();
    const warrantyCreate = global.fetch.mock.calls.find(([url, request]) => String(url).endsWith('/handover/warranties') && request.method === 'POST');
    expect(JSON.parse(warrantyCreate[1].body)).toMatchObject({
      project_id: 7, title: 'Chiller warranty', issuer: 'Cooling Systems', asset_id: 31,
      start_date: '2026-01-01', end_date: '2028-01-01', project_document_id: 901,
    });
  });
});
