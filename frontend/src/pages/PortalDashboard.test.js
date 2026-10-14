import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PortalDashboard from './PortalDashboard';

jest.mock('../hooks/useLocale', () => ({ useLocale: () => ({
  t: (key, options) => Object.entries(options || {}).reduce((result, [name, value]) => result.replaceAll(`{{${name}}}`, value), key),
  locale: 'en',
}) }));
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

  test('uses catalog labels for portal widgets and shared enum translation for record status', async () => {
    global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => ({ success: true, data: String(url).includes('/reviews') ? [] : {
      latest_drawings: { items: [{ id: 9, title: 'Drawing A', status: 'pending_approval' }], count: 1 },
    } }) }));
    await act(async () => { root.render(<PortalDashboard kind="consultant" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.textContent).toContain('portals.dashboard.widgets.latest_drawings');
    expect(container.textContent).toContain('enums.status.pendingApproval');
    expect(container.textContent).not.toContain('Latest Drawings');
    expect(container.textContent).not.toContain('Pending Approval');
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
        type: 'rfi', id: 33, project_id: 11, number: 'RFI-0033', title: 'Beam penetration', status: 'submitted',
        location_id: 17, work_package_id: 18, cost_impact: 1400.5, schedule_impact_days: 3,
      }, {
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
    const rfiRow = [...container.querySelectorAll('.portal-review-item')].find((row) => row.textContent.includes('Beam penetration'));
    expect(rfiRow.textContent).toContain('portals.review.rfiLocation');
    expect(rfiRow.textContent).toContain('portals.review.rfiWorkPackage');
    expect(rfiRow.textContent).toContain('portals.review.rfiCostImpact');
    expect(rfiRow.textContent).toContain('portals.review.rfiScheduleImpact');
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

  test('client action center posts variation decisions and document acknowledgements', async () => {
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ success: true, data: {} }) };
      const data = String(url).includes('/action-center') ? {
        variation_responses: { items: [{ id: 81, project_id: 11, title: 'Facade variation', amount: 12000 }] },
        document_acknowledgements: { items: [{ id: 82, project_id: 12, title: 'Approved handover manual' }] },
        approvals: { items: [] }, overdue_inputs: { items: [] },
      } : String(url).includes('/portfolio') ? { is_portfolio: true, items: [] } : { project_ids: [11, 12], projects: [{ id: 11 }, { id: 12 }] };
      return { ok: true, json: async () => ({ success: true, data }) };
    });
    await act(async () => { root.render(<PortalDashboard kind="client" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const variationRow = [...container.querySelectorAll('.portal-review-item')].find((row) => row.textContent.includes('Facade variation'));
    const approve = [...variationRow.querySelectorAll('button')].find((button) => button.textContent.includes('portals.clientActions.approve'));
    await act(async () => { approve.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const variationDecision = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/variations/81/response'));
    expect(variationDecision).toBeTruthy();
    expect(JSON.parse(variationDecision[1].body)).toEqual({ decision: 'approve' });
    const documentRow = [...container.querySelectorAll('.portal-review-item')].find((row) => row.textContent.includes('Approved handover manual'));
    const acknowledge = [...documentRow.querySelectorAll('button')].find((button) => button.textContent.includes('portals.clientActions.acknowledge'));
    await act(async () => { acknowledge.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const documentAcknowledgement = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/documents/82/acknowledgement'));
    expect(documentAcknowledgement).toBeTruthy();
    expect(JSON.parse(documentAcknowledgement[1].body)).toEqual({});
  });

  test('subcontractor can submit a scoped variation quote and see submission history', async () => {
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ success: true, data: { id: 61 } }) };
      if (String(url).includes('/submissions')) return { ok: true, json: async () => ({ success: true, data: {
        items: [{ id: 60, project_id: 8, submission_type: 'manpower', status: 'submitted', payload: { worker_count: 9 } }], count: 1,
      } }) };
      return { ok: true, json: async () => ({ success: true, data: {
        project_ids: [8], packages: [{ id: 31, project_id: 8, contract_number: 'SC-31' }],
        wirs: { count: 1, items: [{ id: 44, project_id: 8, wir_number: 'WIR-0044', status: 'consultant_review', inspection_date: '2026-10-12' }] },
        variations: { items: [{ id: 55, project_id: 8, sub_contract_id: 31, title: 'Access platform change' }] },
        ncrs: { items: [] }, observations: { items: [] },
      } }) };
    });
    await act(async () => { root.render(<PortalDashboard kind="subcontractor" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('portals.submissions.types.manpower');
    expect(container.textContent).toContain('WIR-0044');
    expect(container.textContent).toContain('portals.inspections.status.consultant_review');
    const open = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.submissions.new'));
    await act(async () => { open.click(); });
    const typeSelect = container.querySelector('.portal-observation-form select');
    await act(async () => {
      typeSelect.value = 'variation_quote';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const relatedSelect = [...container.querySelectorAll('.portal-observation-form select')].find((select) => [...select.options].some((option) => option.value === '55'));
    await act(async () => { relatedSelect.value = '55'; relatedSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    await fill('.portal-observation-form input[type="number"]', '1550.45');
    await fill('.portal-observation-form textarea', 'Additional scaffold required');
    await act(async () => { container.querySelector('.portal-observation-form button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const decision = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/submissions/variation_quote'));
    expect(decision).toBeTruthy();
    expect(JSON.parse(decision[1].body)).toEqual({ project_id: 8, payload: {
      sub_contract_id: 31, related_entity_id: 55, quoted_amount: 1550.45, schedule_impact_days: 0, note: 'Additional scaffold required',
    } });
  });

  test('subcontractor RFI form derives project and package from the assigned package list', async () => {
    global.fetch = jest.fn(async (url, options = {}) => options.method === 'POST'
      ? { ok: true, json: async () => ({ success: true, data: { id: 71 } }) }
      : { ok: true, json: async () => ({ success: true, data: { project_ids: [8], packages: [
        { id: 31, project_id: 8, contract_number: 'SC-31' }, { id: 32, project_id: 9, contract_number: 'SC-32' },
      ] } }) });
    await act(async () => { root.render(<PortalDashboard kind="subcontractor" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const open = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.formalSubmission.newRfi'));
    await act(async () => { open.click(); });
    const form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.formalSubmission.rfiTitle'));
    await fill('form select', '32');
    await fill('form input[maxlength="255"]', 'Clarify beam detail');
    await fill('form textarea', 'Confirm the reinforcement detail at grid D4.');
    const formSelects = form.querySelectorAll('select');
    await act(async () => { formSelects[1].value = 'high'; formSelects[1].dispatchEvent(new Event('change', { bubbles: true })); });
    await fill('form input[type="date"]', '2026-10-22');
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [, options] = global.fetch.mock.calls.find(([, request]) => request.method === 'POST');
    expect(JSON.parse(options.body)).toEqual({
      project_id: 9, sub_contract_id: 32, subject: 'Clarify beam detail',
      question: 'Confirm the reinforcement detail at grid D4.', priority: 'high', due_date: '2026-10-22',
    });
  });

  test('subcontractor submittal form supports the formal type and recipient fields', async () => {
    global.fetch = jest.fn(async (url, options = {}) => options.method === 'POST'
      ? { ok: true, json: async () => ({ success: true, data: { id: 72 } }) }
      : { ok: true, json: async () => ({ success: true, data: { project_ids: [8], packages: [
        { id: 31, project_id: 8, contract_number: 'SC-31' },
      ] } }) });
    await act(async () => { root.render(<PortalDashboard kind="subcontractor" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const open = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.formalSubmission.newSubmittal'));
    await act(async () => { open.click(); });
    const form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.formalSubmission.submittalTitle'));
    await fill('form input[name="title"]', 'Pump room shop drawing');
    await fill('form input[name="submitted_to"]', 'Consultant');
    const select = form.querySelectorAll('select')[1];
    await act(async () => { select.value = 'shop_drawing'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const [, options] = global.fetch.mock.calls.find(([, request]) => request.method === 'POST');
    expect(JSON.parse(options.body)).toEqual({
      project_id: 8, sub_contract_id: 31, title: 'Pump room shop drawing',
      submittal_type: 'shop_drawing', submitted_to: 'Consultant',
    });
  });

  test('RFI acknowledgement and returned submittal resubmission select scoped records', async () => {
    global.fetch = jest.fn(async (url, options = {}) => options.method === 'POST'
      ? { ok: true, json: async () => ({ success: true, data: { id: 73 } }) }
      : { ok: true, json: async () => ({ success: true, data: {
        project_ids: [8], packages: [{ id: 31, project_id: 8, contract_number: 'SC-31' }],
        rfis: { items: [{ id: 81, rfi_number: 'RFI-81', subject: 'Rebar splice detail' }] },
        submittals_for_resubmission: { items: [{ id: 82, submittal_number: 'SUB-82', title: 'Waterproofing method' }] },
      } }) });
    await act(async () => { root.render(<PortalDashboard kind="subcontractor" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const acknowledge = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.recordActions.acknowledgeRfi'));
    await act(async () => { acknowledge.click(); });
    let form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.recordActions.acknowledgeRfi'));
    await fill('form select', '81');
    await fill('form textarea', 'Acknowledged; proceed with the approved detail.');
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    let post = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/rfis/81/acknowledge'));
    expect(JSON.parse(post[1].body)).toEqual({ body: 'Acknowledged; proceed with the approved detail.' });

    const resubmit = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.recordActions.resubmitSubmittal'));
    await act(async () => { resubmit.click(); });
    form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.recordActions.resubmitSubmittal'));
    await fill('form select', '82');
    await fill('form textarea', 'Updated membrane thickness and method steps.');
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    post = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/submittals/82/resubmit'));
    expect(JSON.parse(post[1].body)).toEqual({ comments: 'Updated membrane thickness and method steps.' });
  });

  test('package acknowledgements, instructions, quantities and payment applications use dashboard choices and validated fields', async () => {
    global.fetch = jest.fn(async (url, options = {}) => options.method === 'POST'
      ? { ok: true, json: async () => ({ success: true, data: { id: 74 } }) }
      : { ok: true, json: async () => ({ success: true, data: {
        project_ids: [8], packages: [{ id: 31, project_id: 8, contract_number: 'SC-31', boq_item_id: 901, acknowledged_at: null }],
        instructions_for_acknowledgement: { items: [{ id: 70, project_id: 8, instruction_number: 'EI-70', title: 'Protect slab edge' }] },
      } }) });
    await act(async () => { root.render(<PortalDashboard kind="subcontractor" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const openPackage = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.recordActions.acknowledgePackage'));
    await act(async () => { openPackage.click(); });
    let form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.recordActions.acknowledgePackage'));
    await fill('form select', '31');
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(global.fetch.mock.calls.some(([url, options]) => options.method === 'POST' && String(url).includes('/contracts/31/acknowledge'))).toBe(true);

    const openInstruction = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.recordActions.acknowledgeInstruction'));
    await act(async () => { openInstruction.click(); });
    form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.recordActions.acknowledgeInstruction'));
    await fill('form select', '70'); await fill('form textarea', 'Received and understood.');
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    let post = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/instructions/70/acknowledge'));
    expect(JSON.parse(post[1].body)).toEqual({ project_id: 8, response: 'Received and understood.' });

    const openQuantity = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.recordActions.claimQuantity'));
    await act(async () => { openQuantity.click(); });
    form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.recordActions.claimQuantity'));
    await fill('form select', '31'); await fill('form input[type="date"]', '2026-10-01');
    const dates = form.querySelectorAll('input[type="date"]');
    await act(async () => { dates[1].value = '2026-10-15'; dates[1].dispatchEvent(new Event('input', { bubbles: true })); dates[1].dispatchEvent(new Event('change', { bubbles: true })); });
    await fill('form input[type="number"]', '12.5'); await fill('form textarea', 'Installed on level two.');
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    post = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).endsWith('/quantities'));
    expect(JSON.parse(post[1].body)).toMatchObject({ sub_contract_id: 31, boq_item_id: 901, quantity_claimed: 12.5, notes: 'Installed on level two.' });

    const openPayment = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.recordActions.paymentApplication'));
    await act(async () => { openPayment.click(); });
    form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.recordActions.paymentApplication'));
    await fill('form select', '31'); await fill('form input[type="date"]', '2026-10-01');
    const paymentDates = form.querySelectorAll('input[type="date"]');
    await act(async () => { paymentDates[1].value = '2026-10-15'; paymentDates[1].dispatchEvent(new Event('input', { bubbles: true })); paymentDates[1].dispatchEvent(new Event('change', { bubbles: true })); });
    await fill('form input[type="number"]', '5000');
    await fill('form input[name="retention"]', '250');
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    post = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).endsWith('/payment-applications'));
    expect(JSON.parse(post[1].body)).toMatchObject({ project_id: 8, sub_contract_id: 31, work_value: 5000, retention: 250 });
  });

  test('supplier compliance panel labels expired and near-expiry documents', async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, data: {
      project_ids: [8], inspections: { count: 1, items: [{ id: 8, project_id: 8, mir_number: 'MIR-0008', status: 'accepted' }] },
      expiring_documents: { count: 2, items: [
        { id: 1, document_type: 'Insurance', expiry_date: '2026-10-10', alert_state: 'expired', days_remaining: -3 },
        { id: 2, document_type: 'Quality certificate', expiry_date: '2026-10-20', alert_state: 'expires_soon', days_remaining: 7 },
      ] },
    } }) }));
    await act(async () => { root.render(<PortalDashboard kind="supplier" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('portals.compliance.title');
    expect(container.textContent).toContain('portals.compliance.status.expired');
    expect(container.textContent).toContain('portals.compliance.status.expires_soon');
    expect(container.textContent).toContain('MIR-0008');
    expect(container.textContent).toContain('portals.inspections.status.accepted');
  });

  test('supplier quotation selects a dashboard RFQ and submits validated line pricing', async () => {
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') return { ok: true, json: async () => ({ success: true, data: { id: 12 } }) };
      const data = String(url).includes('/rfqs/41')
        ? { id: 41, supplier_ids: [7], lines: [{ id: 51, description: 'C35 concrete', quantity: 3, unit: 'm3' }] }
        : { open_rfqs: { items: [{ id: 41, rfq_number: 'RFQ-0041', title: 'Concrete package' }] }, awarded_pos: { items: [] } };
      return { ok: true, json: async () => ({ success: true, data }) };
    });
    await act(async () => { root.render(<PortalDashboard kind="supplier" />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const action = [...container.querySelectorAll('button')].find((button) => button.textContent.includes('portals.quickActions.submitQuotation'));
    await act(async () => { action.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.textContent).toContain('RFQ-0041');
    const form = [...container.querySelectorAll('form')].find((node) => node.textContent.includes('portals.quickActions.quoteRfq'));
    await fill('form input[type="number"]', '185.25');
    await act(async () => { form.querySelector('button[type="submit"]').click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const post = global.fetch.mock.calls.find(([url, options]) => options.method === 'POST' && String(url).includes('/quotations'));
    expect(String(post[0])).toContain('/rfqs/41/quotations');
    expect(JSON.parse(post[1].body)).toEqual({ supplier_id: 7, lines: [{ rfq_line_id: 51, quantity: 3, unit_price: 185.25 }] });
  });
});
