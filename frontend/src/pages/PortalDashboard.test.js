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

  test('shows formal WIR review actions and posts the selected result to the scoped endpoint', async () => {
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ success: true, data: { status: 'approved' } }) };
      const data = String(url).includes('/reviews') ? [{
        type: 'wir', id: 34, project_id: 11, number: 'WIR-0034', title: 'WIR WIR-0034',
        status: 'consultant_review', due_date: '2026-10-14T08:00:00.000Z', drawing_reference: 'S-12 / Rev 4',
      }, {
        type: 'variation', id: 35, project_id: 11, number: 'VAR-0035', title: 'Grid C change', status: 'consultant_recommendation',
      }, {
        type: 'certificate', id: 36, project_id: 11, number: 'CERT-0036', title: 'Certificate CERT-0036', status: 'consultant_client',
      }, {
        type: 'instruction', id: 37, project_id: 11, number: 'EI-0011', title: 'Repair wall at grid C3', status: 'issued',
      }] : { project_ids: [11], latest_drawings: { items: [] } };
      return { ok: true, json: async () => ({ success: true, data }) };
    });
    await act(async () => { root.render(<PortalDashboard kind="consultant" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const action = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.review.approveWithComments'));
    expect(action).toBeTruthy();
    await act(async () => { action.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const decision = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/wirs/34/result'));
    expect(decision).toBeTruthy();
    expect(JSON.parse(decision[1].body)).toEqual({ result: 'approved_with_comments' });
    const variationRow = [...container.querySelectorAll('.portal-review-item')].find((row) => row.textContent.includes('Grid C change'));
    const recommendationButton = [...variationRow.querySelectorAll('button')].find((button) => button.textContent.includes('portals.review.recommendApprove'));
    await act(async () => { recommendationButton.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const recommendation = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/variations/35/recommendation'));
    expect(recommendation).toBeTruthy();
    expect(JSON.parse(recommendation[1].body)).toEqual({ decision: 'approve' });
    const certificateRow = [...container.querySelectorAll('.portal-review-item')].find((row) => row.textContent.includes('CERT-0036'));
    const rejectButton = [...certificateRow.querySelectorAll('button')].find((button) => button.textContent.includes('portals.review.recommendReject'));
    await act(async () => { rejectButton.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const certificateDecision = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/payment-certificates/36/recommendation'));
    expect(certificateDecision).toBeTruthy();
    expect(JSON.parse(certificateDecision[1].body)).toEqual({ decision: 'reject' });
    const instructionRow = [...container.querySelectorAll('.portal-review-item')].find((row) => row.textContent.includes('Repair wall at grid C3'));
    const instructionDecisionButton = [...instructionRow.querySelectorAll('button')].find((button) => button.textContent.includes('portals.review.recommendApprove'));
    await act(async () => { instructionDecisionButton.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const instructionDecision = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/instructions/37/recommendation'));
    expect(instructionDecision).toBeTruthy();
    expect(JSON.parse(instructionDecision[1].body)).toEqual({ decision: 'approve' });
  });
});
