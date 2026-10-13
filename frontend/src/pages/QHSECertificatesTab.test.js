import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import QHSECertificatesTab from './QHSECertificatesTab';

global.IS_REACT_ACT_ENVIRONMENT = true;

describe('QA/QC certificate register', () => {
  let container; let root; let previousFetch;
  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ success: true, data: { id: 9 } }) };
      if (options.method === 'PUT') return { ok: true, json: async () => ({ success: true, data: { id: 9, status: 'revoked' } }) };
      return { ok: true, json: async () => ({ success: true, data: [{
        id: 9, certificate_number: 'QC-CERT-00001', certificate_type: 'material', title: 'Concrete test certificate',
        expiry_date: '2027-10-01', status: 'active', project_document_id: 4, document_title: 'Lab report', mir_id: 3, mir_number: 'MIR-003',
      }] }) };
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

  test('creates a certificate with linked project records and displays register links', async () => {
    await act(async () => { root.render(<QHSECertificatesTab projectId="7" t={(key) => key} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('QC-CERT-00001');
    expect(container.textContent).toContain('qhse.certificates.documentLink');
    expect(container.textContent).toContain('qhse.certificates.mirLink');

    await fill('input[name="title"]', 'Concrete lab result');
    await fill('input[name="issuer"]', 'Lab A');
    await fill('input[name="project_document_id"]', '4');
    await fill('input[name="mir_id"]', '3');
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [, options] = global.fetch.mock.calls.find(([, request]) => request.method === 'POST');
    expect(JSON.parse(options.body)).toMatchObject({
      project_id: 7, certificate_type: 'material', title: 'Concrete lab result', issuer: 'Lab A',
      project_document_id: 4, mir_id: 3, issue_date: null, expiry_date: null,
    });
  });

  test('supports superseding or revoking an active certificate', async () => {
    await act(async () => { root.render(<QHSECertificatesTab projectId="7" t={(key) => key} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const revoke = [...container.querySelectorAll('button')].find((button) => button.textContent === 'qhse.certificates.revoke');
    await act(async () => { revoke.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [, options] = global.fetch.mock.calls.find(([, request]) => request.method === 'PUT');
    expect(JSON.parse(options.body)).toEqual({ status: 'revoked' });
  });
});
